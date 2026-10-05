import { localDate } from './coachContext'
import { DISCS_PER_METAL_BOUT, hitCount, hitsOf } from './metal'
import type { Bout, MetalBout, Position, Workout } from './types'

/**
 * Goals, without the database: what a goal is, how its progress is computed
 * from the training the app already holds (never entered by hand), and how it
 * reads. Kept apart from goals.ts so this can be tested without a Supabase
 * client. Athlete goals only so far — the goals table already has scope,
 * program_id and club_id so program and club goals can follow without
 * reshaping it.
 */

export type GoalMetric = 'metal_hit_rate' | 'precision_score' | 'dryfire_minutes' | 'sessions'

/** What an athlete can aim at for themselves. */
export const GOAL_METRICS: { id: GoalMetric; label: string }[] = [
  { id: 'metal_hit_rate', label: 'Metal hit rate' },
  { id: 'precision_score', label: 'Precision score' },
  { id: 'dryfire_minutes', label: 'Dry-fire minutes' },
]

/** What a coach can set for a whole program: process, not outcome. How much the
 *  group trains, never how well it shoots. Totals across the program's athletes. */
export const PROGRAM_GOAL_METRICS: { id: GoalMetric; label: string }[] = [
  { id: 'dryfire_minutes', label: 'Dry-fire minutes' },
  { id: 'sessions', label: 'Sessions' },
]

/** A program's figure stays hidden from everyone but its coaches until this many
 *  athletes have contributed, so it can't expose one person's effort. The
 *  database enforces it (program_goal_progress); this is for the wording. */
export const MIN_PROGRAM_CONTRIBUTORS = 3

export interface Goal {
  id: string
  /** An athlete's own goal, or a coach's goal for a whole program. */
  scope: 'athlete' | 'program'
  /** Set for a program goal. */
  programId: string | null
  metric: GoalMetric
  /** Prone or standing; null means both. Always null for dry-fire. */
  position: Position | null
  target: number
  /** Local calendar dates, YYYY-MM-DD, inclusive. */
  startsOn: string
  endsOn: string
  shared: boolean
  achievedAt: string | null
  achievedValue: number | null
  /** Set when the athlete tidies a finished goal away; it stays in "All goals". */
  archivedAt: string | null
  /** Set once the athlete has been shown the confetti for achieving it. */
  celebratedAt: string | null
  createdAt: string
}

export interface NewGoal {
  metric: GoalMetric
  position: Position | null
  target: number
  endsOn: string
  shared: boolean
}

// --- Progress ---------------------------------------------------------------

/** A single lucky bout shouldn't count as "80% hit rate": below these a rate or
 *  score is shown as still building rather than as met. */
export const METAL_MIN_BOUTS = 5
export const PRECISION_MIN_BOUTS = 3

export interface GoalData {
  workouts: Workout[]
  bouts: Bout[]
  metalBouts: MetalBout[]
}

export type GoalStatus = 'active' | 'achieved' | 'missed'

export interface GoalProgress {
  /** The measure so far, in the goal's own unit; null with nothing to measure yet. */
  value: number | null
  /** Program goals only: how many athletes have contributed. */
  contributors?: number
  /** Program goals only: withheld because too few athletes have contributed. */
  hidden?: boolean
  /** How many bouts it's drawn from (minutes goals: 0, they need no minimum). */
  sample: number
  /** How many bouts it needs before it can count as met. */
  needed: number
  status: GoalStatus
  /** 0-1, for a progress bar. */
  fraction: number
}

const within = (iso: string, g: Pick<Goal, 'startsOn' | 'endsOn'>) => {
  const d = localDate(iso)
  return d >= g.startsOn && d <= g.endsOn
}
const positionOk = (g: Goal, p: Position) => g.position === null || g.position === p

export function evaluateGoal(goal: Goal, data: GoalData, today: Date = new Date()): GoalProgress {
  let value: number | null = null
  let sample = 0
  let needed = 0

  if (goal.metric === 'metal_hit_rate') {
    // Range sessions only, as in the Metal analytics: race bouts are theirs to
    // be measured in Race performance, not against a range goal.
    const raceIds = new Set(data.workouts.filter((w) => w.raceType).map((w) => w.id))
    const bouts = data.metalBouts.filter((b) => !raceIds.has(b.workoutId) && within(b.shotAt, goal) && positionOk(goal, b.position))
    sample = bouts.length
    needed = METAL_MIN_BOUTS
    if (sample > 0) {
      const hits = bouts.reduce((n, b) => n + hitCount(hitsOf(b)), 0)
      value = (hits / (sample * DISCS_PER_METAL_BOUT)) * 100
    }
  } else if (goal.metric === 'precision_score') {
    const bouts = data.bouts.filter((b) => within(b.shotAt, goal) && positionOk(goal, b.position))
    sample = bouts.length
    needed = PRECISION_MIN_BOUTS
    const possible = bouts.reduce((n, b) => n + b.metrics.ringPossible, 0)
    if (possible > 0) value = (bouts.reduce((n, b) => n + b.metrics.ringTotal, 0) / possible) * 100
  } else if (goal.metric === 'dryfire_minutes') {
    value = data.workouts.filter((w) => within(w.startedAt, goal)).reduce((n, w) => n + w.dryfireMinutes, 0)
  }
  // 'sessions' is a program measure: evaluateProgramGoal, from the server's totals.

  const met = value !== null && sample >= needed && value >= goal.target
  const ended = localDate(today.toISOString()) > goal.endsOn
  const status: GoalStatus = goal.achievedAt || met ? 'achieved' : ended ? 'missed' : 'active'
  const shown = goal.achievedAt && goal.achievedValue !== null ? goal.achievedValue : value
  return {
    value: shown,
    sample,
    needed,
    status,
    fraction: shown === null ? 0 : Math.max(0, Math.min(1, shown / goal.target)),
  }
}

