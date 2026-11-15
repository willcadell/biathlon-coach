import { DISCS_PER_METAL_BOUT, METAL_TARGETS, comboLabel, hitCount, hitsOf, metalStats, targetStats, type MetalStat, type TargetStat } from './metal'
import { RACE_STAGES, RACE_TYPE_LABEL, type MetalBout, type MetalTarget, type RaceType, type Workout } from './types'
import type { MetalPayload } from './feed'

/** What a shareable metal card says about a set of bouts: a whole session's metal, or one combo's
 *  rounds. Everything is worked out here, from the bouts alone, so the card only has to draw it. */
export interface MetalSummary {
  bouts: number
  shots: number
  hits: number
  /** Hits over shots, 0-100. */
  hitRatePct: number
  /** Bouts with all five down. */
  clean: number
  byPosition: MetalStat[]
  byTarget: TargetStat[]
  /** Mean heart rate on entry across the bouts that recorded one, or null. */
  avgHeartRate: number | null
  /** Mean range time (seconds) across the bouts that were timed, or null. */
  avgRangeSeconds: number | null
  timedBouts: number
  bestRangeSeconds: number | null
}

const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length)

export function summariseMetal(bouts: MetalBout[]): MetalSummary {
  const ordered = [...bouts].sort((a, b) => a.shotAt.localeCompare(b.shotAt))
  const shots = ordered.length * DISCS_PER_METAL_BOUT
  const hits = ordered.reduce((n, b) => n + hitCount(hitsOf(b)), 0)
  const hrs = ordered.filter((b) => b.heartRate > 0).map((b) => b.heartRate)
  const times = ordered.filter((b) => (b.rangeSeconds ?? 0) > 0).map((b) => b.rangeSeconds as number)
  const avgHr = mean(hrs)
  const avgTime = mean(times)
  return {
    bouts: ordered.length,
    shots,
    hits,
    hitRatePct: shots > 0 ? (hits / shots) * 100 : 0,
    clean: ordered.filter((b) => hitCount(hitsOf(b)) === DISCS_PER_METAL_BOUT).length,
    byPosition: metalStats(ordered),
    byTarget: targetStats(ordered),
    avgHeartRate: avgHr === null ? null : Math.round(avgHr),
    avgRangeSeconds: avgTime === null ? null : Math.round(avgTime * 10) / 10,
    timedBouts: times.length,
    bestRangeSeconds: times.length === 0 ? null : Math.min(...times),
  }
}

/** A combo's rounds in the order they were shot. */
export const comboRounds = (rounds: MetalBout[]): MetalBout[] => [...rounds].sort((a, b) => a.shotAt.localeCompare(b.shotAt))

export interface RaceSummary extends MetalSummary {
  /** The shooting stages in the order they were shot. */
  stages: MetalBout[]
  /** How many stages the format has, and whether every one was recorded. */
  expectedStages: number
  complete: boolean
  /** Every miss costs something: a penalty loop, or a minute in an individual. */
  misses: number
  penalty: string
  /** No miss at all. (`clean`, from the metal summary, counts 5-for-5 bouts: a different thing.) */
  cleanShoot: boolean
}

/** A race's result from its stages: hits, misses and what the misses cost. */
export function summariseRace(raceType: RaceType, stagesIn: MetalBout[]): RaceSummary {
  const stages = comboRounds(stagesIn)
  const base = summariseMetal(stages)
  const misses = base.shots - base.hits
  const unit = raceType === 'individual' ? 'penalty minute' : 'penalty loop'
  return {
    ...base,
    stages,
    expectedStages: RACE_STAGES[raceType].length,
    complete: stages.length >= RACE_STAGES[raceType].length,
    misses,
    penalty: misses === 0 ? 'Clean shooting' : `${misses} ${unit}${misses === 1 ? '' : 's'}`,
    cleanShoot: misses === 0 && stages.length > 0,
  }
}

export const raceLabel = (raceType: RaceType): string => RACE_TYPE_LABEL[raceType]

/** When every metal bout in a session is a round of one and the same combo, that combo: its target
 *  zone and its rounds in the order shot. Otherwise null. The combo's own card already says all there
 *  is to say about such a session, so a second, session-wide card would only repeat it. */
export function singleCombo(bouts: MetalBout[]): { zone: number | null; rounds: MetalBout[] } | null {
  if (bouts.length === 0) return null
  const id = bouts[0].comboId
  if (!id || bouts.some((b) => b.comboId !== id)) return null
  const rounds = comboRounds(bouts)
  return { zone: rounds[0].targetZone, rounds }
}

// --- Posts on the club feed -----------------------------------------------------------------------

/** A posted snapshot back as the bouts the card and summary code read. Heart rate is not in a post,
 *  so it is 0; the card only draws what is there. */
export function postedBouts(p: MetalPayload): MetalBout[] {
  return p.bouts.map((b, i) => ({
    kind: 'metal' as const,
    id: `posted-${i}`,
    workoutId: '',
    shotAt: b.shotAt,
    position: b.position,
    hits: Object.fromEntries(METAL_TARGETS.map((t, k) => [t, Boolean(b.hits[k])])) as Record<MetalTarget, boolean>,
    heartRate: 0,
    comboId: null,
    targetZone: p.zone,
    ...(b.rangeSeconds ? { rangeSeconds: b.rangeSeconds } : {}),
  }))
}

/** What a card needs of the workout: its name, its date and, for a race, its format. */
export const postedWorkout = (p: MetalPayload): Workout =>
  ({ name: p.name, startedAt: p.startedAt, raceType: p.raceType }) as unknown as Workout

/** The feed line for a post: what it is, and how it went. */
export function postedHeadline(kind: 'combo' | 'metal', p: MetalPayload): { title: string; detail: string } {
  const bouts = postedBouts(p)
  if (p.raceType) {
    const r = summariseRace(p.raceType, bouts)
    return { title: raceLabel(p.raceType), detail: `${r.hits}/${r.shots} · ${r.penalty.toLowerCase()}` }
  }
  const m = summariseMetal(bouts)
  const count = `${m.bouts} bout${m.bouts === 1 ? '' : 's'}`
  return {
    title: kind === 'combo' ? comboLabel(p.zone) : 'Metal session',
    detail: `${m.hits}/${m.shots} · ${Math.round(m.hitRatePct)}% · ${count}`,
  }
}
