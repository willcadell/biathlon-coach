// Checks for the dry-fire sensor trainer's maths: decoding the receiver's records, the shot rule, the learned target map, the calibration
// solver and its quality figures, scoring, and the route simplification. The numbers in the calibration checks come from recorded sessions.
//
// Run with `npm test`.

import { readFileSync } from 'node:fs'
import {
  AimTracker, classify, decodeAimRecord, splitRecords, TargetMap,
  CALIBRATION_PULLS, MODEL_DEFAULT, holdBefore, aimSpeed, currentModel, deriveCentres, groupPulls, needsExtraPull, observeBout, qualityOf, refineModel, solveCalibration,
  nearestTarget, scoreShot, judgeSupport, legStats, simplify, type Pull, type SavedCalibration, type TrackRow,
} from '../src/lib/sensor/index.ts'

let failures = 0
const ok = (label: string, cond: boolean, extra = '') => {
  if (!cond) failures += 1
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol

// --- Building records the way the receiver sends them
const int16 = (v: number) => [v & 0xff, (v >> 8) & 0xff]
/** A 17-byte aim record (or a 19-byte trigger record when strength is given), optionally flagged (payload inverted). */
function record(seq: number, p1: [number, number], p2: [number, number], opts: { strength?: number; flagged?: boolean; valid?: boolean } = {}): Uint8Array {
  const trigger = opts.strength !== undefined
  const b = [trigger ? 19 : 17, 0x44, 0x8a, trigger ? 0x90 : 0x8e, 0x05, 0x03, 0xc9, seq, 0, ...int16(p1[0]), ...int16(p1[1]), ...int16(p2[0]), ...int16(p2[1])]
  if (trigger) b.push(opts.valid === false ? 0x80 | 3 : 3, opts.strength as number)
  if (opts.flagged) { b[3] |= 0x40; for (let i = 4; i < b.length; i++) b[i] ^= 0xff }
  return Uint8Array.from(b)
}

// --- Decoding
{
  const aim = record(7, [500, -250], [510, -240])
  const d = decodeAimRecord(aim)
  ok('decode: an aim record gives its two points', d !== null && d.points[0][0] === 500 && d.points[0][1] === -250 && d.points[1][0] === 510 && d.points[1][1] === -240 && d.seq === 7)
  ok('classify: 17 bytes is aim, 19 with the trigger header is trigger', classify(aim) === 'aim' && classify(record(1, [0, 0], [0, 0], { strength: 170 })) === 'trigger')
  const flagged = decodeAimRecord(record(8, [500, -250], [510, -240], { flagged: true }))
  ok('decode: a flagged record is un-inverted', flagged !== null && flagged.flagged && flagged.points[0][0] === 500 && flagged.points[1][1] === -240)
  const flaggedTrigger = decodeAimRecord(record(9, [100, 100], [110, 110], { strength: 169, flagged: true }))
  ok('decode: a flagged trigger record reads its strength after un-inverting (169, not 86)', flaggedTrigger?.trigger?.amplitude === 169 && flaggedTrigger.trigger.valid)
  const bad = decodeAimRecord(record(1, [0, 0], [0, 0], { strength: 170, valid: false }))
  ok('decode: the invalid bit is read', bad?.trigger?.valid === false)

  const two = Uint8Array.from([...aim, ...record(8, [1, 2], [3, 4]).slice(0, 5)])
  const split = splitRecords(two)
  ok('splitRecords: one whole record and the unfinished rest', split.records.length === 1 && split.rest.length === 5)
}

// --- A real excerpt: about two seconds around a pull (npm test runs from the repo root, so the path is relative to it)
{
  const fx = JSON.parse(readFileSync('test/fixtures/sensor-excerpt.json', 'utf8')) as { records: { t: number; kind: string; hex: string }[] }
  const tracker = new AimTracker()
  tracker.flipX = true; tracker.flipY = true; tracker.scale = 3.2
  let samples = 0, shots = 0, echoes = 0
  let shotAt = 0
  for (const r of fx.records) {
    const bytes = Uint8Array.from(r.hex.split(' ').map((h) => parseInt(h, 16)))
    const out = tracker.process(bytes, r.t)
    if (!out) continue
    samples += out.samples.length
    if (out.shot) { shots++; shotAt = out.shot.t }
    if (out.echo) echoes++
  }
  ok('excerpt: every record decodes to two samples', samples === fx.records.length * 2, `${samples} samples from ${fx.records.length} records`)
  ok('excerpt: exactly one shot, at the trigger record', shots === 1 && shotAt === fx.records.find((r) => r.kind === 'trigger')?.t, `shot at ${shotAt}`)
  ok('excerpt: no echo of it inside the window', echoes === 0)
}

// --- The shot rule: strength, validity, echo debounce
{
  const t = new AimTracker()
  const at = (ms: number, strength: number, flagged = false) => t.process(record(1, [0, 0], [0, 0], { strength, flagged }), ms)
  ok('shot rule: a strength-170 pull counts', at(1000, 170)?.shot !== null)
  const echo = at(1600, 168)
  ok('shot rule: a strong record 0.6 s later is an echo, not a shot', echo?.shot === null && echo.echo)
  ok('shot rule: a weak record (bolt) never counts', at(5000, 120)?.shot === null)
  ok('shot rule: a flagged strong record counts too', at(9000, 169, true)?.shot !== null)
  ok('shot rule: after 1.5 s a strong record is a new shot', at(11000, 170)?.shot !== null)
}

// --- Holds: the median before a pull, and the speed
{
  const buf = Array.from({ length: 200 }, (_, i) => ({ t: i * 10, ux: -37 + (i % 2) * 0.4, uy: 5 + ((i * 7) % 3) * 0.2 }))
  const h = holdBefore(buf, 1990)
  ok('hold: the median aim before the pull and a small wobble', h !== null && near(h.x, -36.8, 0.25) && near(h.y, 5.2, 0.3) && h.wobble < 0.5, JSON.stringify(h))
  ok('hold: too few samples in the window gives nothing', holdBefore(buf.filter((_, i) => i % 10 === 0), 1990) === null)
  const still = buf.map((p, i) => ({ ...p, ux: -37 + (i % 2) * 0.1, uy: 5 }))     // 0.1 units every 10 ms: 10 units a second
  ok('speed: a still aim is slow, a moving one fast', (aimSpeed(still) ?? 99) < 30 && (aimSpeed(buf.map((p, i) => ({ ...p, ux: i }))) ?? 0) > 90)
}

// --- The target map
{
  const five = [-30, -13, 0, 15, 46].map((x, i) => ({ x, y: [-1, -1, 0, 6, 22][i] }))
  const map = new TargetMap(five, 25)
  ok('map: every centre lands on its target (-50 .. 50 mm)', five.every((c, i) => near(map.apply(c.x, c.y).x, (i - 2) * 25) && near(map.apply(c.x, c.y).y, 0)))
  ok('map: halfway between neighbours lands halfway', near(map.apply(-6.5, 0).x, -12.5, 0.01) && near(map.apply(7.5, 3).x, 12.5, 0.01))
  ok('map: past Echo the last segment carries on at its own scale', near(map.apply(61, 22).x, 62.1, 0.2))
  ok('map: check rejects centres out of order or on top of each other', TargetMap.check([{ x: 0, y: 0 }, { x: -5, y: 0 }]) !== null && TargetMap.check([{ x: 0, y: 0 }, { x: 0.5, y: 0 }]) !== null && TargetMap.check(five) === null)
  const three = new TargetMap([{ x: -37, y: 0 }, { x: 0, y: 0 }, { x: 51, y: 0 }], 25, [0, 2, 4])
  ok('map: with anchors 0, 2, 4 the segments span two targets each', near(three.apply(-37, 0).x, -50) && near(three.apply(0, 0).x, 0) && near(three.apply(51, 0).x, 50) && near(three.apply(-18.5, 0).x, -25))
}

// --- Calibration: pulls, strays, the extra pull
{
  const set = CALIBRATION_PULLS
  const pull = (x: number, y = 0, wobble = 5): Pull => ({ x, y, wobble })
  ok('pulls: the default set is two each on Alpha, Charlie and Echo', set.join() === '0,0,2,2,4,4')
  const agree = [pull(-37), pull(-36)]
  ok('extra pull: a pair that agrees needs no third pull', !needsExtraPull(set, agree) && !needsExtraPull(set, [...agree, pull(0), pull(1)]))
  ok('extra pull: a pair more than 15 mm apart earns a third on Alpha', needsExtraPull(set, [pull(-37), pull(-10)]))
  ok('extra pull: Echo gets 25 mm of slack', !needsExtraPull(set, [pull(-37), pull(-36), pull(0), pull(1), pull(40), pull(60)]) && needsExtraPull(set, [pull(-37), pull(-36), pull(0), pull(1), pull(40), pull(70)]))

  const g = groupPulls([0, 0, 0, 2, 2, 4, 4, 4], [pull(-31), pull(-29), pull(-8), pull(0), pull(1), pull(47), pull(43), pull(49)])
  ok('groupPulls: a stray third pull is dropped and the rest averaged', g.results[0].dropped === 1 && near(g.results[0].x, -30) && g.shaky.length === 0)
  const shakyTwo = groupPulls([0, 0], [pull(-31, 0, 30), pull(-29)])
  ok('groupPulls: a very shaky pull among two cannot be dropped', shakyTwo.shaky.length === 1)
  const shakyThree = groupPulls([0, 0, 0], [pull(-31, 0, 30), pull(-29), pull(-30)])
  ok('groupPulls: among three it is dropped instead', shakyThree.shaky.length === 0 && shakyThree.results[0].dropped === 1)
}

// --- Calibration: a whole pass, with numbers from the 14:08 session (acceptable) and the 14:02 session (poor)
{
  const model = currentModel(null)
  const p = (x: number, y: number, wobble: number): Pull => ({ x, y, wobble })
  // Alpha pair 7.2 mm apart, Charlie pair 3.5, Echo pair 11.4 (the 14:08 session's repeat figures), positions -33 / 0 / 47.
  const pass = [p(-34.5, -4, 9), p(-31.7, -4, 9), p(0.4, 0, 5.8), p(-0.4, 0, 5.8), p(47, -17, 8.3), p(46.9, -17.4, 8.3)]
  const first = solveCalibration(CALIBRATION_PULLS, pass, null, model)
  ok('solve: a clean first pass is saved, Charlie is the zero', 'saved' in first && first.discarded === false && near(first.charlie.x, 0, 0.5))
  if ('saved' in first) {
    ok('solve: five centres, Alpha and Echo as measured, Bravo 60% of the way from Alpha', first.centres.length === 5 && near(first.centres[0].x, -33.1, 0.6) && near(first.centres[1].x, first.centres[0].x + 0.6 * (first.centres[2].x - first.centres[0].x), 0.01))
    ok('solve: a clean pass is rated good or acceptable, with its RMS in millimetres', first.quality.verdict !== 'poor' && first.quality.overall > 3 && first.quality.overall < 10, `${first.quality.verdict} ${first.quality.overall.toFixed(1)} mm`)
    ok('solve: the first pass is not compared with anything', first.quality.agreeRms === null && first.quality.rows.every((r) => r.diff === null))

    const earlier: SavedCalibration = first.saved
    // A second pass in the same session: Alpha's pair is 26 mm apart (poor), Charlie and Echo agree.
    const poorAlpha = [p(-20, -4, 8), p(-46, -4, 8), p(0.4, 0, 5.8), p(-0.4, 0, 5.8), p(47.2, -17, 8.3), p(46.7, -17, 8.3)]
    const second = solveCalibration(CALIBRATION_PULLS, poorAlpha, earlier, model)
    ok('solve: a poor Alpha keeps its earlier centre while Echo is averaged in', 'saved' in second && !second.discarded && second.kept.join() === 'Alpha' && near(second.saved.base[0].x, earlier.base[0].x, 0.001))
    // A pass where only Charlie is usable is set aside whole, but its Charlie still sets the zero.
    const wreck = [p(-15, 0, 9), p(-45, 0, 9), p(0, 0, 5), p(0, 0, 5), p(80, -40, 28), p(25, -10, 28)]   // Alpha 30 mm apart, Echo 55 apart: poor, but not grossly
    const third = solveCalibration(CALIBRATION_PULLS, wreck, earlier, model)
    ok('solve: with fewer than two usable targets the pass is set aside whole', 'saved' in third && third.discarded && third.saved.passes === earlier.passes && near(third.saved.base[1].x, 0) && near(third.saved.base[2].x, earlier.base[2].x, 0.001))
  }
  const rejected = solveCalibration(CALIBRATION_PULLS, [p(-30, 0, 40), p(-29, 0, 5), p(0, 0, 5), p(0, 0, 5), p(47, 0, 5), p(46, 0, 5)], null, model)
  ok('solve: a grossly shaky pair rejects the pass and names the target', 'rejected' in rejected && /Alpha/.test(rejected.rejected))
  const reversed = solveCalibration(CALIBRATION_PULLS, [p(40, 0, 5), p(41, 0, 5), p(0, 0, 5), p(0, 0, 5), p(-37, 0, 5), p(-36, 0, 5)], null, model)
  ok('solve: Alpha to the right of Echo is rejected', 'rejected' in reversed)

  // The 14:02 session: Alpha 9.8 / 18.8 mm apart, Echo 14.5 / 25.3 mm apart: poor.
  const bad = qualityOf(
    [{ target: 0, name: 'Alpha', x: -46, y: -7, wobble: 9.8, repeat: 18.8, dropped: 0 }, { target: 2, name: 'Charlie', x: 0, y: 0, wobble: 7.7, repeat: 3.4, dropped: 0 }, { target: 4, name: 'Echo', x: 50, y: -16, wobble: 14.5, repeat: 25.3, dropped: 0 }],
    [{ x: -46, y: -7 }, { x: 0, y: 0 }, { x: 50, y: -16 }], null, 1)
  ok('quality: the 14:02 numbers read as poor, overall about 15.6 mm', bad.verdict === 'poor' && near(bad.overall, 15.6, 0.7), `${bad.verdict} ${bad.overall.toFixed(1)}`)
}

// --- The model: Bravo and Delta
{
  const m = currentModel(null)
  ok('model: defaults are 0.60 and 0.36, version 2', near(m.bravo, 0.6) && near(m.delta, 0.36) && m.v === 2 && m.n === 0)
  ok('model: an older saved model is replaced by the defaults', near(currentModel({ v: 1, bravo: 0.43, delta: 0.335, n: 3 }).bravo, MODEL_DEFAULT.bravo))
  const centres = deriveCentres([0, 2, 4], [{ x: -40, y: 0 }, { x: 0, y: 0 }, { x: 50, y: -10 }], m)
  ok('model: Bravo and Delta are placed between their neighbours', near(centres[1].x, -16) && near(centres[3].x, 18) && near(centres[3].y, -3.6))
  const refined = refineModel(m, 0.66, 0.34, 0.5)
  ok('model: a bout observation moves it a little (the prior counts as four)', refined.bravo > m.bravo && refined.bravo < 0.62 && refined.n === 0.5)
  ok('model: an observation far from the model changes nothing', refineModel(m, 0.95, 0.36) === m && refineModel(m, 0.1, 0.36) === m)
  // The 14:20 session's first bout, in the sensor frame: Alpha -41.4, Bravo -13.8, Charlie 0.3, Delta 19.1, Echo 55.8, against anchors -37.3 / 0 / 51.
  const obs = observeBout([-41.41, -13.82, 0.26, 19.14, 55.81], [-37.3, 0, 51])
  ok('bout: an ordered bout shows Bravo at 0.63 and Delta at 0.38 of the way', obs !== null && near(obs.obsB, 0.633, 0.02) && near(obs.obsD, 0.375, 0.02), JSON.stringify(obs))
  ok('bout: fired from Echo to Alpha reads the same', near(observeBout([55.81, 19.14, 0.26, -13.82, -41.41], [-37.3, 0, 51])?.obsB ?? 0, 0.633, 0.02))
  ok('bout: out of order, or too bunched, says nothing', observeBout([-41, 0, -13, 19, 55], [-37, 0, 51]) === null && observeBout([-4, -3, -2, 2, 3], [-3, 0, 3]) === null)
}

// --- Scoring: disc sizes at the 5 m scale
{
  ok('score: the standing disc is 11.5 mm and 5.75 mm from the centre is a hit', scoreShot(5.7, 0, 'standing', { edgeCounts: false }).hit && !scoreShot(5.8, 0, 'standing', { edgeCounts: false }).hit)
  ok('score: the prone disc is 4.5 mm', scoreShot(2.2, 0, 'prone', { edgeCounts: false }).hit && !scoreShot(2.3, 0, 'prone', { edgeCounts: false }).hit)
  ok('score: edge counts adds half a bullet (0.28 mm)', scoreShot(6.0, 0, 'standing', { edgeCounts: true }).hit && !scoreShot(6.1, 0, 'standing', { edgeCounts: true }).hit)
  ok('score: the practice zone widens every disc', scoreShot(10, 0, 'standing', { edgeCounts: false, practice: 5 }).hit && !scoreShot(10, 0, 'standing', { edgeCounts: false }).hit)
  ok('score: the nearest target is found along the row', [-50, -25, 0, 25, 50].map((x) => nearestTarget(x + 3, 0)).join() === '0,1,2,3,4' && scoreShot(24.5, 0.5, 'standing').target === 3)
}

// --- Route: straightening and the legs of a bout
{
  const wiggly = Array.from({ length: 101 }, (_, i) => ({ x: i * 0.5 + Math.sin(i) * 0.8, y: Math.cos(i * 1.3) * 0.8 }))
  const turn = [...wiggly, ...Array.from({ length: 60 }, (_, i) => ({ x: 50 + Math.sin(i) * 0.8, y: (i + 1) * 0.5 + Math.cos(i) * 0.8 }))]
  ok('simplify: a noisy path with one turn becomes three points', simplify(turn, 3).length === 3)
  const track: TrackRow[] = turn.map((q, i) => [i * 40, q.x, q.y, i < 101 ? 0 : 1])
  const legs = legStats(track)
  ok('legs: time, distance travelled and straight distance per leg', legs.size === 2 && near(legs.get(0)?.ms ?? 0, 4000, 1) && near(legs.get(0)?.straight ?? 0, 49.6, 1) && (legs.get(1)?.path ?? 0) > 25)
}

// --- Where the sensor trainer is offered: computers with WebUSB on a secure page, and nowhere else
{
  const desktop = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120', mobileHint: false, hasUsb: true, secure: true, width: 1440, finePointer: true }
  ok('support: Chrome on a desktop is offered the sensor trainer', judgeSupport(desktop).ok)
  ok('support: an iPhone is not (and says why)', judgeSupport({ ...desktop, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', mobileHint: undefined, finePointer: false }).reason === 'not-a-computer')
  ok('support: an Android phone is not, even in Chrome', judgeSupport({ ...desktop, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile', mobileHint: true }).reason === 'not-a-computer')
  ok('support: a computer without WebUSB (Safari, Firefox) is not', judgeSupport({ ...desktop, hasUsb: false }).reason === 'no-webusb')
  ok('support: a plain-http page on the network is not', judgeSupport({ ...desktop, secure: false }).reason === 'insecure-page')
  ok('support: a narrow window is not', judgeSupport({ ...desktop, width: 700 }).reason === 'narrow-screen')
}

console.log(failures === 0 ? '\nAll sensor checks passed.' : `\n${failures} sensor check(s) failed.`)
if (failures > 0) process.exit(1)
