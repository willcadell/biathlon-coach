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

export type GoalMetric = 'metal_hit_rate' | 'precision_score' | 'dryfire_minutes'

export const GOAL_METRICS: { id: GoalMetric; label: string }[] = [
  { id: 'metal_hit_rate', label: 'Metal hit rate' },
  { id: 'precision_score', label: 'Precision score' },
  { id: 'dryfire_minutes', label: 'Dry-fire minutes' },
]

export interface Goal {
  id: string
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
    const bouts = data.metalBouts.filter((b) => within(b.shotAt, goal) && positionOk(goal, b.position))
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
  } else {
    value = data.workouts.filter((w) => within(w.startedAt, goal)).reduce((n, w) => n + w.dryfireMinutes, 0)
  }

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

/** Home shows what's live, plus a finished goal for a fortnight — long enough
 *  to enjoy (or shrug off) the result, short enough not to pile up. Older ones
 *  stay in Profile, where goals are managed. */
export function showOnHome(goal: Goal, p: GoalProgress, today: Date = new Date()): boolean {
  if (p.status === 'active') return true
  const FORTNIGHT = 14 * 86_400_000
  const since = p.status === 'achieved'
    ? (goal.achievedAt ? new Date(goal.achievedAt) : today)
    : new Date(`${goal.endsOn}T23:59:59`) // no zone: read as the athlete's local end of day
  return today.getTime() - since.getTime() < FORTNIGHT
}

/** Has this goal just been met, and not yet recorded as such? */
export const newlyAchieved = (goal: Goal, p: GoalProgress) => !goal.achievedAt && p.status === 'achieved'

// --- Wording ----------------------------------------------------------------

const unit = (m: GoalMetric) => (m === 'dryfire_minutes' ? ' min' : '%')

export function formatValue(metric: GoalMetric, value: number | null): string {
  if (value === null) return '—'
  return metric === 'dryfire_minutes' ? `${Math.round(value)} min` : `${Math.round(value)}%`
}

const POSITION_LABEL: Record<Position, string> = { prone: 'prone', standing: 'standing' }

/** "Metal hit rate 80% · prone", "Dry-fire 300 min". */
export function goalTitle(g: Goal): string {
  const name = g.metric === 'dryfire_minutes' ? 'Dry-fire' : g.metric === 'metal_hit_rate' ? 'Metal hit rate' : 'Precision score'
  const pos = g.position ? ` · ${POSITION_LABEL[g.position]}` : ''
  return `${name} ${g.target}${unit(g.metric)}${pos}`
}

/** "by Oct 31" — the goal's end date, in the reader's own locale. */
export function goalDeadline(g: Goal): string {
  const [y, m, d] = g.endsOn.split('-').map(Number)
  return `by ${new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

/** What's left to say about where it stands, in a few words. */
export function goalStatusText(g: Goal, p: GoalProgress): string {
  if (p.status === 'achieved') return 'Achieved'
  if (p.status === 'missed') return p.value === null ? 'Ended with nothing logged' : `Ended at ${formatValue(g.metric, p.value)}`
  if (g.metric !== 'dryfire_minutes' && p.sample < p.needed) {
    const more = p.needed - p.sample
    return `${more} more ${g.metric === 'metal_hit_rate' ? 'metal' : 'precision'} bout${more === 1 ? '' : 's'} to count`
  }
  return `${formatValue(g.metric, p.value)} of ${g.target}${unit(g.metric)}`
}
