import { supabase } from './supabase'
import { evaluateProgramGoal, type Goal, type GoalMetric, type GoalProgress, type NewGoal, type ProgramAggregate } from './goalProgress'
import type { Position } from './types'

export * from './goalProgress'

// --- Storage ----------------------------------------------------------------

interface GoalRow {
  id: string
  scope: 'athlete' | 'program'
  program_id: string | null
  metric: GoalMetric
  position: Position | null
  target: number
  starts_on: string
  ends_on: string
  shared: boolean
  achieved_at: string | null
  achieved_value: number | null
  archived_at: string | null
  celebrated_at: string | null
  created_at: string
}

const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  scope: r.scope,
  programId: r.program_id,
  metric: r.metric,
  position: r.position,
  target: Number(r.target),
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  shared: r.shared,
  achievedAt: r.achieved_at,
  achievedValue: r.achieved_value === null ? null : Number(r.achieved_value),
  archivedAt: r.archived_at,
  celebratedAt: r.celebrated_at,
  createdAt: r.created_at,
})

const COLUMNS = 'id, scope, program_id, metric, position, target, starts_on, ends_on, shared, achieved_at, achieved_value, archived_at, celebrated_at, created_at'

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
    .from('goals').select(COLUMNS).eq('scope', 'athlete').eq('athlete_id', await currentUserId()).order('ends_on').order('created_at')
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

/** Tidies a finished goal off the home, or brings it back. */
export async function setGoalArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase.from('goals').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id)
  if (error) throw error
}

/** Records that the athlete has been shown the celebration, so it's once per goal. */
export async function markGoalsCelebrated(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase
    .from('goals').update({ celebrated_at: new Date().toISOString() }).in('id', ids).is('celebrated_at', null)
  if (error) throw error
}

/** The goals an athlete has shared with the coaches who see their training —
 *  what a coach reading that athlete's page can see; the database enforces it. */
export async function sharedGoalsOf(athleteId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals').select(COLUMNS).eq('athlete_id', athleteId).eq('shared', true).is('archived_at', null).order('ends_on')
  if (error) throw error
  return (data as GoalRow[]).map(toGoal)
}

// --- Program goals ------------------------------------------------------------
// Set by the coaches who manage a program, for the whole program, on process
// measures only (see PROGRAM_GOAL_METRICS). Progress is totalled by the
// database, which also decides who may see it.

export interface ProgramGoalInput {
  metric: GoalMetric
  target: number
  endsOn: string
}

/** A program's goals: readable by its coaches and its athletes. */
export async function programGoalsOf(programId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals').select(COLUMNS).eq('scope', 'program').eq('program_id', programId).order('ends_on').order('created_at')
  if (error) throw error
  return (data as GoalRow[]).map(toGoal)
}

/** The program goals for every program the signed-in athlete is in, with the
 *  program's name. The database only hands over their own programs' goals. */
export async function myProgramGoals(): Promise<{ goal: Goal; programName: string }[]> {
  const { data, error } = await supabase
    .from('goals').select(COLUMNS).eq('scope', 'program').order('ends_on').order('created_at')
  if (error) throw error
  const goals = (data as GoalRow[]).map(toGoal)
  if (goals.length === 0) return []
  const ids = [...new Set(goals.map((g) => g.programId as string))]
  const { data: programs, error: pErr } = await supabase.from('programs').select('id, name').in('id', ids)
  if (pErr) throw pErr
  const nameById = new Map((programs ?? []).map((p) => [p.id as string, p.name as string]))
  return goals.map((goal) => ({ goal, programName: nameById.get(goal.programId as string) ?? '' }))
}

export async function createProgramGoal(programId: string, g: ProgramGoalInput): Promise<void> {
  const { error } = await supabase.from('goals').insert({
    scope: 'program',
    program_id: programId,
    metric: g.metric,
    target: g.target,
    ends_on: g.endsOn,
    created_by: await currentUserId(),
  })
  if (error) throw error
}

/** The program's total so far for one goal, and whether it's withheld. Also
 *  where a goal is first recorded as achieved. */
export async function programGoalProgress(goalId: string): Promise<{ aggregate: ProgramAggregate; achievedAt: string | null; achievedValue: number | null }> {
  const { data, error } = await supabase.rpc('program_goal_progress', { p_goal_id: goalId })
  if (error) throw error
  const r = (data as { value: number | null; contributors: number; hidden: boolean; achieved_at: string | null; achieved_value: number | null }[] | null)?.[0]
  if (!r) throw new Error('Could not read that goal')
  return {
    aggregate: { value: r.value === null ? null : Number(r.value), contributors: r.contributors, hidden: r.hidden },
    achievedAt: r.achieved_at,
    achievedValue: r.achieved_value === null ? null : Number(r.achieved_value),
  }
}

/** A program's goals with their progress worked out, ready to show. */
export async function programGoalRows(programId: string): Promise<{ g: Goal; p: GoalProgress }[]> {
  const goals = await programGoalsOf(programId)
  return Promise.all(goals.map(async (goal) => {
    const r = await programGoalProgress(goal.id)
    const g = { ...goal, achievedAt: r.achievedAt, achievedValue: r.achievedValue }
    return { g, p: evaluateProgramGoal(g, r.aggregate) }
  }))
}
