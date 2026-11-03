import type { Bout, NationalTest, NationalTestStage, Position } from './types'
import { faceById } from './types'

/**
 * The National Team test: two 10-shot precision groups on paper, then two
 * timed metal drills (4x5 across, 10x1 single shots). Out of 600: precision
 * out of 200, speed out of 400, less 10 points for every miss.
 *
 * Everything the protocol leaves open is a named constant or a comment here, so
 * it can be corrected against the federation's own sheet in one place.
 */

/** The 4x5 stages in order, fixed so every athlete shoots them the same way: prone, standing, prone, standing. */
export const ACROSS_STAGES: readonly Position[] = ['prone', 'standing', 'prone', 'standing']
export type DrillKind = NationalTestStage['kind']

/** Shots in one saved stage. The 10x1 is timed as a whole, so it is a single stage of ten shots:
 *  five prone singles, then five standing. */
export const SHOTS_PER_STAGE = { across: 5, single: 10 } as const
export const SINGLE_PRONE_SHOTS = 5

/** Rest required between the prone and standing precision groups. */
export const REST_SECONDS = 5 * 60
/** Time allowed for both precision groups together. */
export const PRECISION_MINUTES = 20

/** Points each miss costs. In the precision groups a miss is a shot outside the
 *  8 ring (prone) or outside the black (standing); in the drills, a target left standing. */
export const MISS_PENALTY = 10
export const PRONE_MISS_BELOW_RING = 8

/** The speed baselines, seconds. Time under a baseline scores a point a
 *  second; time over loses a point a second. */
export const BASELINE_SECONDS: Record<Position, number> = { prone: 160, standing: 150 }
/** Speed starts at this on the baseline. */
export const SPEED_AT_BASELINE = 200
/** Both baselines together. The 10x1 is timed overall, not split by position, so speed is
 *  measured against this: a prone and standing section lose and gain a second alike. */
export const BASELINE_TOTAL = BASELINE_SECONDS.prone + BASELINE_SECONDS.standing
/** A section (and the 10x1) never counts for longer than this. */
export const CUTOFF_SECONDS = 10 * 60
export const SPEED_MAX = 400
export const PRECISION_MAX = 200

export const STANDARD_A = 510
export const STANDARD_B = 480
export const TOTAL_MAX = 600

const round2 = (n: number) => Math.round(n * 100) / 100

export type Standard = 'A' | 'B' | null

/** One precision group: its rings, and how many shots missed the zone. Prone
 *  misses are outside the 8 ring; standing misses are outside the black (inward
 *  gauge, as the rings are scored). */
export function precisionResult(bout: Bout): { rings: number; misses: number } {
  const face = faceById(bout.targetFaceId)
  const misses = bout.metrics.rings.filter((r) =>
    bout.position === 'prone' ? r.value < PRONE_MISS_BELOW_RING : r.edgeDistance > face.blackMm / 2,
  ).length
  return { rings: bout.metrics.ringTotal, misses }
}

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

export interface NationalTestScore {
  /** Ring total over the precision groups shot, out of 200. */
  precision: number
  precisionMisses: number
  /** Targets left standing in the timed drills. */
  drillMisses: number
  drillHits: number
  /** Points lost to every miss. */
  penalties: number
  /** Time in the 4x5, by position. */
  proneSeconds: number
  standingSeconds: number
  /** The 10x1, timed overall. */
  singleSeconds: number
  /** Out of 400. Zero until both drills are shot, since the baselines cover both. */
  speed: number
  /** Out of 600. */
  total: number
  standard: Standard
  /** What is still to shoot, in words — empty once the test is complete. */
  missing: string[]
}

/** Seconds spent in one position across the 4x5 stages, held to the hard cutoff. */
export function sectionSeconds(stages: NationalTestStage[], position: Position): number {
  const sum = stages.filter((s) => s.kind === 'across' && s.position === position).reduce((t, s) => t + s.seconds, 0)
  return Math.min(round2(sum), CUTOFF_SECONDS)
}

/** The 10x1's overall time, held to the cutoff. */
export function singleSeconds(stages: NationalTestStage[]): number {
  return Math.min(round2(stages.filter((s) => s.kind === 'single').reduce((t, s) => t + s.seconds, 0)), CUTOFF_SECONDS)
}

const acrossDone = (stages: NationalTestStage[]) => stages.filter((s) => s.kind === 'across').length >= ACROSS_STAGES.length
const singleDone = (stages: NationalTestStage[]) => stages.some((s) => s.kind === 'single')

export function standardFor(total: number): Standard {
  return total >= STANDARD_A ? 'A' : total >= STANDARD_B ? 'B' : null
}

type TestProgress = Pick<NationalTest, 'stages'> & Partial<Pick<NationalTest, 'proneBoutId' | 'standingBoutId'>>

