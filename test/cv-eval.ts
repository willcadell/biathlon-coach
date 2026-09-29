// Shared scoring logic for the CV-progress tools (cv-progress.ts, cv-tune.ts):
// run the real detection pipeline against one labelled photo and compare its
// output to the confirmed (ground-truth) hole positions. Kept separate from
// both scripts so tuning a parameter and just checking today's accuracy stay
// two different questions asked with the same underlying measurement.
import { Jimp } from 'jimp'
import { locateBlack } from '../src/lib/blackLocator'
import { locateHoles, type HoleParams } from '../src/lib/holeLocator'
import { outerRingCrop, toTargetPlane } from '../src/lib/geometry'
import { faceById } from '../src/lib/types'
import { ringRadii } from '../src/lib/scoring'

const WORK_EDGE = 640
const HOLE_WORK_EDGE = 1400

export interface EvalTarget {
  /** For messages only — doesn't need to be unique across the combined set. */
  label: string
  photoPath: string
  targetFaceId: string
  bulletDiameterMm: number
  mmPerUnit: number
  position: string
  /** Confirmed hole positions, mm from the aiming centre — what the athlete
   *  corrected the detector's (or their own manual) reading to. */
  shots: { x: number; y: number }[]
}

interface Point { x: number; y: number }
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** Greedy nearest-neighbour matching, closest pairs first — good enough for
 *  ten-ish points per target, and a false match here only costs one target's
 *  worth of accuracy, not the whole run. */
function matchShots(detected: Point[], truth: Point[], maxDist: number) {
  const pairs: { d: number; i: number; j: number }[] = []
  detected.forEach((p, i) => truth.forEach((t, j) => pairs.push({ d: dist(p, t), i, j })))
  pairs.sort((a, b) => a.d - b.d)
  const usedD = new Set<number>()
  const usedT = new Set<number>()
  const matched: { errorMm: number }[] = []
  for (const { d, i, j } of pairs) {
    if (d > maxDist) break
    if (usedD.has(i) || usedT.has(j)) continue
    usedD.add(i)
    usedT.add(j)
    matched.push({ errorMm: d })
  }
  return { matchedCount: matched.length, errors: matched.map((m) => m.errorMm), missedCount: truth.length - matched.length, extraCount: detected.length - matched.length }
}

export interface TargetResult {
  label: string
  truthCount: number
  matchedCount: number
  missedCount: number
  extraCount: number
  errors: number[]
}

/** Runs locateBlack -> outerRingCrop -> locateHoles (the same pipeline the
 *  app uses for local, no-API detection) against one photo, with optional
 *  parameter overrides, and scores the result against its confirmed shots. */