/** Live goals are everything not archived: still being worked on, or finished
 *  and not yet tidied away. "All" adds the archived ones back. */
export type GoalFilter = 'live' | 'all'

export const goalsFor = <T extends { g: Goal }>(rows: T[], filter: GoalFilter): T[] =>
  filter === 'all' ? rows : rows.filter(({ g }) => !g.archivedAt)

/** Only a finished goal — met, or past its end date — can be archived. */
export const canArchive = (p: GoalProgress) => p.status !== 'active'

/** Achieved, and the athlete hasn't yet been shown the celebration for it. */
export const needsCelebration = (goal: Goal, p: GoalProgress) =>
  p.status === 'achieved' && !goal.celebratedAt && !goal.archivedAt

/** Has this goal just been met, and not yet recorded as such? */
export const newlyAchieved = (goal: Goal, p: GoalProgress) => !goal.achievedAt && p.status === 'achieved'

// --- Wording ----------------------------------------------------------------

const unit = (m: GoalMetric) => (m === 'dryfire_minutes' ? ' min' : m === 'sessions' ? ' sessions' : '%')

export function formatValue(metric: GoalMetric, value: number | null): string {
  if (value === null) return '—'
  return metric === 'dryfire_minutes' ? `${Math.round(value)} min` : metric === 'sessions' ? `${Math.round(value)}` : `${Math.round(value)}%`
}

const POSITION_LABEL: Record<Position, string> = { prone: 'prone', standing: 'standing' }

/** "Metal hit rate 80% · prone", "Dry-fire 300 min". */
export function goalTitle(g: Pick<Goal, 'metric' | 'position' | 'target'>): string {
  if (g.metric === 'sessions') return `${g.target} sessions`
  const name = g.metric === 'dryfire_minutes' ? 'Dry-fire' : g.metric === 'metal_hit_rate' ? 'Metal hit rate' : 'Precision score'
  const pos = g.position ? ` · ${POSITION_LABEL[g.position]}` : ''
  return `${name} ${g.target}${unit(g.metric)}${pos}`
}

/** "by Oct 31" — the goal's end date, in the reader's own locale. */
export function goalDeadline(g: Goal): string {
  const [y, m, d] = g.endsOn.split('-').map(Number)
  return `by ${new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

/** "Achieved Oct 2 at 84%" — when it was first met, in the reader's own locale;
 *  null for a goal that hasn't been. */
export function goalAchievedText(g: Goal): string | null {
  if (!g.achievedAt) return null
  const at = new Date(g.achievedAt)
  const sameYear = at.getFullYear() === new Date().getFullYear()
  const when = at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
  return `Achieved ${when}${g.achievedValue === null ? '' : ` at ${formatValue(g.metric, g.achievedValue)}`}`
}

/** What's left to say about where it stands, in a few words. */
export function goalStatusText(g: Goal, p: GoalProgress): string {
  if (p.hidden) return `Shows once ${MIN_PROGRAM_CONTRIBUTORS} athletes have trained`
  if (p.status === 'achieved') return 'Achieved'
  if (p.status === 'missed') return p.value === null ? 'Ended with nothing logged' : `Ended at ${formatValue(g.metric, p.value)}`
  if (g.scope === 'program') {
    const n = p.contributors ?? 0
    const total = `${formatValue(g.metric, p.value)} of ${g.target}${unit(g.metric)}`
    if (n >= MIN_PROGRAM_CONTRIBUTORS) return `${total} · ${n} athletes`
    // The total may already be past the target; say why it hasn't counted.
    if (p.value !== null && p.value >= g.target) {
      return `${total} · target reached, but it only counts once ${MIN_PROGRAM_CONTRIBUTORS} athletes have contributed (${n} so far)`
    }
    return `${total} · counts once ${MIN_PROGRAM_CONTRIBUTORS} athletes contribute (${n} so far)`
  }
  if (g.metric !== 'dryfire_minutes' && p.sample < p.needed) {
    return `Averaged over at least ${p.needed} bouts · ${p.sample} so far`
  }
  return `${formatValue(g.metric, p.value)} of ${g.target}${unit(g.metric)}`
}

// --- Program goals ------------------------------------------------------------

/** What the database totals for a program goal (program_goal_progress). */
export interface ProgramAggregate {
  /** The total so far; null when withheld for privacy. */
  value: number | null
  contributors: number
  hidden: boolean
}

/** A program goal's progress from the server's totals: met once the total
 *  reaches the target with enough athletes behind it, and kept once recorded. */
export function evaluateProgramGoal(goal: Goal, agg: ProgramAggregate, today: Date = new Date()): GoalProgress {
  const met = agg.value !== null && agg.contributors >= MIN_PROGRAM_CONTRIBUTORS && agg.value >= goal.target
  const ended = localDate(today.toISOString()) > goal.endsOn
  const status: GoalStatus = goal.achievedAt || met ? 'achieved' : ended ? 'missed' : 'active'
  const shown = goal.achievedAt && goal.achievedValue !== null ? goal.achievedValue : agg.value
  return {
    value: shown,
    sample: 0,
    needed: 0,
    contributors: agg.contributors,
    hidden: agg.hidden && !goal.achievedAt,
    status,
    fraction: shown === null ? 0 : Math.max(0, Math.min(1, shown / goal.target)),
  }
}
