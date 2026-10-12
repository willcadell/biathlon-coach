// Trains a "hole or not" classifier on SYNTHETIC sheets and tests it on REAL
// photos it has never seen.
//
// The app's detector already proposes candidates. For each candidate this
// builds features from the photo rectified into the flat target plane: a small
// patch of the photo, the same patch minus the clean template (so printed
// rings and numerals cancel), and a few summary numbers. A logistic regression
// learns which candidates are holes. At test time the classifier replaces the
// detector's own ranking: keep candidates it's confident in, at most ten.
//
// Held-out real set = the odd-numbered eval photos (never in the library the
// synthetic sheets were built from) + the unique contributed targets.
import { Jimp } from 'jimp'
import { readFile } from 'node:fs/promises'
import { locateBlack } from '../../src/lib/blackLocator'
import { locateHoles } from '../../src/lib/holeLocator'
import { outerRingCrop, toTargetPlane } from '../../src/lib/geometry'
import { faceById } from '../../src/lib/types'
import { ringRadii } from '../../src/lib/scoring'
import { loadEvalTargets, scoreTarget, type EvalTarget } from '../cv-eval'
import { PX_PER_MM, rectify } from './common'

const CACHE = 'node_modules/.cache/synth'
const WORK_EDGE = 640
const HOLE_WORK_EDGE = 1400
const GRID = 12
const WINDOW_MM = 20
type P = { x: number; y: number }

interface Cand { X: number; Y: number; density: number; onBlack: boolean; ambiguous: boolean }

async function candidates(target: EvalTarget): Promise<Cand[] | null> {
  const face = faceById(target.targetFaceId)
  const ringFrac = ringRadii(face).map((r) => r / (face.blackMm / 2))
  const original = await Jimp.read(target.photoPath)
  const W = original.bitmap.width, H = original.bitmap.height
  const scale = Math.min(1, WORK_EDGE / Math.max(W, H))
  const work = original.clone().resize({ w: Math.round(W * scale), h: Math.round(H * scale) })
  const black = locateBlack({ width: work.bitmap.width, height: work.bitmap.height, data: work.bitmap.data })
  if (!black) return null
  const back = 1 / scale
  const bull = {
    id: 'b', holes: [], centre: { x: (black.cx * back) / W, y: (black.cy * back) / W },
    semiMajor: (black.semiMajor * back) / W, semiMinor: (black.semiMinor * back) / W, rotationDeg: black.rotationDeg,
  }
  const rect = outerRingCrop(bull, face, W / H)
  const x0 = Math.round(rect.x0 * W), y0 = Math.round(rect.y0 * W)
  const cw = Math.max(1, Math.round((rect.x1 - rect.x0) * W)), ch = Math.max(1, Math.round((rect.y1 - rect.y0) * W))
  const hs = Math.min(1, HOLE_WORK_EDGE / Math.max(cw, ch))
  const hw = original.clone().crop({ x: x0, y: y0, w: cw, h: ch }).resize({ w: Math.round(cw * hs), h: Math.round(ch * hs) })
  const inHole = {
    cx: (black.cx * back - x0) * hs, cy: (black.cy * back - y0) * hs,
    semiMajor: black.semiMajor * back * hs, semiMinor: black.semiMinor * back * hs, rotationDeg: black.rotationDeg,
  }
  const expectedR = (target.bulletDiameterMm / 2) * (inHole.semiMajor / (face.blackMm / 2))
  const found = locateHoles(
    { width: hw.bitmap.width, height: hw.bitmap.height, data: hw.bitmap.data }, inHole, expectedR, ringFrac,
    { minDensity: 0.25, maxShots: 60 },
  )
  return found.map((h) => {
    const mm = toTargetPlane({ x: (x0 + h.cx / hs) / W, y: (y0 + h.cy / hs) / W }, bull, face.blackMm)
    return { X: mm.x, Y: mm.y, density: h.density ?? 0, onBlack: h.onBlack ?? false, ambiguous: h.ambiguous }
  })
}

function bil(img: Float32Array, size: number, x: number, y: number): number {
  const xx = Math.max(0, Math.min(size - 1.001, x)), yy = Math.max(0, Math.min(size - 1.001, y))
  const x0 = Math.floor(xx), y0 = Math.floor(yy), fx = xx - x0, fy = yy - y0
  return (img[y0 * size + x0] * (1 - fx) + img[y0 * size + x0 + 1] * fx) * (1 - fy) + (img[(y0 + 1) * size + x0] * (1 - fx) + img[(y0 + 1) * size + x0 + 1] * fx) * fy
}