export async function scoreTarget(target: EvalTarget, params: HoleParams = {}): Promise<TargetResult> {
  const face = faceById(target.targetFaceId)
  const ringRadiiFrac = ringRadii(face).map((r) => r / (face.blackMm / 2))
  const original = await Jimp.read(target.photoPath)
  const scale = Math.min(1, WORK_EDGE / Math.max(original.bitmap.width, original.bitmap.height))
  const work = original.clone().resize({
    w: Math.round(original.bitmap.width * scale),
    h: Math.round(original.bitmap.height * scale),
  })

  const black = locateBlack({ width: work.bitmap.width, height: work.bitmap.height, data: work.bitmap.data })
  if (!black) {
    return { label: target.label, truthCount: target.shots.length, matchedCount: 0, missedCount: target.shots.length, extraCount: 0, errors: [] }
  }

  const backScale = 1 / scale
  const aspect = original.bitmap.width / original.bitmap.height
  const bullFrac = {
    id: 'bull-1',
    holes: [],
    centre: { x: (black.cx * backScale) / original.bitmap.width, y: (black.cy * backScale) / original.bitmap.width },
    semiMajor: (black.semiMajor * backScale) / original.bitmap.width,
    semiMinor: (black.semiMinor * backScale) / original.bitmap.width,
    rotationDeg: black.rotationDeg,
  }
  const rect = outerRingCrop(bullFrac, face, aspect)
  const x0 = Math.round(rect.x0 * original.bitmap.width)
  const y0 = Math.round(rect.y0 * original.bitmap.width)
  const cropW = Math.max(1, Math.round((rect.x1 - rect.x0) * original.bitmap.width))
  const cropH = Math.max(1, Math.round((rect.y1 - rect.y0) * original.bitmap.width))
  const holeScale = Math.min(1, HOLE_WORK_EDGE / Math.max(cropW, cropH))
  const holeWork = original.clone().crop({ x: x0, y: y0, w: cropW, h: cropH }).resize({
    w: Math.round(cropW * holeScale),
    h: Math.round(cropH * holeScale),
  })
  const bullInHoleSpace = {
    cx: (black.cx * backScale - x0) * holeScale,
    cy: (black.cy * backScale - y0) * holeScale,
    semiMajor: black.semiMajor * backScale * holeScale,
    semiMinor: black.semiMinor * backScale * holeScale,
    rotationDeg: black.rotationDeg,
  }
  const expectedHoleRadiusPx = (target.bulletDiameterMm / 2) * (bullInHoleSpace.semiMajor / (face.blackMm / 2))
  const found = locateHoles(
    { width: holeWork.bitmap.width, height: holeWork.bitmap.height, data: holeWork.bitmap.data },
    bullInHoleSpace,
    expectedHoleRadiusPx,
    ringRadiiFrac,
    params,
  )

  const detectedMm = found.map((h) =>
    toTargetPlane(
      { x: (x0 + h.cx / holeScale) / original.bitmap.width, y: (y0 + h.cy / holeScale) / original.bitmap.width },
      bullFrac,
      face.blackMm,
    ),
  )
  const truthMm = target.shots.map((s) => ({ x: s.x, y: s.y }))
  const maxMatchDist = target.bulletDiameterMm
  const { matchedCount, missedCount, extraCount, errors } = matchShots(detectedMm, truthMm, maxMatchDist)
  return { label: target.label, truthCount: truthMm.length, matchedCount, missedCount, extraCount, errors }
}

/** Loads every labelled photo this repo currently has, combining the real
 *  anonymous contributions (test-images/contributed/, from training_targets)
 *  with the developer's own held-out set (test-images/eval/, from precision
 *  bouts scored before that feature existed) when both are present. Either
 *  directory missing its meta/labels file is treated as "none available"
 *  rather than an error, since a fresh checkout won't have downloaded either. */
export async function loadEvalTargets(): Promise<EvalTarget[]> {
  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const targets: EvalTarget[] = []

  try {
    const contributedDir = join(process.cwd(), 'test-images', 'contributed')
    const meta = JSON.parse(await readFile(join(contributedDir, 'meta.json'), 'utf8')) as {
      name: string; target_face_id: string; bullet_diameter_mm: number; mm_per_unit: number
      position: string; shots: { x: number; y: number }[]
    }[]
    for (const m of meta) {
      targets.push({
        label: `contributed/${m.name}`,
        photoPath: join(contributedDir, `${m.name}.jpg`),
        targetFaceId: m.target_face_id,
        bulletDiameterMm: Number(m.bullet_diameter_mm),
        mmPerUnit: Number(m.mm_per_unit),
        position: m.position,
        shots: m.shots,
      })
    }
  } catch {
    // No contributed photos downloaded yet — fine, score whatever else there is.
  }

  try {
    const evalDir = join(process.cwd(), 'test-images', 'eval')
    const labels = JSON.parse(await readFile(join(evalDir, 'labels.json'), 'utf8')) as {
      id: string; target_face_id: string; bullet_diameter_mm: string | number; mm_per_unit: string | number
      position: string; shots: { mm: { x: number; y: number } }[]
    }[]
    for (const r of labels) {
      targets.push({
        label: `eval/${r.id.slice(0, 8)}`,
        photoPath: join(evalDir, `${r.id}.jpg`),
        targetFaceId: r.target_face_id,
        bulletDiameterMm: Number(r.bullet_diameter_mm),
        mmPerUnit: Number(r.mm_per_unit),
        position: r.position,
        shots: r.shots.map((s) => s.mm),
      })
    }
  } catch {
    // Developer's own eval set not downloaded in this checkout — fine.
  }

  return targets
}
