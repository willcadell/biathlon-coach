// Checks the deterministic (non-AI) hole detector's real-world accuracy
// against athletes' anonymous target contributions — each one stores the
// photo *and* the confirmed hole positions the athlete corrected it to, so
// the detector's raw output can be measured against real, human-checked
// ground truth instead of just eyeballed (that's what cv-check.ts is for).
//
// Run with `npm run cv-progress` any time — after a batch of new
// contributions comes in, or after a change to holeLocator.ts/blackLocator.ts
// — and compare the printed numbers to the last run to see whether accuracy
// actually moved. Rerunning refreshes contributed/meta.json and the photos
// beside it (not committed — see .gitignore's test-images entry) with
// whatever's in training_targets right now via:
//
//   npx supabase db query --linked "select id, encode(photo,'base64') as photo_b64, target_face_id, bullet_diameter_mm, mm_per_unit, position, expected_shots, shots, submitted_month from training_targets order by submitted_month, id"
//
// (then re-run the download step from the session that first wrote this file,
// or ask Claude to refresh test-images/contributed/ from the database).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Jimp } from 'jimp'
import { locateBlack } from '../src/lib/blackLocator'
import { locateHoles } from '../src/lib/holeLocator'
import { outerRingCrop, toTargetPlane } from '../src/lib/geometry'
import { faceById } from '../src/lib/types'
import { ringRadii } from '../src/lib/scoring'

const DIR = join(process.cwd(), 'test-images', 'contributed')
const WORK_EDGE = 640
const HOLE_WORK_EDGE = 1400

interface ContributedTarget {
  name: string
  id: string
  target_face_id: string
  bullet_diameter_mm: number
  mm_per_unit: number
  position: string
  expected_shots: number | null
  shots: { x: number; y: number }[]
  submitted_month: string
}

interface Point { x: number; y: number }

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** Greedy nearest-neighbour matching, closest pairs first — good enough for
 *  ten-ish points per target, and a false match here just costs one target's
 *  worth of accuracy, not the whole run. */
function matchShots(detected: Point[], truth: Point[], maxDist: number) {
  const pairs: { d: number; i: number; j: number }[] = []
  detected.forEach((p, i) => truth.forEach((t, j) => pairs.push({ d: dist(p, t), i, j })))
  pairs.sort((a, b) => a.d - b.d)
  const usedD = new Set<number>()
  const usedT = new Set<number>()
  const matched: { detected: Point; truth: Point; errorMm: number }[] = []
  for (const { d, i, j } of pairs) {
    if (d > maxDist) break
    if (usedD.has(i) || usedT.has(j)) continue
    usedD.add(i)
    usedT.add(j)
    matched.push({ detected: detected[i], truth: truth[j], errorMm: d })
  }
  return {
    matched,
    missed: truth.filter((_, j) => !usedT.has(j)), // confirmed shots the detector never found
    extra: detected.filter((_, i) => !usedD.has(i)), // things it invented, or a splitter shot doubled
  }
}

async function main() {
  const meta: ContributedTarget[] = JSON.parse(await readFile(join(DIR, 'meta.json'), 'utf8'))
  if (meta.length === 0) {
    console.log('No contributed targets yet — nothing to measure. Try again once athletes have opted in and scored a few.')
    return
  }

  let totalTruth = 0
  let totalMatched = 0
  let totalMissed = 0
  let totalExtra = 0
  const errors: number[] = []

  for (const t of meta) {
    const face = faceById(t.target_face_id)
    const ringRadiiFrac = ringRadii(face).map((r) => r / (face.blackMm / 2))
    const original = await Jimp.read(join(DIR, `${t.name}.jpg`))
    const scale = Math.min(1, WORK_EDGE / Math.max(original.bitmap.width, original.bitmap.height))
    const work = original.clone().resize({
      w: Math.round(original.bitmap.width * scale),
      h: Math.round(original.bitmap.height * scale),
    })

    const black = locateBlack({ width: work.bitmap.width, height: work.bitmap.height, data: work.bitmap.data })
    if (!black) {
      console.log(`${t.name}: aiming mark not found at all — ${t.shots.length} confirmed shots all count as missed.`)
      totalTruth += t.shots.length
      totalMissed += t.shots.length
      continue
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
    const expectedHoleRadiusPx = (t.bullet_diameter_mm / 2) * (bullInHoleSpace.semiMajor / (face.blackMm / 2))
    const found = locateHoles(
      { width: holeWork.bitmap.width, height: holeWork.bitmap.height, data: holeWork.bitmap.data },
      bullInHoleSpace,
      expectedHoleRadiusPx,
      ringRadiiFrac,
    )

    // Detected holes, in original-image fraction units, then onto the same
    // mm-from-centre plane the confirmed shots are already stored in.
    const detectedMm = found.map((h) =>
      toTargetPlane(
        { x: (x0 + h.cx / holeScale) / original.bitmap.width, y: (y0 + h.cy / holeScale) / original.bitmap.width },
        bullFrac,
        face.blackMm,
      ),
    )
    const truthMm = t.shots.map((s) => ({ x: s.x, y: s.y }))

    // A hole this close to where the athlete marked it counts as the same
    // one — roughly a caliber's worth of slack for real measurement noise.
    const maxMatchDist = t.bullet_diameter_mm
    const { matched, missed, extra } = matchShots(detectedMm, truthMm, maxMatchDist)

    totalTruth += truthMm.length
    totalMatched += matched.length
    totalMissed += missed.length
    totalExtra += extra.length
    errors.push(...matched.map((m) => m.errorMm))

    console.log(
      `${t.name} (${t.position}, ${truthMm.length} confirmed): found ${matched.length}/${truthMm.length}` +
      (missed.length ? `, missed ${missed.length}` : '') +
      (extra.length ? `, ${extra.length} extra/invented` : '') +
      (matched.length ? `, mean error ${(matched.reduce((n, m) => n + m.errorMm, 0) / matched.length).toFixed(1)} mm` : ''),
    )
  }

  console.log('')
  console.log(`Across ${meta.length} contributed target${meta.length === 1 ? '' : 's'}, ${totalTruth} confirmed shots:`)
  console.log(`  found  ${totalMatched}/${totalTruth} (${((totalMatched / totalTruth) * 100).toFixed(0)}%)`)
  console.log(`  missed ${totalMissed}/${totalTruth} (${((totalMissed / totalTruth) * 100).toFixed(0)}%)`)
  console.log(`  extra/invented: ${totalExtra}`)
  if (errors.length > 0) {
    console.log(`  mean position error on a found hole: ${(errors.reduce((n, e) => n + e, 0) / errors.length).toFixed(1)} mm`)
  }
  if (meta.length < 15) {
    console.log('')
    console.log(`Only ${meta.length} contributed target${meta.length === 1 ? '' : 's'} so far — a useful first read, but too`)
    console.log('few yet to treat any single number here as a stable trend. Rerun as more come in.')
  }
}

void main()
