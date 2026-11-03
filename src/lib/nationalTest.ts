import type { Bout, NationalTest, NationalTestStage, Position } from './types'

/**
 * The Biathlon Canada National Team Test (protocol version Aug 25, 2012): three components of
 * 200 points each, out of 600.
 *
 *  - Precision: ten shots prone and ten standing on paper, plain ring points, out of 200.
 *  - Five-across 4x5: four rounds of five shots (prone, prone, standing, standing) on one
 *    stopwatch. 10 points a hit, and a point off for every second over 80. Out of 200.
 *  - First shot set-up 5p/5s: single shots, off the mat and back each time, until five hits;
 *    the time to the fifth hit is scored, prone and then standing. Can be negative.
 *
 * Everything the protocol leaves open is a named constant or a comment here, so it can be
 * corrected against the federation's own sheet in one place.
 */

/** The 4x5 stages in order. */
export const ACROSS_STAGES: readonly Position[] = ['prone', 'prone', 'standing', 'standing']
export const SHOTS_PER_ACROSS_STAGE = 5

/** Time allowed for both precision groups together. */
export const PRECISION_MINUTES = 20
/** Rest the protocol asks for after each component. Guidance only: the athlete looks after it. */
export const REST_MINUTES = 5

/** 4x5: points per target hit, and the time at which speed costs nothing. */
export const ACROSS_POINTS_PER_HIT = 10
export const ACROSS_BASELINE_SECONDS = 80

/** First-shot set-up: the hits needed to stop the clock, and the baseline time per position, in
 *  seconds. Each second under the baseline scores a point; each second over loses one. */
export const FIRST_SHOT_HITS = 5
export const FIRST_SHOT_BASELINE: Record<Position, number> = { prone: 160, standing: 150 }

export const COMPONENT_MAX = 200
export const STANDARD_A = 510
export const STANDARD_B = 480
export const TOTAL_MAX = 600

const round2 = (n: number) => Math.round(n * 100) / 100

export type Standard = 'A' | 'B' | null

/** The workout's precision bouts that belong to this test. */
export function testBouts(test: Pick<NationalTest, 'proneBoutId' | 'standingBoutId'>, bouts: Bout[]): Bout[] {
  return bouts.filter((b) => b.id === test.proneBoutId || b.id === test.standingBoutId)
}

/** The latest precision group shot in each position — a redo replaces the first. */
export function precisionBouts(bouts: Bout[]): Record<Position, Bout | null> {
  const latest = (position: Position) =>
    bouts.filter((b) => b.position === position).sort((a, b) => b.shotAt.localeCompare(a.shotAt))[0] ?? null
  return { prone: latest('prone'), standing: latest('standing') }
}

/** The 4x5 score: 10 points a hit, less a point for every second over 80. Faster than 80 s earns
 *  nothing extra, so 200 (twenty hits in 80 s or less) is the most. */
export function acrossScore(hits: number, seconds: number): number {
  return round2(ACROSS_POINTS_PER_HIT * hits + Math.min(0, ACROSS_BASELINE_SECONDS - seconds))
}

export interface NationalTestScore {
  /** Ring total over the precision groups photographed, out of 200. */
  precision: number
  /** The 4x5, out of 200. Zero until all four stages are in. */
  across: number
  acrossHits: number
  /** Total 4x5 time, seconds. */
  acrossSeconds: number
  /** First-shot set-up: each position done adds its baseline less its time. Can be negative. */
  firstShot: number
  /** Time to the fifth hit, by position; null where not yet shot. */
  firstShotSeconds: Record<Position, number | null>
  /** The sum of the components done, out of 600. */
  total: number
  standard: Standard
  /** What is still to do, in words — empty once the test is complete. */
  missing: string[]
}

const acrossStages = (stages: NationalTestStage[]) => stages.filter((s) => s.kind === 'across')
/** The 4x5 counts only once all four stages are in. */
const acrossIsDone = (stages: NationalTestStage[]) => acrossStages(stages).length >= ACROSS_STAGES.length
const firstShotStage = (stages: NationalTestStage[], position: Position) =>
  stages.filter((s) => s.kind === 'firstShot' && s.position === position).pop() ?? null

export function standardFor(total: number): Standard {
  return total >= STANDARD_A ? 'A' : total >= STANDARD_B ? 'B' : null
}

type TestProgress = Pick<NationalTest, 'stages'> & Partial<Pick<NationalTest, 'proneBoutId' | 'standingBoutId' | 'finishedAt'>>

/** Score what has been done so far. Each component counts as soon as it is done, so a part-shot
 *  test has a score for the components tested; `missing` says what remains. A standard is given
 *  only for a complete test. */
