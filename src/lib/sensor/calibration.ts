import { median, type Point } from './records'
import { TargetMap } from './targetMap'

// Target calibration for the sensor trainer: the shooter pulls on Alpha, Charlie and Echo and the app learns where the five targets are
// in the sensor's own units. Pure functions only (no screen, no device), so they can be tested against recorded numbers.

export const TARGET_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'] as const
const ECHO = 4

/** Which target each pull is on (0 = Alpha ... 4 = Echo). Two pulls each on Alpha, Charlie and Echo; a third only where a pair disagrees. */
export const CALIBRATION_PULLS = [0, 0, 2, 2, 4, 4] as const

/** One pull: the median aim over the 1.5 s hold before it (x, y, sensor frame) and how much the aim wobbled during that hold. */
export interface Pull { x: number; y: number; wobble: number }

/** Where Bravo and Delta sit, as a fraction of the sensor-space distance between their anchors: Bravo from Alpha towards Charlie, Delta from
 *  Charlie towards Echo. A plain interpolation would say 0.5. From shots against six-pull calibrations: Bravo 0.48 to 0.65 (mean 0.60), Delta 0.31
 *  to 0.44 (mean 0.36). n counts the observations folded in so far. */
export interface Model { v: number; bravo: number; delta: number; n: number }
export const MODEL_VERSION = 2
export const MODEL_DEFAULT: Model = { v: MODEL_VERSION, bravo: 0.60, delta: 0.36, n: 0 }
/** The starting values count as this many observations when the model is refined. */
export const MODEL_PRIOR_WEIGHT = 4

export const newModel = (): Model => ({ ...MODEL_DEFAULT })

/** A model saved by an earlier version starts again from the current defaults. */
export const currentModel = (m: Model | null | undefined): Model => (m && m.v === MODEL_VERSION ? m : newModel())

/** Hold wobble beyond which a pull is thrown away or the pass rejected, by target. */
export const wobbleLimit = (target: number): number => (target === ECHO ? 45 : 25)

/** After the second pull on a target: a third pull is asked for when the first two are further apart than this. */
export const extraPullGap = (target: number): number => (target === ECHO ? 25 : 15)

/** Whether the pull just taken (the last of `pulls`, on set[pulls.length - 1]) should be followed by an extra pull on the same target. */
export function needsExtraPull(set: readonly number[], pulls: Pull[]): boolean {
  const i = pulls.length - 1
  if (i < 1) return false
  const target = set[i]
  const mine = pulls.filter((_, k) => set[k] === target)
  if (mine.length !== 2 || set[i + 1] === target) return false
  return Math.hypot(mine[0].x - mine[1].x, mine[0].y - mine[1].y) > extraPullGap(target)
}

export interface TargetResult {
  /** Target index, 0 = Alpha. */
  target: number
  name: string
  x: number
  y: number
  /** RMS wobble of the pulls kept. */
  wobble: number
  /** The widest gap between the pulls kept; null when only one was taken. */
  repeat: number | null
  /** Pulls dropped as stray or too shaky (three or more pulls on a target only). */
  dropped: number
}

/** Groups the pulls by target: pulls over the wobble limit are dropped (only when three or more were taken and two remain), then a stray
 *  pull (over 20 mm from the median of the rest) is dropped, and the rest are averaged. shaky lists pulls that cannot be dropped. */
export function groupPulls(set: readonly number[], pulls: Pull[]): { results: TargetResult[]; shaky: { name: string; wobble: number }[] } {
  const anchors = [...new Set(set)].sort((a, b) => a - b)
  const shaky: { name: string; wobble: number }[] = []
  const results = anchors.map((a) => {
    const all = pulls.filter((_, i) => set[i] === a)
    let g = all
    const loose = g.filter((p) => p.wobble > wobbleLimit(a))
    if (loose.length) {
      if (g.length >= 3 && g.length - loose.length >= 2) g = g.filter((p) => p.wobble <= wobbleLimit(a))
      else loose.forEach((p) => shaky.push({ name: TARGET_NAMES[a], wobble: p.wobble }))
    }
    if (g.length >= 3) {
      const mx = median(g.map((p) => p.x)), my = median(g.map((p) => p.y))
      const keep = g.filter((p) => Math.hypot(p.x - mx, p.y - my) <= 20)
      if (keep.length >= 2) g = keep
    }
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
    let repeat: number | null = null
    if (g.length >= 2) {
      repeat = 0
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) repeat = Math.max(repeat, Math.hypot(g[i].x - g[j].x, g[i].y - g[j].y))
    }
    return { target: a, name: TARGET_NAMES[a], x: mean(g.map((p) => p.x)), y: mean(g.map((p) => p.y)), wobble: Math.sqrt(mean(g.map((p) => p.wobble ** 2))), repeat, dropped: all.length - g.length }
  })
  return { results, shaky }
}