/** Score what has been shot so far; `missing` says what remains. A score from a
 *  half-finished test is a running total, and shows no standard until complete. */
export function scoreNationalTest(bouts: Bout[], test: TestProgress): NationalTestScore {
  const groups = precisionBouts(bouts)
  const prone = groups.prone ? precisionResult(groups.prone) : null
  const standing = groups.standing ? precisionResult(groups.standing) : null
  const precision = (prone?.rings ?? 0) + (standing?.rings ?? 0)
  const precisionMisses = (prone?.misses ?? 0) + (standing?.misses ?? 0)

  const drillHits = test.stages.reduce((t, s) => t + s.hits, 0)
  const drillMisses = test.stages.reduce((t, s) => t + SHOTS_PER_STAGE[s.kind] - s.hits, 0)
  const penalties = MISS_PENALTY * (precisionMisses + drillMisses)

  const drillsDone = acrossDone(test.stages) && singleDone(test.stages)
  const proneSeconds = sectionSeconds(test.stages, 'prone')
  const standingSeconds = sectionSeconds(test.stages, 'standing')
  const single = singleSeconds(test.stages)
  const speed = drillsDone
    ? Math.min(SPEED_MAX, round2(SPEED_AT_BASELINE + BASELINE_TOTAL - proneSeconds - standingSeconds - single))
    : 0

  const missing: string[] = []
  // A group that was shot but has no photo yet is waiting on the range, not unshot.
  if (!groups.prone) missing.push(test.proneBoutId ? 'prone target photo' : 'prone precision')
  if (!groups.standing) missing.push(test.standingBoutId ? 'standing target photo' : 'standing precision')
  if (!acrossDone(test.stages)) missing.push('4x5 across')
  if (!singleDone(test.stages)) missing.push('10x1 single shot')

  const total = round2(precision + speed - penalties)
  return {
    precision, precisionMisses, drillMisses, drillHits, penalties,
    proneSeconds, standingSeconds, singleSeconds: single, speed, total,
    standard: missing.length === 0 ? standardFor(total) : null,
    missing,
  }
}

/** The parts of the test, which the athlete can do in any order. */
export type PartId = 'prone' | 'standing' | 'across' | 'single' | 'collect'
export type PartState = 'todo' | 'partial' | 'done' | 'locked'
export const PART_ORDER: readonly PartId[] = ['prone', 'standing', 'across', 'single', 'collect']

/**
 * Where each part stands. The four shooting parts are open from the start, in any order. A
 * precision group counts as shot the moment it is marked (its id is on the test); the 4x5 is
 * partial until all four stages are in. Collecting the two targets stays locked until all the
 * shooting is done, because the range is open until then, and is done once both are photographed.
 */
export function testParts(bouts: Bout[], test: TestProgress): Record<PartId, PartState> {
  const across = test.stages.filter((s) => s.kind === 'across').length
  const shooting: Record<Exclude<PartId, 'collect'>, PartState> = {
    prone: test.proneBoutId ? 'done' : 'todo',
    standing: test.standingBoutId ? 'done' : 'todo',
    across: across >= ACROSS_STAGES.length ? 'done' : across > 0 ? 'partial' : 'todo',
    single: singleDone(test.stages) ? 'done' : 'todo',
  }
  const groups = precisionBouts(bouts)
  const photographed = (['prone', 'standing'] as Position[]).filter((p) => groups[p]).length
  const shot = Object.values(shooting).every((v) => v === 'done')
  return { ...shooting, collect: !shot ? 'locked' : photographed === 2 ? 'done' : photographed === 1 ? 'partial' : 'todo' }
}

/** The stages left after taking back the most recent timed work: the 10x1 once it has been
 *  shot, otherwise just the last 4x5 stage (each of those is timed and saved on its own). */
export function withoutLastTimed(stages: NationalTestStage[]): NationalTestStage[] {
  return singleDone(stages) ? stages.filter((s) => s.kind === 'across') : stages.slice(0, -1)
}

/** Seconds on the clock when each stage ended, from the taps that marked them, to the
 *  time each stage took (one tap for a stage timed on its own). Alone, the tap comes after the line: `allowance` seconds are
 *  taken off every tap, which leaves every stage the right length except the first,
 *  which had the delay added to it. A tap can never land before the one before it. */
export function stageSecondsFromTaps(taps: number[], allowance: number): number[] {
  let previous = 0
  return taps.map((tap) => {
    const ended = Math.max(previous + 0.1, tap - allowance)
    const took = Math.round((ended - previous) * 10) / 10
    previous = ended
    return took
  })
}

/** "2:05" for a time in seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const STAGE_LABEL: Record<NationalTestStage['kind'], string> = {
  across: '4x5 across',
  single: '10x1 single shot',
}