export function scoreNationalTest(bouts: Bout[], test: TestProgress): NationalTestScore {
  const groups = precisionBouts(bouts)
  const precision = (groups.prone?.metrics.ringTotal ?? 0) + (groups.standing?.metrics.ringTotal ?? 0)

  const across = acrossStages(test.stages)
  const acrossDone = acrossIsDone(test.stages)
  const acrossHits = acrossDone ? across.reduce((t, s) => t + s.hits, 0) : 0
  const acrossSeconds = acrossDone ? round2(across.reduce((t, s) => t + s.seconds, 0)) : 0

  const firstShotSeconds: Record<Position, number | null> = {
    prone: firstShotStage(test.stages, 'prone')?.seconds ?? null,
    standing: firstShotStage(test.stages, 'standing')?.seconds ?? null,
  }
  const firstShot = round2(
    (['prone', 'standing'] as Position[]).reduce((t, p) => t + (firstShotSeconds[p] === null ? 0 : FIRST_SHOT_BASELINE[p] - (firstShotSeconds[p] as number)), 0),
  )

  const missing: string[] = []
  // A group that was shot but has no photo yet is waiting on the range, not unshot.
  if (!groups.prone) missing.push(test.proneBoutId ? 'prone target photo' : 'prone precision')
  if (!groups.standing) missing.push(test.standingBoutId ? 'standing target photo' : 'standing precision')
  if (!acrossDone) missing.push('4x5 across')
  if (firstShotSeconds.prone === null) missing.push('first-shot prone')
  if (firstShotSeconds.standing === null) missing.push('first-shot standing')

  const total = round2(precision + (acrossDone ? acrossScore(acrossHits, acrossSeconds) : 0) + firstShot)
  return {
    precision, across: acrossDone ? acrossScore(acrossHits, acrossSeconds) : 0, acrossHits, acrossSeconds,
    firstShot, firstShotSeconds, total,
    standard: missing.length === 0 ? standardFor(total) : null,
    missing,
  }
}

/** The parts of the test, which the athlete can do in any order. */
export type PartId = 'prone' | 'standing' | 'across' | 'firstShot' | 'collect'
export type PartState = 'todo' | 'partial' | 'done' | 'locked'
export const PART_ORDER: readonly PartId[] = ['prone', 'standing', 'across', 'firstShot', 'collect']

/**
 * Where each part stands. The four shooting parts are open from the start, in any order. A
 * precision group counts as shot the moment it is marked (its id is on the test); first-shot
 * set-up is partial until both positions are in. Collecting the two targets stays locked until all
 * the shooting is done, because the range is open until then, unless the athlete has finished the
 * test early; it is done once every group that was shot is photographed.
 */
export function testParts(bouts: Bout[], test: TestProgress): Record<PartId, PartState> {
  const firstShotDone = (['prone', 'standing'] as Position[]).filter((p) => firstShotStage(test.stages, p)).length
  const shooting: Record<Exclude<PartId, 'collect'>, PartState> = {
    prone: test.proneBoutId ? 'done' : 'todo',
    standing: test.standingBoutId ? 'done' : 'todo',
    across: acrossIsDone(test.stages) ? 'done' : 'todo',
    firstShot: firstShotDone === 2 ? 'done' : firstShotDone === 1 ? 'partial' : 'todo',
  }
  const groups = precisionBouts(bouts)
  const photographed = (['prone', 'standing'] as Position[]).filter((p) => groups[p]).length
  // Only a group that was shot has a target to collect.
  const toCollect = (test.proneBoutId ? 1 : 0) + (test.standingBoutId ? 1 : 0)
  const shot = Object.values(shooting).every((v) => v === 'done')
  // Locked while there is shooting still to do, unless the athlete has finished the test early.
  if (!shot && !test.finishedAt) return { ...shooting, collect: 'locked' }
  return { ...shooting, collect: photographed >= toCollect ? 'done' : photographed > 0 ? 'partial' : 'todo' }
}

/** Seconds on the clock when each stage ended, from the taps that marked them, to the
 *  time each stage took (one tap for a run timed on its own). Alone, the tap comes after the line:
 *  `allowance` seconds are taken off every tap, which leaves every stage the right length except the
 *  first, which had the delay added to it. A tap can never land before the one before it. */
export function stageSecondsFromTaps(taps: number[], allowance: number): number[] {
  let previous = 0
  return taps.map((tap) => {
    const ended = Math.max(previous + 0.1, tap - allowance)
    const took = Math.round((ended - previous) * 10) / 10
    previous = ended
    return took
  })
}

/** "2:05" for a time in seconds. Negative times read as 0:00. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const STAGE_LABEL: Record<NationalTestStage['kind'], string> = {
  across: '4x5 across',
  firstShot: 'First-shot set-up',
}
