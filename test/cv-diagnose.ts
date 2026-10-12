// Digs into WHY the deterministic detector misses holes on the labelled photos:
// for each target it runs the same pipeline as cv-eval's scoreTarget but keeps
// the detected positions, then asks whether the detections are real holes in
// the wrong place (a registration error: the black-circle fit, which shifts or
// scales every point) or simply missing/extra ones. For each target it prints
// the black-circle fit, how many detections there were, and the best constant
// shift (and scale) that would line detections up with the confirmed shots.
// A big improvement from a pure shift/scale means registration, not detection,
// is the weak link.
import { Jimp } from 'jimp'
import { locateBlack } from '../src/lib/blackLocator'
import { locateHoles } from '../src/lib/holeLocator'
import { outerRingCrop, toTargetPlane } from '../src/lib/geometry'
import { faceById } from '../src/lib/types'
import { ringRadii } from '../src/lib/scoring'
import { loadEvalTargets } from './cv-eval'

const WORK_EDGE = 640
const HOLE_WORK_EDGE = 1400
type P = { x: number; y: number }
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)

function match(detected: P[], truth: P[], maxDist: number): number {
  const pairs: { d: number; i: number; j: number }[] = []
  detected.forEach((p, i) => truth.forEach((t, j) => pairs.push({ d: dist(p, t), i, j })))
  pairs.sort((a, b) => a.d - b.d)
  const ui = new Set<number>(); const uj = new Set<number>(); let n = 0
  for (const { d, i, j } of pairs) { if (d > maxDist) break; if (ui.has(i) || uj.has(j)) continue; ui.add(i); uj.add(j); n++ }
  return n
}

async function main() {
  const targets = (await loadEvalTargets()).filter((t) => t.label.startsWith(process.argv[2] ?? 'contributed/'))
  let rescued = 0; let truthTotal = 0; let found = 0
  for (const t of targets) {
    const face = faceById(t.targetFaceId)
    const ringFrac = ringRadii(face).map((r) => r / (face.blackMm / 2))
    const original = await Jimp.read(t.photoPath)
    const W = original.bitmap.width, H = original.bitmap.height
    const scale = Math.min(1, WORK_EDGE / Math.max(W, H))
    const work = original.clone().resize({ w: Math.round(W * scale), h: Math.round(H * scale) })
    const black = locateBlack({ width: work.bitmap.width, height: work.bitmap.height, data: work.bitmap.data })
    if (!black) { console.log(`${t.label}: NO BLACK FOUND`); truthTotal += t.shots.length; continue }
    const back = 1 / scale
    const bull = {
      id: 'b', holes: [],
      centre: { x: (black.cx * back) / W, y: (black.cy * back) / W },
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
    const expectedR = (t.bulletDiameterMm / 2) * (inHole.semiMajor / (face.blackMm / 2))
    const holes = locateHoles({ width: hw.bitmap.width, height: hw.bitmap.height, data: hw.bitmap.data }, inHole, expectedR, ringFrac, {})
    const det = holes.map((h) => toTargetPlane({ x: (x0 + h.cx / hs) / W, y: (y0 + h.cy / hs) / W }, bull, face.blackMm))
    const truth = t.shots.map((s) => ({ x: s.x, y: s.y }))
    const maxD = t.bulletDiameterMm
    const base = match(det, truth, maxD)

    // best pure shift: try every detection-truth pair's offset, keep the one that matches most
    let bestShift = { n: base, dx: 0, dy: 0 }
    for (const d of det) for (const tr of truth) {
      const dx = tr.x - d.x, dy = tr.y - d.y
      const n = match(det.map((p) => ({ x: p.x + dx, y: p.y + dy })), truth, maxD)
      if (n > bestShift.n) bestShift = { n, dx, dy }
    }
    const blackMmFit = (black.semiMajor * back / W)
    console.log(
      `${t.label} ${t.position}: black fit (${(black.cx * back / W).toFixed(2)},${(black.cy * back / H).toFixed(2)}) r=${blackMmFit.toFixed(3)} ` +
      `| detected ${det.length}, truth ${truth.length}, matched ${base}` +
      (bestShift.n > base ? `, a shift of (${bestShift.dx.toFixed(1)}, ${bestShift.dy.toFixed(1)}) mm would match ${bestShift.n}` : ''),
    )
    truthTotal += truth.length; found += base; rescued += Math.max(base, bestShift.n)
  }
  console.log(`\nfound ${found}/${truthTotal}; with the best constant shift per target it would be ${rescued}/${truthTotal}`)
}
void main()
