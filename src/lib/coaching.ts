import { supabase } from './supabase'
import { toBout, toMetalBout, type BoutRow, type MetalRow } from './db'
import type { Bout, MetalBout } from './types'

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}

export interface Coach {
  id: string
  displayName: string
}

export async function getCoach(userId: string): Promise<Coach | null> {
  const { data, error } = await supabase.from('coaches').select('id, display_name').eq('id', userId).maybeSingle()
  if (error) throw error
  return data ? { id: data.id, displayName: data.display_name } : null
}

/** Opts the current user into a second, parallel identity as a coach —
 *  distinct from being an athlete, since plenty of coaches also log their
 *  own training. Safe to call again later to update the display name. */
export async function becomeCoach(displayName: string): Promise<Coach> {
  const userId = await currentUserId()
  const { error } = await supabase.from('coaches').upsert({ id: userId, display_name: displayName })
  if (error) throw error
  return { id: userId, displayName }
}

export interface Club {
  id: string
  name: string
  /** The code an athlete enters to join — any coach on the club can see
   *  and share this one. */
  joinCode: string
  /** Whether the caller is this club's admin coach — only they can see the
   *  separate coach invite code (fetch it with getCoachJoinCode). */
  isAdmin: boolean
}

/** Creates a club and assigns its creator as the club's admin coach, both
 *  inside one database function — see create_club in the migration for why
 *  this isn't two client-side inserts. */
export async function createClub(name: string): Promise<Club> {
  const { data, error } = await supabase.rpc('create_club', { p_name: name })
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('Could not create club')
  return { id: row.id, name: row.name, joinCode: row.join_code, isAdmin: true }
}

/** Every club the current user coaches, admin or not. */
export async function myCoachedClubs(): Promise<Club[]> {
  const coachId = await currentUserId()
  const { data: assignments, error: aErr } = await supabase
    .from('coach_assignments')
    .select('club_id, is_admin')
    .eq('coach_id', coachId)
  if (aErr) throw aErr
  if (!assignments || assignments.length === 0) return []

  const adminByClub = new Map(assignments.map((a) => [a.club_id as string, a.is_admin as boolean]))
  const clubIds = [...adminByClub.keys()]

  // Deliberately not selecting coach_join_code here — every coach on a club
  // can read this row, and that code is admin-only. See get_coach_join_code.
  const { data, error } = await supabase.from('clubs').select('id, name, join_code').in('id', clubIds)
  if (error) throw error
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    joinCode: c.join_code,
    isAdmin: adminByClub.get(c.id) ?? false,
  }))
}

/** Only the admin coach of this club gets a code back — see
 *  get_coach_join_code in the migration, which checks is_admin itself
 *  rather than trusting the caller's own idea of their role. */
export async function getCoachJoinCode(clubId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_coach_join_code', { p_club_id: clubId })
  if (error) throw error
  return data ?? null
}

export interface ClubMatch {
  id: string
  name: string
}

/** Resolves an athlete join code to the club it belongs to, without ever
 *  exposing the clubs table itself — see find_club_by_join_code. */
export async function findClubByJoinCode(code: string): Promise<ClubMatch | null> {
  const { data, error } = await supabase.rpc('find_club_by_join_code', { p_code: code.trim().toUpperCase() })
  if (error) throw error
  const row = data?.[0]
  return row ? { id: row.id, name: row.name } : null
}

/** Same idea, for the separate coach invite code. */
export async function findClubByCoachCode(code: string): Promise<ClubMatch | null> {
  const { data, error } = await supabase.rpc('find_club_by_coach_code', { p_code: code.trim().toUpperCase() })
  if (error) throw error
  const row = data?.[0]
  return row ? { id: row.id, name: row.name } : null
}

/** The actual join — a database function re-checks the code itself, so
 *  this can't be skipped by calling the table directly. */
export async function joinClubAsAthlete(code: string): Promise<void> {
  const { error } = await supabase.rpc('join_club_as_athlete', { p_code: code.trim().toUpperCase() })
  if (error) throw error
}

