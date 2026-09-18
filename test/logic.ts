// Checks for the parts that have to be right: the target-plane maths, the
// metrics built on it, and the rules that turn those metrics into advice.
//
// Run with `npm test`.

import {
  bullsToShots, computeMetrics, groupEllipse, degreesFromVertical, toTargetPlane,
  ellipseBoundingBox, outerRingCrop, fromCropFraction, fromCropWidthFraction,
} from '../src/lib/geometry.ts'
import { analyse, analyseSingleBout } from '../src/lib/diagnostics.ts'
import { recommend } from '../src/lib/training.ts'
import { scoreShot, scoreBout, ringRadii } from '../src/lib/scoring.ts'
import { METAL_TARGETS, hitCount, metalStats, missCount, targetStats } from '../src/lib/metal.ts'
import { DEFAULT_SETTINGS, faceById, scoringContext, settingsContext, type Bout, type Bull, type MetalBout, type MetalTarget, type Position, type Settings, type Shot, type Workout } from '../src/lib/types.ts'
import { locateBlack, type PixelBuffer } from '../src/lib/blackLocator.ts'

const CTX = settingsContext(DEFAULT_SETTINGS)

let failures = 0
const ok = (label: string, cond: boolean, extra = '') => {
  if (!cond) failures += 1
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

// --- Calibration: a head-on 45 mm mark, hole one radius to the right.
const flat: Bull = { id: 'b', centre: { x: 0.5, y: 0.5 }, semiMajor: 0.1, semiMinor: 0.1, rotationDeg: 0, holes: [] }
const right = toTargetPlane({ x: 0.6, y: 0.5 }, flat, 45)
ok('scale: one semi-major right = 22.5 mm right', Math.abs(right.x - 22.5) < 0.01 && Math.abs(right.y) < 0.01, JSON.stringify(right))
const up = toTargetPlane({ x: 0.5, y: 0.4 }, flat, 45)
ok('y flips: higher in image = +y', up.y > 22.4 && up.y < 22.6, JSON.stringify(up))

// --- Perspective: mark squashed vertically by 2x should double vertical offsets.
const squashed: Bull = { ...flat, semiMinor: 0.05, rotationDeg: 0 }
const sq = toTargetPlane({ x: 0.5, y: 0.45 }, squashed, 45)
ok('deskew: squashed axis stretched back', Math.abs(sq.y - 22.5) < 0.01, JSON.stringify(sq))

// --- One unit system: both axes are fractions of the image WIDTH.
// A hole the same number of pixels right and below the centre must come out
// the same number of millimetres away. When y was a fraction of HEIGHT instead,
// a 4:3 photo inflated every vertical distance by a third and manufactured
// vertical stringing out of a round group.
const square: Bull = { id: 'b', centre: { x: 0.5, y: 0.375 }, semiMajor: 0.1, semiMinor: 0.1, rotationDeg: 0, holes: [] }
const acrossPx = toTargetPlane({ x: 0.6, y: 0.375 }, square, 45)
const downPx = toTargetPlane({ x: 0.5, y: 0.475 }, square, 45)
ok('equal pixel offsets give equal millimetres on a 4:3 photo',
   Math.abs(Math.abs(acrossPx.x) - Math.abs(downPx.y)) < 1e-9,
   `right=${acrossPx.x.toFixed(3)} down=${downPx.y.toFixed(3)}`)

// --- Group ellipse orientation.
const vertical = [{ x: 0, y: -20 }, { x: 1, y: -10 }, { x: -1, y: 0 }, { x: 0, y: 10 }, { x: 1, y: 20 }]
const ve = groupEllipse(vertical)
ok('vertical string detected', ve.aspect > 3 && degreesFromVertical(ve.angleDeg) < 10, `aspect=${ve.aspect.toFixed(1)} fromVert=${degreesFromVertical(ve.angleDeg).toFixed(1)}`)
const horizontal = vertical.map((p) => ({ x: p.y, y: p.x }))
const he = groupEllipse(horizontal)
ok('horizontal string detected', he.aspect > 3 && degreesFromVertical(he.angleDeg) > 80, `fromVert=${degreesFromVertical(he.angleDeg).toFixed(1)}`)

// --- Metrics on a known group.
const mk = (pts: {x:number;y:number}[]): Shot[] => pts.map((mm, i) => ({ order: i + 1, mm, bullId: 'b' }))
const tight = mk([{x:14,y:14},{x:16,y:14},{x:15,y:16},{x:14,y:15},{x:16,y:16}])
const m = computeMetrics(tight, 'prone', CTX)
ok('mpi right and high', m.mpi.x > 14 && m.mpi.y > 14)
ok('correction points down-left', m.correction.verticalDir === 'down' && m.correction.horizontalDir === 'left',
   `${m.correction.vertical} down, ${m.correction.horizontal} left`)
ok('tight group: hitsIfZeroed beats hits', m.hitsIfZeroed === 5 && m.hits < 5, `hits=${m.hits} ifZeroed=${m.hitsIfZeroed}`)

// --- Flier.
const withFlier = mk([{x:0,y:0},{x:2,y:1},{x:-1,y:2},{x:1,y:-2},{x:40,y:35}])
ok('flier found at index 4', computeMetrics(withFlier, 'prone', CTX).flierIndex === 4)
ok('no flier in an even group', computeMetrics(tight, 'prone', CTX).flierIndex === null)

// --- Splitters: prone hit zone is 45 mm across (radius 22.5), .22 bullet
// radius 2.8 mm, so a hole is a splitter from 19.7 to 25.3 mm out.
const edge = mk([{x:0,y:0},{x:20,y:0},{x:22.5,y:0},{x:25,y:0},{x:30,y:0}])
const em = computeMetrics(edge, 'prone', CTX)
ok('dead centre is not a splitter', em.splitters[0] === false)
ok('just inside the hit zone is a splitter', em.splitters[1] === true)
ok('exactly on the hit-zone edge is a splitter', em.splitters[2] === true)
ok('just outside the hit zone is a splitter', em.splitters[3] === true)
ok('well outside the hit zone is a clean miss, not a splitter', em.splitters[4] === false)
ok('splitterShots counts them', em.splitterShots === 3, String(em.splitterShots))

// The same edge, on the much larger standing hit zone (115 mm, radius 57.5),
// should not falsely flag as splitters — position-aware, not a flat distance.
const standingEdge = mk([{x:22.5,y:0}])
ok('splitter check is position-aware', computeMetrics(standingEdge, 'standing', CTX).splitters[0] === false)

// --- Multi-bull overlay: five bulls, one shot each, all 5 mm right of their own centre.
const bulls: Bull[] = [0,1,2,3,4].map((i) => ({
  id: `b${i}`, centre: { x: 0.15 + i * 0.17, y: 0.5 }, semiMajor: 0.05, semiMinor: 0.05, rotationDeg: 0,
  holes: [{ x: 0.15 + i * 0.17 + 0.05, y: 0.5 }],
}))
const overlay = bullsToShots(bulls, 45)
ok('five bulls compose into a five-shot group', overlay.length === 5 && overlay.every((s) => Math.abs(s.mm.x - 22.5) < 0.01))

// --- Ring scoring on the ISSF 50 m rifle face.
// Ten ring 10.4 mm across (radius 5.2), rings every 8 mm, .22 hole 5.6 mm
// across (radius 2.8). The rule turns on the edge of the hole, so a shot
// centred 8.0 mm out still touches the ten-ring line at 5.2 mm.
const f50 = faceById('issf-50m')
const radii50 = ringRadii(f50)
ok('ten ring radius is 5.2 mm', Math.abs(radii50[0] - 5.2) < 1e-9, String(radii50[0]))
ok('one ring is 154.4 mm across', Math.abs(radii50[9] * 2 - 154.4) < 1e-9, String(radii50[9] * 2))
ok('rings run 10 down to 1', radii50.length === 10)

const ring = (x: number) => scoreShot({ x, y: 0 }, f50, 5.6).value
ok('dead centre is a ten', ring(0) === 10)
ok('edge exactly on the ten line still scores ten', ring(5.2 + 2.8) === 10, `at 8.0 mm -> ${ring(8.0)}`)
ok('a hair further out drops to nine', ring(8.05) === 9, `at 8.05 mm -> ${ring(8.05)}`)
ok('inward gauge is worth a ring', ring(7.5) === 10 && Math.hypot(7.5, 0) > 5.2)
ok('edge on the nine line scores nine', ring(13.2 + 2.8) === 9, `at 16.0 mm -> ${ring(16.0)}`)
ok('outside the one ring scores zero', ring(90) === 0)
ok('inner ten needs the hole edge inside 2.5 mm', scoreShot({x:5.2,y:0}, f50, 5.6).innerTen && !scoreShot({x:5.4,y:0}, f50, 5.6).innerTen)

// A shot right on a line is flagged rather than quietly rounded.
ok('shot on a ring line is flagged borderline', scoreShot({ x: 8.0, y: 0 }, f50, 5.6).borderline)
ok('shot in the middle of a ring is not', !scoreShot({ x: 11.6, y: 0 }, f50, 5.6).borderline)

// Air rifle: a 4.5 mm pellet and a 0.5 mm ten ring.
const fAir = faceById('issf-10m-air')
ok('air ten ring is 0.5 mm across', Math.abs(ringRadii(fAir)[0] * 2 - 0.5) < 1e-9)
ok('air pellet edge on the ten line scores ten', scoreShot({ x: 0.25 + 2.25, y: 0 }, fAir, 4.5).value === 10)
ok('air one ring is 45.5 mm across', Math.abs(ringRadii(fAir)[9] * 2 - 45.5) < 1e-9)

const card = scoreBout([{x:0,y:0},{x:8,y:0},{x:0,y:-16},{x:20,y:20},{x:200,y:0}], f50, 5.6)
ok('bout totals its rings', card.total === 10 + 10 + 9 + 7 + 0, `total=${card.total} rings=${card.rings.map(r=>r.value).join(',')}`)
ok('bout knows what was possible', card.possible === 50)

// A scaled-down face keeps its proportions.
const half = { ...f50, blackMm: f50.blackMm / 2, tenRingMm: f50.tenRingMm / 2, ringSpacingMm: f50.ringSpacingMm / 2 }
ok('half-size face halves the ring radii', Math.abs(ringRadii(half)[0] - radii50[0] / 2) < 1e-9)

// --- Points lost to a bad zero.
const offCentre = mk([{x:12,y:12},{x:14,y:13},{x:13,y:15},{x:12,y:14},{x:14,y:12}])
const om = computeMetrics(offCentre, 'prone', CTX)
ok('score if zeroed beats the score as fired', om.ringTotalIfZeroed > om.ringTotal,
   `${om.ringTotal} -> ${om.ringTotalIfZeroed}`)

// --- Diagnostics.
const bout = (position: Position, pts: {x:number;y:number}[], skiedIn = false, daysAgo = 1, workoutId = 'w'): Bout => {
  const shots = mk(pts)
  return {
    kind: 'precision', id: crypto.randomUUID(), workoutId,
    shotAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    position, targetFaceId: DEFAULT_SETTINGS.targetFaceId,
    bulletDiameterMm: DEFAULT_SETTINGS.bulletDiameterMm, imagePath: 'x', shots,
    context: { skiedIn, notes: '' },
    mmPerUnit: 1, metrics: computeMetrics(shots, position, CTX),
  }
}

const offZero = [0,1,2,3].map((i) => bout('prone', [{x:14,y:12},{x:16,y:13},{x:15,y:15},{x:14,y:14},{x:16,y:12}], false, i + 1))
let f = analyse(offZero, DEFAULT_SETTINGS)
ok('zero offset diagnosed', f.some((x) => x.id === 'zero_offset'), f.map(x=>x.id).join(','))
ok('zero drill ranked first', recommend(f)[0]?.drill.addresses.includes('zero_offset') === true, recommend(f)[0]?.drill.name)

const strung = [0,1,2,3].map((i) => bout('prone', [{x:0,y:-18},{x:1,y:-9},{x:-1,y:1},{x:0,y:10},{x:1,y:19}], false, i + 1))
f = analyse(strung, DEFAULT_SETTINGS)
ok('vertical stringing diagnosed', f.some((x) => x.id === 'vertical_stringing'), f.map(x=>x.id).join(','))
ok('breathing drill recommended', recommend(f).some((r) => r.drill.id === 'breathing-pause'))

const cold = [0,1,2,3].map((i) => bout('prone', [{x:25,y:-22},{x:1,y:1},{x:-1,y:2},{x:2,y:-1},{x:0,y:0}], true, i + 1))
f = analyse(cold, DEFAULT_SETTINGS)
ok('cold first shot diagnosed', f.some((x) => x.id === 'cold_first_shot'), f.map(x=>x.id).join(','))
ok('range entry drill recommended', recommend(f).some((r) => r.drill.id === 'range-entry'))

const good = [0,1,2,3].map((i) => bout('prone', [{x:2,y:1},{x:-2,y:2},{x:1,y:-2},{x:-1,y:-1},{x:0,y:1}], false, i + 1))
f = analyse(good, DEFAULT_SETTINGS)
ok('clean shooting gets the progression note', f[0]?.id === 'solid', f.map(x=>x.id).join(','))
ok('progression drill recommended', recommend(f).some((r) => r.drill.id === 'progression'))

const gap = [...[0,1,2].map((i) => bout('prone', [{x:2,y:1},{x:-2,y:2},{x:1,y:-2},{x:-1,y:-1},{x:0,y:1}], false, i+1)),
             ...[0,1,2].map((i) => bout('standing', [{x:40,y:30},{x:-35,y:25},{x:20,y:-40},{x:-30,y:-20},{x:5,y:45}], false, i+4))]
f = analyse(gap, DEFAULT_SETTINGS)
ok('standing gap diagnosed', f.some((x) => x.id === 'standing_gap'), f.map(x=>x.id).join(','))

ok('no findings from no bouts', analyse([], DEFAULT_SETTINGS).length === 0)

// --- Early signs: too few bouts (n<3) for any confirmed rule to fire, but
// the group is meaningfully off-centre — should say so rather than stay
// silent. Standing hit radius is 57.5 mm; 17 mm offset clears the 0.25x
// bar (14.375 mm) but not zero_offset's own 0.35x bar (20.125 mm), and the
// tiny 4 mm mean radius keeps wide_group and the stringing checks well out
// of range, isolating this to the new fallback alone.
const thinOffCentre = [0, 1].map((i) =>
  bout('standing', [{x:22,y:0},{x:12,y:0},{x:17,y:5},{x:17,y:-5},{x:17,y:0}], false, i + 1),
)
f = analyse(thinOffCentre, DEFAULT_SETTINGS)
ok('early signs surfaced from a thin, off-centre sample', f.some((x) => x.id === 'early_signs'), f.map(x=>x.id).join(','))

// A thin sample with genuinely clean numbers should stay quiet — this is
// not "always say something for n<3", only "don't hide a real signal".
const thinClean = [0, 1].map((i) =>
  bout('standing', [{x:2,y:1},{x:-2,y:2},{x:1,y:-2},{x:-1,y:-1},{x:0,y:1}], false, i + 1),
)
f = analyse(thinClean, DEFAULT_SETTINGS)
ok('no early-signs false positive on a thin, clean sample', !f.some((x) => x.id === 'early_signs'), f.map(x=>x.id).join(','))

// --- Wind sensitivity: same shooter, tight both times, but pushed sideways
// only in the bouts shot in strong wind.
const mkWorkout = (id: string, wind: Workout['wind']): Workout => ({
  id, startedAt: new Date().toISOString(), name: '', wind, windDirection: '3', clickLog: [], notes: '', coachNotes: [],
})
const calmBouts = [0, 1].map((i) => bout('prone', [{x:2,y:1},{x:1,y:-1},{x:3,y:0},{x:1,y:1},{x:2,y:-1}], false, i+1, `w-calm-${i}`))
const windyBouts = [0, 1].map((i) => bout('prone', [{x:16,y:1},{x:14,y:-1},{x:15,y:0},{x:14,y:1},{x:16,y:-1}], false, i+1, `w-windy-${i}`))
const windWorkouts = [
  ...calmBouts.map((b) => mkWorkout(b.workoutId, 'none')),
  ...windyBouts.map((b) => mkWorkout(b.workoutId, 'strong')),
]
f = analyse([...calmBouts, ...windyBouts], DEFAULT_SETTINGS, windWorkouts)
ok('wind sensitivity diagnosed', f.some((x) => x.id === 'wind_sensitivity'), f.map(x=>x.id).join(','))
ok('wind sensitivity silent with no workouts given', !analyse([...calmBouts, ...windyBouts], DEFAULT_SETTINGS).some((x) => x.id === 'wind_sensitivity'))

// --- Single-bout read: the same strung-vertically shape as above, from one
// bout alone, with no trend to confirm it against.
const oneStrung = bout('prone', [{x:0,y:-18},{x:1,y:-9},{x:-1,y:1},{x:0,y:10},{x:1,y:19}])
ok('single bout flags vertical stringing', analyseSingleBout(oneStrung, DEFAULT_SETTINGS).some((x) => x.id === 'vertical_stringing'))
ok('single bout cannot see a drift trend', !analyseSingleBout(oneStrung, DEFAULT_SETTINGS).some((x) => x.id === 'fatigue_drift'))

// Changing the face rescales every score without touching the stored shots.
const airSettings: Settings = { ...DEFAULT_SETTINGS, targetFaceId: 'issf-10m-air', bulletDiameterMm: 4.5 }
ok('the same group scores lower on the smaller air face',
   computeMetrics(tight, 'prone', settingsContext(airSettings)).ringTotal <
     computeMetrics(tight, 'prone', CTX).ringTotal)

// A bout carries the face it was shot on, so changing the setting later must
// not rescore old paper against a target it was never fired at.
const fiftyBout = bout('prone', [{x:14,y:14},{x:16,y:14},{x:15,y:16},{x:14,y:15},{x:16,y:16}])
ok('an old bout keeps its own face',
   computeMetrics(fiftyBout.shots, 'prone', scoringContext(fiftyBout, airSettings)).ringTotal ===
     computeMetrics(fiftyBout.shots, 'prone', CTX).ringTotal,
   `bout face = ${fiftyBout.targetFaceId}`)
ok('a bout saved before faces existed falls back to settings',
   scoringContext(
     { targetFaceId: undefined as unknown as string, bulletDiameterMm: undefined as unknown as number },
     airSettings,
   ).faceId === 'issf-10m-air')
ok('single shot does not crash', computeMetrics(mk([{x:1,y:1}]), 'prone', CTX).meanRadius === 0)

// --- Crop-and-zoom detection: the maths that lets the model be sent a
// zoomed-in view of one aiming mark instead of the whole photo.
const unrotatedBox = ellipseBoundingBox(0.2, 0.1, 0)
ok('unrotated ellipse bbox is its own axes', Math.abs(unrotatedBox.halfWidth - 0.2) < 1e-9 && Math.abs(unrotatedBox.halfHeight - 0.1) < 1e-9)
const rotatedBox = ellipseBoundingBox(0.2, 0.1, 90)
ok('a 90-degree rotation swaps the axes', Math.abs(rotatedBox.halfWidth - 0.1) < 1e-9 && Math.abs(rotatedBox.halfHeight - 0.2) < 1e-9)

// A square photo, black centred, so the crop can be checked against the
// known outer/black ratio for the 50 m face without perspective muddying it.
const centredBull: Bull = { id: 'b', centre: { x: 0.5, y: 0.5 }, semiMajor: 0.1, semiMinor: 0.1, rotationDeg: 0, holes: [] }
const outerToBlack = (radii50[radii50.length - 1]) / (f50.blackMm / 2)
const rect = outerRingCrop(centredBull, f50, 1, 1)
ok('outer-ring crop scales by the printed face\'s own ring geometry',
   Math.abs((rect.x1 - centredBull.centre.x) - centredBull.semiMajor * outerToBlack) < 1e-9,
   `expected ${(centredBull.semiMajor * outerToBlack).toFixed(4)}, got ${(rect.x1 - centredBull.centre.x).toFixed(4)}`)
ok('outer-ring crop is wider than the black alone', rect.x1 - rect.x0 > centredBull.semiMajor * 2)

// Cropping and remapping a point should be lossless: what goes in comes back out.
const wideRect = { x0: 0.2, y0: 0.1, x1: 0.6, y1: 0.7 }
const known = fromCropFraction(wideRect, 0.25, 0.75)
ok('crop remap recovers a corner', Math.abs(known.x - 0.3) < 1e-9 && Math.abs(known.y - 0.55) < 1e-9, JSON.stringify(known))
const inverseX = (known.x - wideRect.x0) / (wideRect.x1 - wideRect.x0)
const inverseY = (known.y - wideRect.y0) / (wideRect.y1 - wideRect.y0)
ok('crop remap round-trips', Math.abs(inverseX - 0.25) < 1e-9 && Math.abs(inverseY - 0.75) < 1e-9)
ok('crop width-fraction scales a length by the crop width only',
   Math.abs(fromCropWidthFraction(wideRect, 0.5) - 0.2) < 1e-9)

// --- Metal bouts: no photo, no shape — a hit rate per position, and per target.
const metal = (position: Position, missed: MetalTarget[]): MetalBout => ({
  kind: 'metal', id: crypto.randomUUID(), workoutId: 'w',
  shotAt: new Date().toISOString(), position, heartRate: 0, comboId: null, isRace: false,
  hits: Object.fromEntries(METAL_TARGETS.map((t) => [t, !missed.includes(t)])) as Record<MetalTarget, boolean>,
})
const metalSet = [metal('prone', []), metal('prone', ['alpha']), metal('standing', ['alpha', 'beta'])]
const stats = metalStats(metalSet)
const proneStat = stats.find((s) => s.position === 'prone')
const standingStat = stats.find((s) => s.position === 'standing')
ok('metal hit rate averages across bouts of the same position', proneStat?.hitRatePct === 90, JSON.stringify(proneStat))
ok('metal hit rate is independent per position', standingStat?.hitRatePct === 60, JSON.stringify(standingStat))
ok('a position with no metal bouts is left out', metalStats([metal('prone', [])]).length === 1)
ok('no metal bouts gives no stats', metalStats([]).length === 0)
ok('hitCount and missCount are complementary', hitCount(metal('prone', ['alpha', 'beta']).hits) + missCount(metal('prone', ['alpha', 'beta']).hits) === METAL_TARGETS.length)

// A target missed disproportionately often is exactly the pattern per-target
// recording exists to surface — a bare miss count could never show this.
const patternSet = [metal('prone', ['alpha']), metal('prone', ['alpha']), metal('standing', ['charlie'])]
const targets = targetStats(patternSet)
const alpha = targets.find((t) => t.target === 'alpha')
const charlie = targets.find((t) => t.target === 'charlie')
ok('the target missed most often is identifiable', alpha?.misses === 2 && alpha?.missRatePct === 67, JSON.stringify(alpha))
ok('a target missed once elsewhere is tracked separately', charlie?.misses === 1 && charlie?.missRatePct === 33, JSON.stringify(charlie))
ok('no bouts gives no target stats', targetStats([]).length === 0)

// --- Deterministic black-locator: synthetic images with a known answer,
// covering exactly the failure modes real photos exposed (see blackLocator.ts).
function blankCanvas(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  return { width, height, data }
}
function paintDisc(img: PixelBuffer, cx: number, cy: number, r: number, gray: number, rInner = 0) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2
      if (d2 <= r * r && d2 >= rInner * rInner) {
        const i = (y * img.width + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = gray
      }
    }
  }
}
function paintSquare(img: PixelBuffer, x0: number, y0: number, size: number, gray: number) {
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      const i = (y * img.width + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = gray
    }
  }
}