function alignTo(gray: Float32Array, template: Float32Array, size: number) {
  const c = size / 2
  const score = (dx: number, dy: number, s: number) => {
    let sa = 0, sb = 0, n = 0, saa = 0, sbb = 0, sab = 0
    for (let v = 0; v < size; v += 4) for (let u = 0; u < size; u += 4) {
      if (Math.hypot(u - c, v - c) > c * 0.85) continue
      const a = bil(gray, size, c + (u - c - dx) / s, c + (v - c - dy) / s)
      const b = template[v * size + u]
      sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++
    }
    const cov = sab / n - (sa / n) * (sb / n)
    return cov / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2) + 1e-9)
  }
  let best = { sc: -2, dx: 0, dy: 0, s: 1 }
  for (const s of [0.97, 0.985, 1, 1.015, 1.03]) for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) {
    const sc = score(dx, dy, s)
    if (sc > best.sc) best = { sc, dx, dy, s }
  }
  for (let dy = best.dy - 1; dy <= best.dy + 1; dy++) for (let dx = best.dx - 1; dx <= best.dx + 1; dx++) {
    const sc = score(dx, dy, best.s)
    if (sc > best.sc) best = { sc, dx, dy, s: best.s }
  }
  return best
}

const RING_MM = ringRadii(faceById('issf-50m'))
const RAW = GRID * GRID * 2 + 8
/** Engineered columns, appended after the raw patch + summaries. */
const ENG = 2 + 5 + 5 + 4
const DIM = RAW + ENG

function features(c: Cand, aligned: Float32Array, template: Float32Array, size: number, a: { dx: number; dy: number; s: number }): number[] {
  const S = PX_PER_MM, cen = size / 2
  const u0 = cen + a.s * c.X * S + a.dx, v0 = cen - a.s * c.Y * S + a.dy
  const f: number[] = []
  const diffs: number[] = []
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const du = ((i + 0.5) / GRID - 0.5) * WINDOW_MM * S, dv = ((j + 0.5) / GRID - 0.5) * WINDOW_MM * S
    const g = bil(aligned, size, u0 + du, v0 + dv), t = bil(template, size, u0 + du, v0 + dv)
    f.push((g - t) / 255)
    diffs.push(g - t)
  }
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const du = ((i + 0.5) / GRID - 0.5) * WINDOW_MM * S, dv = ((j + 0.5) / GRID - 0.5) * WINDOW_MM * S
    f.push(bil(aligned, size, u0 + du, v0 + dv) / 255)
  }
  // summaries over the middle of the window (about a hole's footprint)
  const mid = diffs.filter((_, k) => { const i = k % GRID, j = Math.floor(k / GRID); return Math.hypot(i - GRID / 2 + 0.5, j - GRID / 2 + 0.5) < GRID * 0.3 })
  const absMean = mid.reduce((n, d) => n + Math.abs(d), 0) / mid.length
  const mean = mid.reduce((n, d) => n + d, 0) / mid.length
  const big = mid.filter((d) => Math.abs(d) > 50).length / mid.length
  const outer = diffs.filter((_, k) => { const i = k % GRID, j = Math.floor(k / GRID); return Math.hypot(i - GRID / 2 + 0.5, j - GRID / 2 + 0.5) >= GRID * 0.4 })
  const outerAbs = outer.reduce((n, d) => n + Math.abs(d), 0) / outer.length
  f.push(absMean / 255, mean / 255, big, outerAbs / 255, c.density, c.onBlack ? 1 : 0, c.ambiguous ? 1 : 0, Math.hypot(c.X, c.Y) / 100)
  // engineered: where it sits against the printed rings and axes (numerals sit on
  // the axes, between ring lines), and how the difference falls off from centre
  const rad = Math.hypot(c.X, c.Y)
  const ringDist = Math.min(...RING_MM.map((r) => Math.abs(rad - r)))
  const ang = Math.atan2(c.Y, c.X)
  const axisAngle = Math.min(Math.abs(Math.sin(ang)), Math.abs(Math.cos(ang)))
  f.push(ringDist / 10, axisAngle)
  const cellMm = WINDOW_MM / GRID
  const bins = [0, 2, 4, 6, 8, 10]
  const gr = f.slice(GRID * GRID, GRID * GRID * 2).map((v) => v * 255)
  for (let b = 0; b < 5; b++) {
    let sa = 0, n = 0
    diffs.forEach((d, k) => {
      const i = k % GRID, j = Math.floor(k / GRID)
      const r = Math.hypot(i - GRID / 2 + 0.5, j - GRID / 2 + 0.5) * cellMm
      if (r >= bins[b] && r < bins[b + 1]) { sa += Math.abs(d); n++ }
    })
    f.push(n ? sa / n / 255 : 0)
  }
  for (let b = 0; b < 5; b++) {
    let sa = 0, n = 0
    gr.forEach((g, k) => {
      const i = k % GRID, j = Math.floor(k / GRID)
      const r = Math.hypot(i - GRID / 2 + 0.5, j - GRID / 2 + 0.5) * cellMm
      if (r >= bins[b] && r < bins[b + 1]) { sa += g; n++ }
    })
    f.push(n ? sa / n / 255 : 0)
  }
  const core = gr.filter((_, k) => { const i = k % GRID, j = Math.floor(k / GRID); return Math.hypot(i - GRID / 2 + 0.5, j - GRID / 2 + 0.5) * cellMm < 6 })
  const cm = core.reduce((n, v) => n + v, 0) / core.length
  f.push(Math.min(...core) / 255, Math.max(...core) / 255, Math.sqrt(core.reduce((n, v) => n + (v - cm) ** 2, 0) / core.length) / 255, cm / 255)
  return f
}

