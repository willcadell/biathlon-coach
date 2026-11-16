"""Trains and scores a small hole-finding network on the rectified target images from ml/export_dataset.ts.

    ml/.venv/bin/python ml/train.py cv      # 5-fold cross-validation over the targets with an exact ring fit
    ml/.venv/bin/python ml/train.py final   # train on all of them, score on the targets it never saw

The network reads a rectified grayscale target (4 px per mm) and outputs a heatmap of hole centres at half
resolution. Peaks are the holes. Training sees only targets whose ring fit the athlete confirmed (their labels line up
exactly), with random scale, rotation, mirroring, lighting, blur and noise, plus hole patches pasted onto other
sheets. Scoring uses the *automatic* ring fit the app computes, as the app would, and the same found / missed /
invented measure as test/cv-eval.ts, so the baseline detector is compared on identical targets.
"""
import argparse, json, math, os, random, sys, time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

DATA = 'ml/data'
PX_PER_MM = 4.0
STRIDE = 2                  # heatmap cell = 2 px
CROP = 256                  # training window, px
SIGMA = 2.5                 # heatmap blob, in cells
DEV = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')


def load(path):
    return np.asarray(Image.open(os.path.join(DATA, path)).convert('L'), dtype=np.float32) / 255.0


class Net(nn.Module):
    def __init__(self, c=16):
        super().__init__()
        def blk(i, o):
            return nn.Sequential(
                nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
                nn.Conv2d(o, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True))
        self.e1, self.e2, self.e3, self.e4 = blk(1, c), blk(c, 2 * c), blk(2 * c, 4 * c), blk(4 * c, 4 * c)
        self.up3, self.d3 = nn.ConvTranspose2d(4 * c, 4 * c, 2, stride=2), blk(8 * c, 2 * c)
        self.up2, self.d2 = nn.ConvTranspose2d(2 * c, 2 * c, 2, stride=2), blk(4 * c, c)
        self.out = nn.Conv2d(c, 1, 1)

    def forward(self, x):
        x1 = self.e1(x)
        x2 = self.e2(F.max_pool2d(x1, 2))
        x3 = self.e3(F.max_pool2d(x2, 2))
        x4 = self.e4(F.max_pool2d(x3, 2))
        d3 = self.d3(torch.cat([self.up3(x4), x3], 1))
        d2 = self.d2(torch.cat([self.up2(d3), x2], 1))
        return self.out(d2)  # stride 2


# --- training data ---------------------------------------------------------------------------------------------

class Pool:
    """The exact-registered training sheets, with their hole positions (px), and a library of hole patches."""

    def __init__(self, items):
        self.imgs, self.holes = [], []
        for it in items:
            self.imgs.append(load(it['exact']['image']))
            self.holes.append(np.array([[p['u'], p['v']] for p in it['exact']['truth']], dtype=np.float32))
        self.patches = []
        R = 32  # half window, px
        for img, hs in zip(self.imgs, self.holes):
            for u, v in hs:
                x0, y0 = int(round(u)) - R, int(round(v)) - R
                if x0 < 0 or y0 < 0 or x0 + 2 * R > img.shape[1] or y0 + 2 * R > img.shape[0]:
                    continue
                self.patches.append(img[y0:y0 + 2 * R, x0:x0 + 2 * R].copy())

    def sample(self, rng, n_paste):
        k = rng.randrange(len(self.imgs))
        img, hs = self.imgs[k], self.holes[k]
        if rng.random() < 0.6 and len(hs):
            cx, cy = hs[rng.randrange(len(hs))] + np.array([rng.uniform(-110, 110), rng.uniform(-110, 110)], dtype=np.float32)
        else:
            cx, cy = rng.uniform(150, img.shape[1] - 150), rng.uniform(150, img.shape[0] - 150)
        s = rng.uniform(0.85, 1.18)            # scale error in the ring fit
        a = rng.uniform(0, 2 * math.pi)        # a target is circular: any orientation is a valid sheet
        flip = rng.random() < 0.5
        return img, hs, (cx, cy), s, a, flip


def warp(img, hs, centre, s, a, flip):
    """A CROP x CROP window of `img` rotated by a, scaled by s, optionally mirrored, and the holes inside it."""
    H, W = img.shape
    half = CROP / 2
    ys, xs = torch.meshgrid(torch.arange(CROP, dtype=torch.float32), torch.arange(CROP, dtype=torch.float32), indexing='ij')
    rx, ry = (xs + 0.5 - half), (ys + 0.5 - half)
    if flip:
        rx = -rx
    ca, sa = math.cos(a), math.sin(a)
    sx = centre[0] + (ca * rx - sa * ry) / s
    sy = centre[1] + (sa * rx + ca * ry) / s
    grid = torch.stack([(sx / W) * 2 - 1, (sy / H) * 2 - 1], -1)[None]
    out = F.grid_sample(torch.from_numpy(img)[None, None], grid, mode='bilinear', padding_mode='border', align_corners=False)[0, 0]
    pts = []
    for (u, v) in hs:
        dx, dy = (u - centre[0]) * s, (v - centre[1]) * s
        ox, oy = ca * dx + sa * dy, -sa * dx + ca * dy   # inverse rotation
        if flip:
            ox = -ox
        ox, oy = ox + half, oy + half
        if 0 <= ox < CROP and 0 <= oy < CROP:
            pts.append((ox, oy))
    return out.numpy(), pts


