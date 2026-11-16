// Exports every labelled target as a rectified grayscale image plus its hole positions, for training and scoring
// the hole-finding model in Python (ml/train.py). Run with `npm run ml-export`.
//
// Each image is the photo warped into the flat target plane at 4 px per mm (test/synth/common.ts), with the printed
// black normalised, so a hole is the same size wherever the photo was taken from. Two registrations are written:
//
//   auto   the aiming-circle fit the app computes itself (blackLocator). This is what the model gets in the app, so
//          it is what a model is judged on. It is sometimes off by a lot.
//   exact  the aiming-circle fit the athlete confirmed, where the contribution kept it (`marks`). Training uses these
//          because the labels line up with them exactly; training then adds random registration error on purpose.
//
// The baseline detector's result on each target (the same automatic pipeline the app ships) is written beside them so
// the model can be compared to it target by target.
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Jimp } from 'jimp'
import { loadEvalTargets, scoreTarget, type EvalTarget } from '../test/cv-eval'
import { PX_PER_MM, faceExtents, normalise, planeToPhoto, rectify, saveGray, type BlackFit } from '../test/synth/common'
import { faceById } from '../src/lib/types'
import { toTargetPlane } from '../src/lib/geometry'

const OUT = join('ml', 'data')

interface Marks { bulls: { a: number; b: number; cx: number; cy: number; rot: number; holes: { x: number; y: number }[] }[] }

function sampleGray(data: Uint8Array | Buffer, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return -1
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1)
  const fx = x - x0, fy = y - y0
  const g = (xx: number, yy: number) => {
    const p = (yy * w + xx) * 4
    return data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114
  }
  return (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy
}

/** The photo warped into the target plane using a given aiming-circle fit (photo pixels). */
async function rectifyWith(photoPath: string, fit: BlackFit, faceId: string) {
  const face = faceById(faceId)
  const img = await Jimp.read(photoPath)
  const W = img.bitmap.width, H = img.bitmap.height
  const { size } = faceExtents(face)
  const gray = new Float32Array(size * size)
  const c = size / 2
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const p = planeToPhoto((u + 0.5 - c) / PX_PER_MM, (c - (v + 0.5)) / PX_PER_MM, fit, face.blackMm)
      const s = sampleGray(img.bitmap.data, W, H, p.x, p.y)
      gray[v * size + u] = s < 0 ? 128 : s
    }
  }
  normalise(gray, size)
  return { gray, size, W, H }
}

const toPx = (mm: { x: number; y: number }, size: number) => ({ u: size / 2 + mm.x * PX_PER_MM, v: size / 2 - mm.y * PX_PER_MM })

/** A stable fold from the label, so a target is in the same fold on every run. */
function foldOf(key: string, folds = 5): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) % folds
}

async function main() {
  await mkdir(join(OUT, 'images'), { recursive: true })
  const meta = JSON.parse(await readFile(join('test-images', 'contributed', 'meta.json'), 'utf8')) as {
    name: string; fingerprint: string; marks: Marks | null
  }[]
  const marksByLabel = new Map(meta.map((m) => [`contributed/${m.name}`, m]))

  // One entry per unique target: contributions repeat (re-encoded), and a repeat adds nothing.
  const seen = new Set<string>()
  const targets: EvalTarget[] = []
  for (const t of await loadEvalTargets()) {
    const m = marksByLabel.get(t.label)
    const key = m ? m.fingerprint : t.label
    if (seen.has(key)) continue
    seen.add(key)
    targets.push(t)
  }

  const items: unknown[] = []
  let exactCount = 0
  for (const t of targets) {
    const safe = t.label.replace('/', '_')
    const face = faceById(t.targetFaceId)
    const m = marksByLabel.get(t.label)
    const marks = m?.marks?.bulls?.length === 1 ? m.marks.bulls[0] : null

    const base = await scoreTarget(t)
    const item: Record<string, unknown> = {
      label: t.label, set: t.label.startsWith('contributed/') ? 'contributed' : 'eval', face: t.targetFaceId,
      bulletDiameterMm: t.bulletDiameterMm, position: t.position, shots: t.shots.length,
      fold: foldOf(t.label),
      baseline: {
        found: base.matchedCount, missed: base.missedCount, extra: base.extraCount,
        errMm: base.errors.length ? base.errors.reduce((n, e) => n + e, 0) / base.errors.length : null,
      },
    }

    const auto = await rectify(t)
    if (auto) {
      await saveGray(join(OUT, 'images', `${safe}_auto.png`), auto.gray, auto.size)
      item.auto = { image: `images/${safe}_auto.png`, size: auto.size, truth: t.shots.map((s) => toPx(s, auto.size)) }
    } else {
      item.auto = null
    }

    if (marks) {
      const { W } = await rectifyWith(t.photoPath, { cx: 0, cy: 0, semiMajor: 1, semiMinor: 1, rotationDeg: 0 }, t.targetFaceId)
      const fit: BlackFit = { cx: marks.cx * W, cy: marks.cy * W, semiMajor: marks.a * W, semiMinor: marks.b * W, rotationDeg: marks.rot }
      const ex = await rectifyWith(t.photoPath, fit, t.targetFaceId)
      await saveGray(join(OUT, 'images', `${safe}_exact.png`), ex.gray, ex.size)
      // The confirmed holes, as the app stored them in the photo, taken through the app's own conversion to mm.
      // They must agree with the mm labels, or the registration here is not the one the labels were made with.
      const bull = { id: 'b', holes: [], centre: { x: marks.cx, y: marks.cy }, semiMajor: marks.a, semiMinor: marks.b, rotationDeg: marks.rot }
      const fromMarks = marks.holes.map((h) => toTargetPlane(h, bull, face.blackMm))
      let worst = 0
      for (const p of fromMarks) worst = Math.max(worst, Math.min(...t.shots.map((s) => Math.hypot(s.x - p.x, s.y - p.y))))
      item.exact = { image: `images/${safe}_exact.png`, size: ex.size, truth: fromMarks.map((p) => toPx(p, ex.size)), labelAgreementMm: Math.round(worst * 100) / 100 }
      exactCount++
    } else {
      item.exact = null
    }
    items.push(item)
    console.log(`${t.label}: auto ${auto ? 'ok' : 'FAILED'}, exact ${marks ? 'yes' : 'no'}, baseline found ${base.matchedCount}/${t.shots.length}`)
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ pxPerMm: PX_PER_MM, folds: 5, items }, null, 1))
  console.log(`\n${items.length} unique targets (${exactCount} with an exact ring fit) written to ${OUT}/`)
}

void main()