/** Five centres (Alpha to Echo) from the anchors that were shot. Alpha, Charlie and Echo give Bravo and Delta through the model. */
export function deriveCentres(anchors: readonly number[], rel: Point[], model: Model): Point[] {
  if (anchors.length === 5) return rel.map((p) => ({ ...p }))
  const [A, C, E] = rel
  const at = (p: Point, q: Point, f: number): Point => ({ x: p.x + f * (q.x - p.x), y: p.y + f * (q.y - p.y) })
  return [{ ...A }, at(A, C, model.bravo), { ...C }, at(C, E, model.delta), { ...E }]
}

/** Folds an observation of where Bravo and Delta sit into the model (a running mean; the starting values count as MODEL_PRIOR_WEIGHT
 *  observations). Returns the new model; an implausible observation (outside 0.2 to 0.9, or more than `tolerance` from the model) changes nothing. */
export function refineModel(m: Model, obsB: number, obsD: number, weight = 1, tolerance = 0.3): Model {
  const ok = (o: number, now: number) => o >= 0.2 && o <= 0.9 && Math.abs(o - now) <= tolerance
  if (!ok(obsB, m.bravo) || !ok(obsD, m.delta)) return m
  const w = MODEL_PRIOR_WEIGHT + m.n
  return { ...m, bravo: (m.bravo * w + obsB * weight) / (w + weight), delta: (m.delta * w + obsD * weight) / (w + weight), n: m.n + weight }
}

/** Learning from shooting: a finished bout of five fired in order from one end to the other shows where Bravo and Delta really sit between
 *  the calibrated Alpha, Charlie and Echo (anchor x values, Charlie 0). ux: the five shots' sensor-frame x. Returns the observations, or null
 *  when the bout cannot be used (not in order, too bunched). */
export function observeBout(ux: number[], anchorX: [number, number, number]): { obsB: number; obsD: number } | null {
  if (ux.length !== 5) return null
  let u = [...ux]
  if (u.every((v, i) => i === 0 || v < u[i - 1])) u = u.reverse()               // fired from Echo to Alpha
  if (!u.every((v, i) => i === 0 || v > u[i - 1])) return null
  const [A, C, E] = anchorX
  if (C - A < 20 || E - C < 20) return null
  return { obsB: (u[1] - A) / (C - A), obsD: (u[3] - C) / (E - C) }
}


// ---- holds ----

/** A sample as the calibration reads it: the sensor frame (before the learned map). */
export interface HoldSample { t: number; ux: number; uy: number }

/** The hold before a pull: the median aim over the `windowMs` ms before it (stopping 50 ms short of the pull) and how much the aim wobbled
 *  there (RMS distance from that median). Null when there were fewer than minSamples (about 17 a second): tracking was too weak to say. */
export function holdBefore(buf: HoldSample[], t: number, windowMs = 1500, minSamples = 25): Pull | null {
  const seg = buf.filter((p) => p.t >= t - windowMs && p.t <= t - 50)
  if (seg.length < minSamples) return null
  const x = median(seg.map((p) => p.ux)), y = median(seg.map((p) => p.uy))
  return { x, y, wobble: Math.sqrt(seg.reduce((s, p) => s + (p.ux - x) ** 2 + (p.uy - y) ** 2, 0) / seg.length) }
}

/** How fast the aim has been moving over the last `windowMs`, in sensor units a second; null when there is too little data. */
export function aimSpeed(buf: HoldSample[], windowMs = 600): number | null {
  const last = buf[buf.length - 1]
  if (!last) return null
  const seg = buf.filter((p) => p.t >= last.t - windowMs)
  if (seg.length < 6) return null
  let path = 0
  for (let i = 1; i < seg.length; i++) path += Math.hypot(seg[i].ux - seg[i - 1].ux, seg[i].uy - seg[i - 1].uy)
  return path / ((seg[seg.length - 1].t - seg[0].t) / 1000)
}