def paste_holes(crop, pts, patches, rng, s, n):
    """Transplants hole contrast (not the sheet underneath) from the patch library onto `crop`."""
    R = 32
    yy, xx = np.mgrid[0:2 * R, 0:2 * R]
    r = np.hypot(xx + 0.5 - R, yy + 0.5 - R)
    mask = np.clip((22 - r) / 8, 0, 1)                 # opaque inside ~14 px, gone by 22 px
    ring = (r > 24) & (r < 31)
    for _ in range(n):
        p = patches[rng.randrange(len(patches))]
        bg = np.median(p[ring])
        delta = (p - bg) * mask
        t = torch.from_numpy(delta)[None, None]
        size = max(16, int(round(2 * R * s)))
        t = F.interpolate(t, size=(size, size), mode='bilinear', align_corners=False)[0, 0].numpy()
        m = F.interpolate(torch.from_numpy(mask.astype(np.float32))[None, None], size=(size, size), mode='bilinear', align_corners=False)[0, 0].numpy()
        t = np.rot90(t, rng.randrange(4)).copy()
        for _try in range(10):
            x = rng.uniform(size, CROP - size)
            y = rng.uniform(size, CROP - size)
            if all(math.hypot(x - px, y - py) > 36 for px, py in pts):
                x0, y0 = int(x - size / 2), int(y - size / 2)
                if x0 < 0 or y0 < 0 or x0 + size > CROP or y0 + size > CROP:
                    continue
                crop[y0:y0 + size, x0:x0 + size] = np.clip(crop[y0:y0 + size, x0:x0 + size] + t, 0, 1)
                pts.append((x, y))
                break
    return crop, pts


def heatmap(pts):
    n = CROP // STRIDE
    g = np.zeros((n, n), dtype=np.float32)
    cells = (np.arange(n, dtype=np.float32) + 0.5)
    cx, cy = np.meshgrid(cells, cells)
    for (x, y) in pts:
        hx, hy = x / STRIDE, y / STRIDE
        g = np.maximum(g, np.exp(-((cx - hx) ** 2 + (cy - hy) ** 2) / (2 * SIGMA ** 2)))
    return g