interface Sample { f: number[]; y: number; target: string }

/** Candidates for a photo with features and, given the truth, labels. */
async function samplesFor(target: EvalTarget, template: Float32Array, size: number) {
  const cands = await candidates(target)
  const rect = await rectify(target)
  if (!cands || !rect) return null
  const al = alignTo(rect.gray, template, size)
  const aligned = new Float32Array(size * size)
  const c = size / 2
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) aligned[v * size + u] = bil(rect.gray, size, c + (u - c - al.dx) / al.s, c + (v - c - al.dy) / al.s)
  const truth: P[] = target.shots.map((s) => ({ x: s.x, y: s.y }))
  // label: nearest-first greedy match within a bullet diameter
  const pairs: { d: number; i: number; j: number }[] = []
  cands.forEach((cd, i) => truth.forEach((t, j) => pairs.push({ d: Math.hypot(cd.X - t.x, cd.Y - t.y), i, j })))
  pairs.sort((a, b) => a.d - b.d)
  const ui = new Set<number>(), uj = new Set<number>()
  for (const p of pairs) { if (p.d > target.bulletDiameterMm) break; if (ui.has(p.i) || uj.has(p.j)) continue; ui.add(p.i); uj.add(p.j) }
  return cands.map((cd, i) => ({ f: features(cd, aligned, template, size, al), y: ui.has(i) ? 1 : 0, target: target.label, cand: cd }))
}

// --- boosted trees ---------------------------------------------------------------
type Row = { f: number[]; y: number }
function trainGBM(samples: Row[], cols: number[], rounds = 150, eta = 0.15) {
  const n = samples.length
  const X = samples.map((s) => cols.map((c) => s.f[c]))
  const y = samples.map((s) => s.y)
  const pos = y.reduce((a, b) => a + b, 0)
  const w = y.map((v) => (v === 1 ? n / (2 * pos) : n / (2 * (n - pos))))
  const thresholds = cols.map((_, k) => {
    const v = X.map((r) => r[k]).sort((a, b) => a - b)
    return Array.from({ length: 24 }, (_, q) => v[Math.floor(((q + 1) / 25) * (n - 1))])
  })
  interface Node { feat: number; thr: number; left: Node | number; right: Node | number }
  const F = new Float64Array(n)
  const trees: Node[] = []
  const lambda = 1
  const leaf = (idx: number[], g: Float64Array, h: Float64Array) => {
    let sg = 0, sh = 0
    for (const i of idx) { sg += g[i]; sh += h[i] }
    return (-sg / (sh + lambda)) * eta
  }
  const build = (idx: number[], depth: number, g: Float64Array, h: Float64Array): Node | number => {
    if (depth === 0 || idx.length < 20) return leaf(idx, g, h)
    let sgT = 0, shT = 0
    for (const i of idx) { sgT += g[i]; shT += h[i] }
    const base = (sgT * sgT) / (shT + lambda)
    let best = { gain: 1e-6, feat: -1, thr: 0 }
    for (let k = 0; k < cols.length; k++) for (const t of thresholds[k]) {
      let sgL = 0, shL = 0
      for (const i of idx) if (X[i][k] <= t) { sgL += g[i]; shL += h[i] }
      const sgR = sgT - sgL, shR = shT - shL
      if (shL < 1e-3 || shR < 1e-3) continue
      const gain = (sgL * sgL) / (shL + lambda) + (sgR * sgR) / (shR + lambda) - base
      if (gain > best.gain) best = { gain, feat: k, thr: t }
    }
    if (best.feat < 0) return leaf(idx, g, h)
    const L: number[] = [], R: number[] = []
    for (const i of idx) (X[i][best.feat] <= best.thr ? L : R).push(i)
    return { feat: best.feat, thr: best.thr, left: build(L, depth - 1, g, h), right: build(R, depth - 1, g, h) }
  }
  const walk = (node: Node | number, x: number[]): number => typeof node === 'number' ? node : walk(x[node.feat] <= node.thr ? node.left : node.right, x)
  const all = Array.from({ length: n }, (_, i) => i)
  for (let r = 0; r < rounds; r++) {
    const g = new Float64Array(n), h = new Float64Array(n)
    for (let i = 0; i < n; i++) { const p = 1 / (1 + Math.exp(-F[i])); g[i] = (p - y[i]) * w[i]; h[i] = Math.max(1e-4, p * (1 - p)) * w[i] }
    const tree = build(all, 3, g, h)
    trees.push(tree as Node)
    for (let i = 0; i < n; i++) F[i] += walk(tree, X[i])
  }
  return (f: number[]) => {
    const x = cols.map((c) => f[c])
    let z = 0
    for (const t of trees) z += walk(t, x)
    return 1 / (1 + Math.exp(-z))
  }
}