/** Slower than this counts as holding still. */
export const STEADY_SPEED = 30
/** Seconds of holding still before a pull the calibration asks for. */
export const STEADY_SECONDS = 2

// ---- quality ----

export type Rating = 'good' | 'ok' | 'poor'

export const WOBBLE_LIMITS: readonly [number, number] = [6, 10]
export const REPEAT_LIMITS: readonly [number, number] = [6, 12]
export const AGREE_LIMITS: readonly [number, number] = [5, 10]
/** Overall RMS in mm: up to 6 is good (the standing disc radius is 5.75), up to 10 acceptable. */
export const RMS_LIMITS: readonly [number, number] = [6, 10]
/** Echo reads about twice as noisy as the rest: twice the allowance in a rating, half the weight in an RMS. */
const ECHO_WEIGHT = 0.5

const rate = (value: number, [good, ok]: readonly [number, number], echo: boolean): Rating => {
  const k = echo ? 2 : 1
  return value <= good * k ? 'good' : value <= ok * k ? 'ok' : 'poor'
}
const rmsOf = (values: number[], echo: boolean[]) => Math.sqrt(values.reduce((s, v, i) => s + (v * (echo[i] ? ECHO_WEIGHT : 1)) ** 2, 0) / values.length)

export interface QualityRow {
  name: string
  echo: boolean
  wobble: number
  wRate: Rating
  repeat: number | null
  rRate: Rating | null
  dropped: number
  /** Distance from the earlier passes of this session; null on the first pass. */
  diff: number | null
  dRate: Rating | null
  /** Position from Charlie, sensor units. */
  pos: number
}

export interface Quality {
  verdict: Rating
  advice: string
  holdRms: number
  repeatRms: number | null
  agreeRms: number | null
  overall: number
  rows: QualityRow[]
}

/** How good a calibration pass was, as plain data: hold wobble, the gap between pulls on a target, and the distance from earlier passes,
 *  each rated, plus root-mean-square figures over the targets. The verdict is the worse of the overall RMS and the per-target ratings. */
export function qualityOf(results: TargetResult[], fresh: Point[], earlier: Point[] | null, passes: number): Quality {
  const rows: QualityRow[] = results.map((r, i) => {
    const echo = r.target === ECHO
    const diff = earlier ? Math.hypot(fresh[i].x - earlier[i].x, fresh[i].y - earlier[i].y) : null
    return {
      name: r.name, echo, wobble: r.wobble, wRate: rate(r.wobble, WOBBLE_LIMITS, echo), repeat: r.repeat,
      rRate: r.repeat == null ? null : rate(r.repeat, REPEAT_LIMITS, echo), dropped: r.dropped,
      diff, dRate: diff == null ? null : rate(diff, AGREE_LIMITS, echo), pos: fresh[i].x,
    }
  })
  const part = (key: 'wobble' | 'repeat' | 'diff'): number | null => {
    const r = rows.filter((x) => x[key] != null)
    return r.length ? rmsOf(r.map((x) => x[key] as number), r.map((x) => x.echo)) : null
  }
  const holdRms = part('wobble') as number, repeatRms = part('repeat'), agreeRms = part('diff')
  const overall = Math.hypot(holdRms, repeatRms ?? 0, agreeRms ?? 0)
  const overallRate = overall <= RMS_LIMITS[0] ? 'good' : overall <= RMS_LIMITS[1] ? 'ok' : 'poor'
  const all = rows.flatMap((r) => [r.wRate, r.rRate, r.dRate]).filter((x): x is Rating => x !== null)
  const poor = all.filter((x) => x === 'poor').length, ok = all.filter((x) => x === 'ok').length
  const byTargets: Rating = poor ? 'poor' : ok > 2 ? 'ok' : 'good'
  const rank = { good: 0, ok: 1, poor: 2 }
  const verdict = rank[overallRate] > rank[byTargets] ? overallRate : byTargets
  const worst = rows.filter((r) => r.wRate === 'poor' || r.rRate === 'poor' || r.dRate === 'poor').map((r) => r.name)
  const advice = verdict === 'good'
    ? 'Steady holds, and the pulls and passes agree. You can shoot with this.'
    : verdict === 'ok'
      ? `A few shaky holds. ${passes < 2 ? 'A second pass will average them out.' : 'Another pass will tighten it.'}`
      : `${worst.join(', ')} ${worst.length === 1 ? 'was' : 'were'} unsteady, or the pulls disagreed. Settle for two seconds before each pull, and calibrate again.`
  return { verdict, advice, holdRms, repeatRms, agreeRms, overall, rows }
}

