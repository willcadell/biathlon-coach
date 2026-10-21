import type { MetalBout, MetalTarget, Position, SensorSession, SensorShot } from './types'
import { METAL_TARGETS } from './metal'
import { legStats, nearestTarget, median, type LegStats, type TrackRow } from './sensor'

/**
 * Sensor sessions: building what is saved from a finished session, and reading
 * saved sessions back as the same kinds of numbers the rest of Analysis uses.
 *
 * A bout is five shots, Alpha to Echo, as on the target's lights. Only whole
 * bouts say anything about a target, because a bout cut short has targets that
 * were never shot at, which is not the same as missed.
 */

export const SENSOR_BOUT = 5

/** The aim in the second before a shot is what "how steady was I" means. */
const HOLD_WINDOW_MS = 1000
const MIN_HOLD_SAMPLES = 8

export interface ShotMarkLike { n: number; x: number; y: number; hit: boolean; t?: number }

const round1 = (v: number) => Math.round(v * 10) / 10

/** The saved shots of a finished session: where each landed, the simplified route to it, and how steady the aim was just before.
 *  `track` is every aim sample since shooting began, with the number of shots fired so far (its leg). */
export function sensorShotsFrom(marks: ShotMarkLike[], track: TrackRow[]): SensorShot[] {
  const legs = legStats(track)
  return marks.map((m) => {
    const leg = legs.get(m.n - 1)
    const t = m.t ?? 0
    const before = track.filter((q) => q[3] === m.n - 1 && q[0] >= t - HOLD_WINDOW_MS && q[0] <= t)
    let hold: number | null = null
    let speed: number | null = null
    if (before.length >= MIN_HOLD_SAMPLES) {
      const mx = median(before.map((q) => q[1])), my = median(before.map((q) => q[2]))
      hold = round1(Math.sqrt(before.reduce((s, q) => s + (q[1] - mx) ** 2 + (q[2] - my) ** 2, 0) / before.length))
      let path = 0
      for (let i = 1; i < before.length; i++) path += Math.hypot(before[i][1] - before[i - 1][1], before[i][2] - before[i - 1][2])
      const secs = (before[before.length - 1][0] - before[0][0]) / 1000
      speed = secs > 0 ? round1(path / secs) : null
    }
    return {
      n: m.n, x: round1(m.x), y: round1(m.y), hit: m.hit, target: nearestTarget(m.x, m.y), t,
      legMs: Math.round(leg?.ms ?? 0), legPath: Math.round(leg?.path ?? 0), legStraight: Math.round(leg?.straight ?? 0),
      route: (leg?.points ?? []).map((p): [number, number] => [round1(p.x), round1(p.y)]),
      hold, speed,
    }
  })
}

/** A session's shots in bouts of five; the last may be short. */
export function sensorBouts(shots: SensorShot[]): { shots: SensorShot[]; complete: boolean }[] {
  const out: { shots: SensorShot[]; complete: boolean }[] = []
  for (let i = 0; i < shots.length; i += SENSOR_BOUT) {
    const chunk = shots.slice(i, i + SENSOR_BOUT)
    out.push({ shots: chunk, complete: chunk.length === SENSOR_BOUT })
  }
  return out
}

/** The route legs of a bout, in the form the route picture draws. */
export function legsOf(shots: SensorShot[]): Map<number, LegStats> {
  const out = new Map<number, LegStats>()
  shots.forEach((s, i) => out.set(i, { ms: s.legMs, path: s.legPath, straight: s.legStraight, points: s.route.map(([x, y]) => ({ x, y })) }))
  return out
}

/** A saved route played back: points spread over each leg in proportion to the distance along it, so the
 *  replay moves at an even pace along every leg and takes as long as the leg did. A simplified route, not the raw trace. */
export function rowsFromLegs(shots: SensorShot[]): TrackRow[] {
  const rows: TrackRow[] = []
  let start = 0
  shots.forEach((s, i) => {
    const pts = s.route.length ? s.route : [[s.x, s.y] as [number, number]]
    const lengths = pts.map((p, k) => (k === 0 ? 0 : Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1])))
    const total = lengths.reduce((a, b) => a + b, 0)
    let along = 0
    pts.forEach((p, k) => {
      along += lengths[k]
      const frac = total > 0 ? along / total : k / Math.max(1, pts.length - 1)
      rows.push([start + frac * s.legMs, p[0], p[1], i])
    })
    start += s.legMs
  })
  return rows
}

/** A whole bout seen as a metal bout: which targets were hit (any shot of the bout that hit it), so the
 *  per-target tiles, sparklines and trend charts read it as they read metal. `hold` is the bout's mean steadiness
 *  at the 50 m scale (ten times the 5 m millimetres), null if no shot had enough samples. */
export interface SensorBout extends MetalBout {
  hold: number | null
}

export function sensorAsBouts(sessions: SensorSession[]): SensorBout[] {
  const out: SensorBout[] = []
  for (const s of sessions) {
    sensorBouts(s.shots).forEach((b, i) => {
      if (!b.complete) return
      const hits = Object.fromEntries(METAL_TARGETS.map((t, k) => [t, b.shots.some((x) => x.hit && x.target === k)])) as Record<MetalTarget, boolean>
      const holds = b.shots.map((x) => x.hold).filter((h): h is number => h !== null)
      const last = b.shots[b.shots.length - 1]
      out.push({
        kind: 'metal', id: `${s.id}:${i}`, workoutId: s.workoutId,
        shotAt: new Date(Date.parse(s.startedAt) + last.t).toISOString(),
        position: s.position, hits, heartRate: 0, comboId: null, targetZone: null,
        hold: holds.length ? Math.round((holds.reduce((a, c) => a + c, 0) / holds.length) * 10 * 10) / 10 : null,
      })
    })
  }
  return out
}

export interface SensorSummary {
  sessions: number
  shots: number
  hits: number
  ratePct: number
  byPosition: Record<Position, { shots: number; hits: number; ratePct: number }>
}

const pct = (hits: number, shots: number) => (shots ? Math.round((hits / shots) * 100) : 0)

export function sensorSummary(sessions: SensorSession[]): SensorSummary {
  const by: Record<Position, { shots: number; hits: number; ratePct: number }> = {
    prone: { shots: 0, hits: 0, ratePct: 0 }, standing: { shots: 0, hits: 0, ratePct: 0 },
  }
  for (const s of sessions) {
    for (const x of s.shots) {
      by[s.position].shots += 1
      if (x.hit) by[s.position].hits += 1
    }
  }
  for (const p of ['prone', 'standing'] as Position[]) by[p].ratePct = pct(by[p].hits, by[p].shots)
  const shots = by.prone.shots + by.standing.shots
  const hits = by.prone.hits + by.standing.hits
  return { sessions: sessions.length, shots, hits, ratePct: pct(hits, shots), byPosition: by }
}

/** One line for a session: "12 of 15 shots hit, prone" with its steadiness if known. */
export function sensorLine(s: Pick<SensorSession, 'shots' | 'position'>): string {
  const hits = s.shots.filter((x) => x.hit).length
  return `${hits} of ${s.shots.length} shots hit, ${s.position}`
}