/** Never grants admin — an invited coach can see and manage the roster but
 *  can't invite further coaches themselves. */
export async function joinClubAsCoach(code: string): Promise<void> {
  const { error } = await supabase.rpc('join_club_as_coach', { p_code: code.trim().toUpperCase() })
  if (error) throw error
}

export interface Membership {
  clubId: string
  clubName: string
}

export async function myMemberships(): Promise<Membership[]> {
  const athleteId = await currentUserId()
  const { data: memberships, error: mErr } = await supabase
    .from('athlete_memberships')
    .select('club_id')
    .eq('athlete_id', athleteId)
  if (mErr) throw mErr
  const clubIds = [...new Set((memberships ?? []).map((m) => m.club_id as string))]
  if (clubIds.length === 0) return []

  const { data, error } = await supabase.from('clubs').select('id, name').in('id', clubIds)
  if (error) throw error
  return (data ?? []).map((c) => ({ clubId: c.id, clubName: c.name }))
}

export async function leaveClub(clubId: string): Promise<void> {
  const athleteId = await currentUserId()
  const { error } = await supabase
    .from('athlete_memberships')
    .delete()
    .eq('club_id', clubId)
    .eq('athlete_id', athleteId)
  if (error) throw error
}

export interface RosterAthlete {
  athleteId: string
  displayName: string
}

export async function rosterForClub(clubId: string): Promise<RosterAthlete[]> {
  const { data: memberships, error: mErr } = await supabase
    .from('athlete_memberships')
    .select('athlete_id')
    .eq('club_id', clubId)
  if (mErr) throw mErr
  const athleteIds = [...new Set((memberships ?? []).map((m) => m.athlete_id as string))]
  if (athleteIds.length === 0) return []

  const { data, error } = await supabase.from('athletes').select('id, display_name').in('id', athleteIds)
  if (error) throw error
  return (data ?? []).map((a) => ({ athleteId: a.id, displayName: a.display_name }))
}

export interface CoCoach {
  coachId: string
  displayName: string
  isAdmin: boolean
}

/** Every coach assigned to a club, not just the caller — lets an admin see
 *  who they've already invited, and any coach see who else they're
 *  coaching alongside. */
export async function coachesForClub(clubId: string): Promise<CoCoach[]> {
  const { data: assignments, error: aErr } = await supabase
    .from('coach_assignments')
    .select('coach_id, is_admin')
    .eq('club_id', clubId)
  if (aErr) throw aErr
  if (!assignments || assignments.length === 0) return []

  const adminByCoach = new Map(assignments.map((a) => [a.coach_id as string, a.is_admin as boolean]))
  const coachIds = [...adminByCoach.keys()]

  const { data, error } = await supabase.from('coaches').select('id, display_name').in('id', coachIds)
  if (error) throw error
  return (data ?? []).map((c) => ({
    coachId: c.id,
    displayName: c.display_name,
    isAdmin: adminByCoach.get(c.id) ?? false,
  }))
}

/** Every precision bout across a roster the caller actually coaches — the
 *  "coach reads linked bouts" policy filters this down to only athletes
 *  is_coach_of confirms regardless of which ids are asked for, so passing
 *  a roster this coach doesn't own just comes back empty, not an error. */
export async function rosterBouts(athleteIds: string[]): Promise<Bout[]> {
  if (athleteIds.length === 0) return []
  const { data, error } = await supabase.from('precision_bouts').select('*').in('athlete_id', athleteIds)
  if (error) throw error
  return (data as BoutRow[] ?? []).map(toBout)
}

export async function rosterMetalBouts(athleteIds: string[]): Promise<MetalBout[]> {
  if (athleteIds.length === 0) return []
  const { data, error } = await supabase.from('metal_bouts').select('*').in('athlete_id', athleteIds)
  if (error) throw error
  return (data as MetalRow[] ?? []).map(toMetalBout)
}