// --- a small logistic regression ---------------------------------------------
function train(samples: Sample[]) {
  const d = DIM, n = samples.length
  const mean = new Array<number>(d).fill(0), sd = new Array<number>(d).fill(0)
  for (const s of samples) for (let k = 0; k < d; k++) mean[k] += s.f[k] / n
  for (const s of samples) for (let k = 0; k < d; k++) sd[k] += (s.f[k] - mean[k]) ** 2 / n
  for (let k = 0; k < d; k++) sd[k] = Math.sqrt(sd[k]) + 1e-6
  const Xs = samples.map((s) => s.f.map((v, k) => (v - mean[k]) / sd[k]))
  const pos = samples.filter((s) => s.y === 1).length
  const wPos = n / (2 * pos), wNeg = n / (2 * (n - pos))
  const w = new Array<number>(d).fill(0)
  let b = 0
  const lr = 0.05, l2 = 0.002
  for (let epoch = 0; epoch < 300; epoch++) {
    const g = new Array<number>(d).fill(0)
    let gb = 0
    for (let i = 0; i < n; i++) {
      let z = b
      for (let k = 0; k < d; k++) z += w[k] * Xs[i][k]
      const p = 1 / (1 + Math.exp(-z))
      const e = (p - samples[i].y) * (samples[i].y === 1 ? wPos : wNeg)
      for (let k = 0; k < d; k++) g[k] += e * Xs[i][k]
      gb += e
    }
    for (let k = 0; k < d; k++) w[k] -= lr * (g[k] / n + l2 * w[k])
    b -= lr * (gb / n)
  }
  return (f: number[]) => {
    let z = b
    for (let k = 0; k < d; k++) z += w[k] * ((f[k] - mean[k]) / sd[k])
    return 1 / (1 + Math.exp(-z))
  }
}