// ---- solving a whole pass ----

export interface SavedCalibration {
  anchors: number[]
  /** The averaged anchor centres, measured from Charlie. */
  base: Point[]
  /** How many passes of this session are averaged in. */
  passes: number
}

export type CalibrationOutcome =
  | { rejected: string }
  | {
    /** The anchors and averaged centres to keep (unchanged when the pass was set aside). */
    saved: SavedCalibration
    /** The five centres for the map. */
    centres: Point[]
    /** This pass's Charlie reading in the sensor frame: it becomes the zero. */
    charlie: Point
    quality: Quality
    /** Set aside whole: fewer than two targets were usable, so the earlier centres stand. */
    discarded: boolean
    /** Targets rated poor in this pass whose earlier centres were kept. */
    kept: string[]
  }

/** Solves one calibration pass: groups the pulls, rejects a grossly bad one, merges target by target with the earlier passes of the session
 *  (a target rated poor keeps its earlier centre; the pass is set aside whole when fewer than two targets are usable), and builds the five
 *  centres. earlier is null for the first calibration of a session: the saved map of an earlier session is not averaged in, because the rifle and
 *  sensor sit differently each time. */
export function solveCalibration(set: readonly number[], pulls: Pull[], earlier: SavedCalibration | null, model: Model): CalibrationOutcome {
  const anchors = [...new Set(set)].sort((a, b) => a - b)
  const names = anchors.map((a) => TARGET_NAMES[a])
  const { results, shaky } = groupPulls(set, pulls)
  if (shaky.length) {
    return { rejected: `Not saved: the hold wobbled too much on ${shaky.map((q) => `${q.name} (${q.wobble.toFixed(0)})`).join(', ')}. Settle for two seconds before each pull.` }
  }
  const ci = anchors.indexOf(2)
  if (ci < 0) return { rejected: 'Not saved: the calibration needs pulls on Charlie.' }
  const charlie = { x: results[ci].x, y: results[ci].y }
  const fresh = results.map((r) => ({ x: r.x - charlie.x, y: r.y - charlie.y }))
  const bad = TargetMap.check(fresh, names)
  if (bad) return { rejected: `Not saved. ${bad} Pull on the targets in the order asked.` }
  const stray = results.filter((r) => r.repeat != null && r.repeat > (r.target === ECHO ? 70 : 35))
  if (stray.length) {
    return { rejected: `Not saved: your pulls on ${stray.map((r) => `${r.name} (${(r.repeat as number).toFixed(0)} mm apart)`).join(', ')} disagree too much. Aim at the same spot each time.` }
  }
  const prev = earlier && JSON.stringify(earlier.anchors) === JSON.stringify(anchors) ? earlier : null
  const probe = qualityOf(results, fresh, prev ? prev.base : null, prev ? prev.passes + 1 : 1)
  const usable = probe.rows.map((r, i) => i === ci || ![r.wRate, r.rRate, r.dRate].includes('poor'))
  const kept = prev ? names.filter((_, i) => !usable[i]) : []
  const discarded = !!prev && usable.filter(Boolean).length < 2
  const base: Point[] = !prev ? fresh
    : discarded ? prev.base
      : fresh.map((p, i) => (usable[i]
        ? { x: (prev.base[i].x * prev.passes + p.x) / (prev.passes + 1), y: (prev.base[i].y * prev.passes + p.y) / (prev.passes + 1) }
        : { ...prev.base[i] }))
  const passes = discarded ? prev!.passes : Math.min(4, prev ? prev.passes + 1 : 1)
  const quality = qualityOf(results, base, prev ? prev.base : null, passes)
  return { saved: { anchors, base, passes }, centres: deriveCentres(anchors, base, model), charlie, quality, discarded, kept }
}