{
  const img = blankCanvas(200, 200)
  paintDisc(img, 100, 100, 60, 10)
  const r = locateBlack(img)
  ok(
    'finds a plain black disc on white',
    r !== null && Math.abs(r.cx - 100) < 2 && Math.abs(r.cy - 100) < 2 && Math.abs(r.semiMajor - 60) < 2,
    JSON.stringify(r),
  )
}

{
  // A flash-blown shot hole inside the black must not fragment it — the
  // real bug this fixed (blackLocator.ts's fillEnclosedHoles).
  const img = blankCanvas(200, 200)
  paintDisc(img, 100, 100, 60, 10)
  paintDisc(img, 90, 90, 8, 255)
  const r = locateBlack(img)
  ok(
    'a small enclosed flash hole is filled, not left fragmenting the disc',
    r !== null && Math.abs(r.semiMajor - 60) < 3 && r.fillRatio > 0.9,
    JSON.stringify(r),
  )
}

{
  // A separate dark shape sitting nearby — a shadow, a score table — must
  // never get welded onto the real black the way naive dilation did.
  const img = blankCanvas(300, 300)
  paintDisc(img, 60, 60, 40, 10)
  paintSquare(img, 250, 250, 20, 10)
  const r = locateBlack(img)
  ok(
    'a separate nearby dark shape is not merged into the black',
    r !== null && Math.abs(r.cx - 60) < 3 && Math.abs(r.cy - 60) < 3 && Math.abs(r.semiMajor - 40) < 3,
    JSON.stringify(r),
  )
}