async function main() {
  const tb = await readFile(`${CACHE}/template.bin`)
  const template = new Float32Array(tb.buffer, tb.byteOffset, tb.byteLength / 4)
  const size = Math.round(Math.sqrt(template.length))
  const nSyn = Number(process.argv[2] ?? 200)

  // Synthetic training photos
  const labels = JSON.parse(await readFile('test-images/synthetic/labels.json', 'utf8')) as { id: string; shots: P[] }[]
  const syn: EvalTarget[] = labels.slice(0, nSyn).map((l) => ({
    label: `synthetic/${l.id}`, photoPath: `test-images/synthetic/${l.id}.jpg`, targetFaceId: 'issf-50m',
    bulletDiameterMm: 5.6, mmPerUnit: 0, position: 'prone', shots: l.shots,
  }))
  const train_: Sample[] = []
  for (const t of syn) { const s = await samplesFor(t, template, size); if (s) train_.push(...s) }
  // The real photos the library was built from are fair game for training too
  // (they're not in the test set): a handful of real examples, repeated, so the
  // classifier also sees real photos' misregistration and print variation.
  const realEvery = (await loadEvalTargets()).filter((t) => t.targetFaceId === 'issf-50m' && t.label.startsWith('eval/'))
  const realTrain = realEvery.filter((_, i) => i % 2 === 0)
  let realRows = 0
  for (const t of realTrain) {
    const s = await samplesFor(t, template, size)
    if (!s) continue
    for (let rep = 0; rep < (Number(process.env.REAL_WEIGHT ?? 4)); rep++) train_.push(...s)
    realRows += s.length
  }
  const pos = train_.filter((s) => s.y === 1).length
  console.log(`real training photos: ${realTrain.length} (${realRows} candidates, repeated)`)
  console.log(`training: ${syn.length} synthetic photos, ${train_.length} candidates (${pos} holes, ${train_.length - pos} not)`)

  // Hold out the last 20% of synthetic photos to choose the confidence cut-off.
  const cut = Math.floor(syn.length * 0.8)
  const synTrainLabels = new Set(syn.slice(0, cut).map((t) => t.label))
  const synValLabels = new Set(syn.slice(cut).map((t) => t.label))
  const trainSet = train_.filter((s) => synTrainLabels.has(s.target) || s.target.startsWith('eval/'))
  const valSet = train_.filter((s) => synValLabels.has(s.target))
  // engineered + summary columns only for the boosted trees
  const gbmCols = [...Array.from({ length: 8 }, (_, k) => GRID * GRID * 2 + k), ...Array.from({ length: ENG }, (_, k) => RAW + k)]
  const useGbm = (process.env.MODEL ?? 'gbm') === 'gbm'
  const fit = (rows: Sample[]) => (useGbm ? trainGBM(rows, gbmCols) : train(rows))
  console.log(`model: ${useGbm ? 'boosted trees on engineered features' : 'logistic regression on raw patches'}`)
  const model = fit(trainSet)
  let bestT = 0.5, bestF1 = 0
  for (let t = 0.2; t <= 0.95; t += 0.05) {
    let tp = 0, fp = 0, fn = 0
    for (const s of valSet) { const pr = model(s.f) >= t; if (pr && s.y) tp++; else if (pr && !s.y) fp++; else if (!pr && s.y) fn++ }
    const f1 = (2 * tp) / (2 * tp + fp + fn + 1e-9)
    if (f1 > bestF1) { bestF1 = f1; bestT = t }
  }
  console.log(`cut-off ${bestT.toFixed(2)} chosen on held-out synthetic photos (candidate F1 ${bestF1.toFixed(2)})`)
  const final = fit(train_)

  // Real held-out photos
  const every = (await loadEvalTargets()).filter((t) => t.targetFaceId === 'issf-50m' && t.label.startsWith('eval/'))
  const evalHeld = every.filter((_, i) => i % 2 === 1)
  const seen = new Set<string>()
  const contributed = (await loadEvalTargets()).filter((t) => t.label.startsWith('contributed/')).filter((t) => {
    const k = t.shots.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).sort().join('|')
    if (seen.has(k)) return false
    seen.add(k); return true
  })
  const groups = [{ name: 'contributed (6 unique)', items: contributed }, { name: `eval held-out (${evalHeld.length})`, items: evalHeld }]
  for (const g of groups) {
    let truth = 0, baseF = 0, baseX = 0, clsF = 0, clsX = 0, ceil = 0
    for (const t of g.items) {
      const base = await scoreTarget(t)
      truth += base.truthCount; baseF += base.matchedCount; baseX += base.extraCount
      const s = await samplesFor(t, template, size)
      if (!s) continue
      ceil += s.filter((x) => x.y === 1).length
      const chosen = s.map((x) => ({ p: final(x.f), cand: x.cand })).filter((x) => x.p >= bestT).sort((a, b) => b.p - a.p).slice(0, 10)
      const det = chosen.map((x) => ({ x: x.cand.X, y: x.cand.Y }))
      const tr = t.shots.map((q) => ({ x: q.x, y: q.y }))
      const pairs: { d: number; i: number; j: number }[] = []
      det.forEach((p, i) => tr.forEach((q, j) => pairs.push({ d: Math.hypot(p.x - q.x, p.y - q.y), i, j })))
      pairs.sort((a, b) => a.d - b.d)
      const ui = new Set<number>(), uj = new Set<number>()
      for (const p of pairs) { if (p.d > t.bulletDiameterMm) break; if (ui.has(p.i) || uj.has(p.j)) continue; ui.add(p.i); uj.add(p.j) }
      clsF += ui.size; clsX += det.length - ui.size
    }
    console.log(`${g.name.padEnd(26)} candidate list contains ${ceil}/${truth} (${Math.round(ceil / truth * 100)}%) of the real holes: the most any ranking could find`)
    console.log(`${g.name.padEnd(26)} current detector: found ${baseF}/${truth} (${Math.round(baseF / truth * 100)}%), ${baseX} extra   |   with classifier: found ${clsF}/${truth} (${Math.round(clsF / truth * 100)}%), ${clsX} extra`)
  }
}
void main()
