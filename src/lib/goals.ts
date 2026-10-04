import { supabase } from './supabase'
import type { Goal, GoalMetric, NewGoal } from './goalProgress'
import type { Position } from './types'

export * from './goalProgress'

// --- Storage ----------------------------------------------------------------

interface GoalRow {
  id: string
  metric: GoalMetric
  position: Position | null
  target: number
  starts_on: string
  ends_on: string
  shared: boolean
  achieved_at: string | null
  achieved_value: number | null
}

const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  metric: r.metric,
  position: r.position,
  target: Number(r.target),
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  shared: r.shared,
  achievedAt: r.achieved_at,
  achievedValue: r.achieved_value === null ? null : Number(r.achieved_value),
})

const COLUMNS = 'id, metric, position, target, starts_on, ends_on, shared, achieved_at, achieved_value'

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}

/** The signed-in athlete's own goals. Scoped to them on purpose, same as the
 *  workout loaders: a coach can also read the goals their athletes shared, and
 *  those must never turn up in the coach's own list. */
export async function myGoals(): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals').select(COLUMNS).eq('athlete_id', await currentUserId()).order('ends_on').order('created_at')
  if (error) throw error
  return (data as GoalRow[]).map(toGoal)
}

export async function createGoal(g: NewGoal): Promise<void> {
  const { error } = await supabase.from('goals').insert({
    athlete_id: await currentUserId(),
    metric: g.metric,
    position: g.metric === 'dryfire_minutes' ? null : g.position,
    target: g.target,
    ends_on: g.endsOn,
    shared: g.shared,
  })
  if (error) throw error
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) throw error
}

export async function setGoalShared(id: string, shared: boolean): Promise<void> {
  const { error } = await supabase.from('goals').update({ shared }).eq('id', id)
  if (error) throw error
}

/** Records that a goal has been met, once. Keeps the value it was met at, so
 *  the goal stays achieved even if the average later drifts back down. */
export async function markGoalAchieved(id: string, value: number): Promise<void> {
  const { error } = await supabase
    .from('goals').update({ achieved_at: new Date().toISOString(), achieved_value: value }).eq('id', id).is('achieved_at', null)
  if (error) throw error
}

/** The goals an athlete has shared with the coaches who see their training —
 *  what a coach reading that athlete's page can see; the database enforces it. */
export async function sharedGoalsOf(athleteId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals').select(COLUMNS).eq('athlete_id', athleteId).eq('shared', true).order('ends_on')
  if (error) throw error
  return (data as GoalRow[]).map(toGoal)
}