{
  // The gap between the black and an outer scoring ring is also technically
  // "enclosed," but far too big to be a shot hole — must stay unfilled.
  const img = blankCanvas(300, 300)
  paintDisc(img, 150, 150, 40, 10)
  paintDisc(img, 150, 150, 75, 10, 70)
  const r = locateBlack(img)
  ok(
    'the gap to an outer scoring ring is too big to fill, so only the black is measured',
    r !== null && Math.abs(r.semiMajor - 40) < 3,
    JSON.stringify(r),
  )
}

{
  const img = blankCanvas(200, 200)
  paintDisc(img, 100, 100, 3, 10)
  ok('a speck too small to be a real aiming mark is ignored', locateBlack(img) === null)
}

{
  // A good shooter blows out the centre of the black with overlapping
  // shots — too big a hole to count as a small flash spot, so it stays
  // unfilled. A mass-based fit would drag the centre toward the remaining
  // crescent; the boundary fit never looks at the interior at all.
  const img = blankCanvas(200, 200)
  paintDisc(img, 100, 100, 60, 10)
  paintDisc(img, 115, 100, 20, 255)
  const r = locateBlack(img)
  ok(
    'a blown-out centre cluster does not drag the fit off-centre',
    r !== null && Math.abs(r.cx - 100) < 2 && Math.abs(r.cy - 100) < 2 && Math.abs(r.semiMajor - 60) < 2,
    JSON.stringify(r),
  )
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
if (failures > 0) process.exit(1)