def photometric(crop, rng):
    c = crop.copy()
    c = (c - 0.5) * rng.uniform(0.7, 1.3) + 0.5 + rng.uniform(-0.12, 0.12)
    c = np.clip(c, 0, 1) ** rng.uniform(0.75, 1.3)
    if rng.random() < 0.4:                              # a little defocus
        t = torch.from_numpy(c)[None, None]
        k = rng.choice([3, 5])
        c = F.avg_pool2d(F.pad(t, (k // 2,) * 4, mode='replicate'), k, 1)[0, 0].numpy()
    c = c + np.random.default_rng(rng.randrange(1 << 30)).normal(0, rng.uniform(0, 0.03), c.shape).astype(np.float32)
    return np.clip(c, 0, 1)


def make_batch(pool, rng, bs):
    xs, ys = [], []
    for _ in range(bs):
        img, hs, centre, s, a, flip = pool.sample(rng, 0)
        crop, pts = warp(img, hs, centre, s, a, flip)
        if rng.random() < 0.5 and pool.patches:
            crop, pts = paste_holes(crop, pts, pool.patches, rng, s, rng.randint(1, 4))
        crop = photometric(crop, rng)
        xs.append((crop - 0.5) / 0.25)
        ys.append(heatmap(pts))
    return (torch.from_numpy(np.stack(xs))[:, None].to(DEV), torch.from_numpy(np.stack(ys))[:, None].to(DEV))


def train(items, steps, seed, log=True):
    rng = random.Random(seed)
    torch.manual_seed(seed)
    pool = Pool(items)
    net = Net().to(DEV)
    opt = torch.optim.AdamW(net.parameters(), lr=2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=steps, pct_start=0.15)
    t0 = time.time()
    for step in range(steps):
        x, y = make_batch(pool, rng, 12)
        logit = net(x)
        loss = (F.binary_cross_entropy_with_logits(logit, y, reduction='none') * (1 + 18 * y)).mean()
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if log and (step % 100 == 0 or step == steps - 1):
            print(f'  step {step:4d}/{steps} loss {loss.item():.4f}  ({time.time() - t0:.0f}s)', flush=True)
    net.eval()
    return net


# --- scoring ---------------------------------------------------------------------------------------------------

@torch.no_grad()
def predict(net, img):
    H, W = img.shape
    ph, pw = (-H) % 8, (-W) % 8
    x = torch.from_numpy((img - 0.5) / 0.25)[None, None]
    x = F.pad(x, (0, pw, 0, ph), mode='replicate').to(DEV)
    p = torch.sigmoid(net(x))[0, 0].cpu().numpy()
    return p[: H // STRIDE, : W // STRIDE]


def peaks(p, thresh, topk=None):
    """Local maxima of the heatmap, refined to sub-cell position, as continuous px (x, y) with scores."""
    t = torch.from_numpy(p)[None, None]
    mx = F.max_pool2d(t, 5, 1, 2)[0, 0].numpy()
    ys, xs = np.nonzero((p == mx) & (p > (thresh if topk is None else 0.15)))
    out = []
    for iy, ix in zip(ys, xs):
        y0, y1, x0, x1 = max(0, iy - 2), min(p.shape[0], iy + 3), max(0, ix - 2), min(p.shape[1], ix + 3)
        w = p[y0:y1, x0:x1]
        gy, gx = np.mgrid[y0:y1, x0:x1]
        s = w.sum()
        cx, cy = (w * (gx + 0.5)).sum() / s, (w * (gy + 0.5)).sum() / s
        out.append((cx * STRIDE, cy * STRIDE, float(p[iy, ix])))
    out.sort(key=lambda o: -o[2])
    return out[:topk] if topk else out


def match(det, truth, max_dist):
    pairs = sorted((math.hypot(d[0] - t[0], d[1] - t[1]), i, j) for i, d in enumerate(det) for j, t in enumerate(truth))
    ud, ut, errs = set(), set(), []
    for dist, i, j in pairs:
        if dist > max_dist:
            break
        if i in ud or j in ut:
            continue
        ud.add(i); ut.add(j); errs.append(dist)
    return len(errs), len(truth) - len(errs), len(det) - len(errs), errs


def score(net, item, which, thresh=0.5, topk=None):
    reg = item[which]
    img = load(reg['image'])
    det = peaks(predict(net, img), thresh, topk)
    truth = [(p['u'], p['v']) for p in reg['truth']]
    f, m, e, errs = match(det, truth, item['bulletDiameterMm'] * PX_PER_MM)
    return dict(label=item['label'], set=item['set'], reg=which, found=f, missed=m, extra=e,
                err_mm=(sum(errs) / len(errs) / PX_PER_MM) if errs else None, truth=len(truth))


def summarise(rows, name):
    t = sum(r['truth'] for r in rows); f = sum(r['found'] for r in rows); e = sum(r['extra'] for r in rows)
    errs = [r['err_mm'] for r in rows if r['err_mm'] is not None] or [float('nan')]
    return f'{name:44s} found {f:3d}/{t:3d} ({100 * f / t:3.0f}%)  invented {e:3d} ({e / len(rows):.1f}/target)  err {np.mean(errs):.2f} mm  [{len(rows)} targets]'


def baseline_rows(items):
    return [dict(label=i['label'], set=i['set'], found=i['baseline']['found'], missed=i['baseline']['missed'],
                 extra=i['baseline']['extra'], truth=i['shots'], err_mm=i['baseline'].get('errMm')) for i in items]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['cv', 'final'])
    ap.add_argument('--steps', type=int, default=1200)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--name', default=None)
    a = ap.parse_args()
    man = json.load(open(os.path.join(DATA, 'manifest.json')))
    items = [i for i in man['items'] if i['auto']]
    exact = [i for i in items if i['exact']]
    others = [i for i in items if not i['exact']]
    name = a.name or a.mode
    os.makedirs('ml/runs', exist_ok=True); os.makedirs('ml/results', exist_ok=True)
    rows = []
    print(f'device {DEV}; {len(exact)} exact-registered targets, {len(others)} never-trained targets')

    if a.mode == 'cv':
        for f in range(man['folds']):
            test = [i for i in exact if i['fold'] == f]
            tr = [i for i in exact if i['fold'] != f]
            if not test:
                continue
            print(f'fold {f}: train {len(tr)} targets, test {[t["label"] for t in test]}', flush=True)
            net = train(tr, a.steps, a.seed + f)
            for it in test:
                for which in ('auto', 'exact'):
                    rows.append(score(net, it, which))
                    rows.append({**score(net, it, which, topk=it['shots']), 'reg': which + '-topK'})
        tested = [i for i in exact]
        for which in ('auto', 'exact', 'auto-topK', 'exact-topK'):
            print(summarise([r for r in rows if r['reg'] == which], f'model, {which} ring fit'))
        print(summarise(baseline_rows(tested), 'baseline detector (auto ring fit)'))
    else:
        net = train(exact, a.steps, a.seed)
        torch.save(net.state_dict(), f'ml/runs/{name}.pt')
        for it in others:
            rows.append(score(net, it, 'auto'))
            rows.append({**score(net, it, 'auto', topk=it['shots']), 'reg': 'auto-topK'})
        for label, sel in (('all', others), ('eval photos', [i for i in others if i['set'] == 'eval']),
                           ('contributed, no exact fit', [i for i in others if i['set'] == 'contributed'])):
            ids = {i['label'] for i in sel}
            print(summarise([r for r in rows if r['reg'] == 'auto' and r['label'] in ids], f'model on {label}'))
            print(summarise([r for r in rows if r['reg'] == 'auto-topK' and r['label'] in ids], f'model on {label} (top-K)'))
            print(summarise(baseline_rows(sel), f'baseline on {label}'))
    json.dump(rows, open(f'ml/results/{name}.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
