"""Places the confirmed labels of the 33 targets without an exact ring fit onto their photos.

    ml/.venv/bin/python ml/register_labels.py

For these targets the labels are millimetres from a circle the athlete confirmed but that was not kept, so on the
automatically rectified image the labels can sit a few millimetres off (a shift, and a scale if the circle was a little
big or small, or the photo's perspective was fitted a little differently). One transform per target (a shift and scale,
then refined as an affine map) is fitted so the labels land on the holes the model from the first experiment (trained
only on the 11 exactly-registered targets) finds. Only the whole target moves; no single label is ever pulled toward a
detection. A target where fewer than 7 of 10 labels end up on a detection is marked unreliable and is not trained on
(it is still scored, with its original labels, so the comparison with the baseline keeps every target).

An earlier attempt aligned the photos to a clean-sheet template made from the printed rings. It was checked on the 11
targets whose answer is known and made 5 of them worse, because the printed rings do not fix the frame of the athlete's
confirmed circle, so it was dropped.
"""
import json, math, os, sys
import numpy as np
import torch

sys.path.insert(0, 'ml')
from train import Net, DEV, load, predict, peaks, PX_PER_MM  # noqa: E402

DATA = 'ml/data'
TOL_PX = 1.5 * 4          # a label counts as on a detection within 1.5 mm
SIGMA_PX = 3 * 4


def score_grid(labels, dets, c, scales, shifts):
    """Soft agreement between transformed labels and detections for every (scale, dx, dy)."""
    best = (-1e9, 1.0, 0.0, 0.0)
    for s in scales:
        L = c + s * (labels - c)                                          # (n, 2)
        pos = L[None, None] + shifts[:, :, None, :]                       # (a, b, n, 2)
        d2 = ((pos[:, :, :, None, :] - dets[None, None, None]) ** 2).sum(-1)   # (a, b, n, nd)
        agree = np.exp(-d2.min(-1) / (2 * SIGMA_PX ** 2)).sum(-1)          # (a, b)
        pen = 0.15 * ((shifts ** 2).sum(-1) / (10 * PX_PER_MM) ** 2) + 0.5 * ((s - 1) / 0.05) ** 2
        val = agree - pen
        iy, ix = np.unravel_index(np.argmax(val), val.shape)
        if val[iy, ix] > best[0]:
            best = (float(val[iy, ix]), float(s), float(shifts[iy, ix, 0]), float(shifts[iy, ix, 1]))
    return best


def affine_icp(labels, dets, c, start_moved, iters=12):
    """Refines the whole-target transform as an affine map: nearest detection to each label within a shrinking gate,
    a least-squares affine fit (kept close to the identity), repeated. Returns the moved labels."""
    moved = start_moved.copy()
    if len(dets) < 4:
        return moved
    lam = 0.5
    for k in range(iters):
        gate = max(2.0, 8.0 - 0.6 * k) * PX_PER_MM
        d = np.sqrt(((moved[:, None] - dets[None]) ** 2).sum(-1))
        nn = d.argmin(1)
        ok = d[np.arange(len(moved)), nn] < gate
        if ok.sum() < 4:
            break
        src, dst = moved[ok] - c, dets[nn[ok]] - c
        A = np.hstack([src, np.ones((len(src), 1))])                 # x' = A @ M
        reg = np.vstack([np.eye(2) * lam * PX_PER_MM, np.zeros((1, 2))])
        # ridge toward "no change": minimise |A M - dst|^2 + lam |M - M0|^2 with M0 the identity map
        M0 = np.vstack([np.eye(2), np.zeros((1, 2))])
        M = np.linalg.solve(A.T @ A + lam * np.eye(3), A.T @ dst + lam * M0)
        moved = (np.hstack([moved - c, np.ones((len(moved), 1))]) @ M) + c
    return moved


def matched(labels, dets):
    if len(dets) == 0:
        return 0
    d = np.sqrt(((labels[:, None] - dets[None]) ** 2).sum(-1)).min(1)
    return int((d < TOL_PX).sum())


def main():
    man = json.load(open(os.path.join(DATA, 'manifest.json')))
    net = Net().to(DEV)
    net.load_state_dict(torch.load('ml/runs/final-v1.pt', map_location=DEV))
    net.eval()
    rows = []
    for it in man['items']:
        if not it['auto'] or it['exact']:
            continue
        img = load(it['auto']['image'])
        dets = np.array([[x, y] for x, y, _ in peaks(predict(net, img), 0.4)], dtype=np.float32).reshape(-1, 2)
        labels = np.array([[p['u'], p['v']] for p in it['auto']['truth']], dtype=np.float32)
        c = it['auto']['size'] / 2
        before = matched(labels, dets)
        # coarse, then fine
        r = 30 * PX_PER_MM
        g = np.arange(-r, r + 1e-6, 1.0 * PX_PER_MM)
        shifts = np.stack(np.meshgrid(g, g, indexing='xy'), -1).astype(np.float32)
        _, s, dx, dy = score_grid(labels, dets, c, np.arange(0.90, 1.101, 0.02), shifts)
        g2 = np.arange(-1.0 * PX_PER_MM, 1.0 * PX_PER_MM + 1e-6, 0.25 * PX_PER_MM)
        shifts2 = np.stack(np.meshgrid(g2 + dx, g2 + dy, indexing='xy'), -1).astype(np.float32)
        _, s, dx, dy = score_grid(labels, dets, c, np.arange(s - 0.02, s + 0.0201, 0.005), shifts2)
        moved = c + s * (labels - c) + np.array([dx, dy], dtype=np.float32)
        moved = affine_icp(labels, dets, c, moved)
        after = matched(moved, dets)
        reliable = after >= 7
        it['aligned'] = {
            'image': it['auto']['image'], 'size': it['auto']['size'],
            'truth': [{'u': float(u), 'v': float(v)} for u, v in moved],
            'dx_mm': round(dx / PX_PER_MM, 2), 'dy_mm': round(dy / PX_PER_MM, 2), 'scale': round(s, 4),
            'matched_before': before, 'matched_after': after, 'detections': int(len(dets)), 'reliable': bool(reliable),
        }
        rows.append((it['label'], before, after, dx / PX_PER_MM, dy / PX_PER_MM, s, len(dets), reliable))
    json.dump(man, open(os.path.join(DATA, 'manifest.json'), 'w'), indent=1)
    print(f"{'target':18s} on a detection before -> after   shift (mm)        scale   dets  usable")
    for label, b, a, dx, dy, s, n, ok in sorted(rows, key=lambda r: r[2]):
        print(f'{label:18s} {b:2d} -> {a:2d}                  ({dx:5.1f},{dy:5.1f})   {s:.3f}   {n:3d}   {"yes" if ok else "NO"}')
    print(f'\n{sum(r[7] for r in rows)} of {len(rows)} usable; labels on a detection: '
          f'{sum(r[1] for r in rows)}/{10 * len(rows)} before, {sum(r[2] for r in rows)}/{10 * len(rows)} after')


if __name__ == '__main__':
    main()
