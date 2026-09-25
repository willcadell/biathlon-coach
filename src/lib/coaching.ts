import { supabase } from './supabase'
import { toBout, toMetalBout, toWorkout, type BoutRow, type ClickRow, type CoachNoteRow, type MetalRow, type WorkoutRow } from './db'
import type { Bout, CoachNote, MetalBout, Workout } from './types'

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

/** Renaming an existing coach identity — distinct from becomeCoach, which
 *  reads as "set this identity up" even though the underlying upsert would
 *  work either way. */
export async function updateCoachDisplayName(coachId: string, displayName: string): Promise<void> {
  const { error } = await supabase.from('coaches').update({ display_name: displayName }).eq('id', coachId)
  if (error) throw error
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
  /** Storage path in the public club-logos bucket, or null if the club
   *  hasn't set one. Turn into a displayable URL with clubLogoUrl. */
  logoPath: string | null
}

/** club-logos is a public bucket, so this is a plain URL, not a signed one
 *  that needs refreshing — a logo isn't private the way a target photo is. */
export function clubLogoUrl(logoPath: string): string {
  return supabase.storage.from('club-logos').getPublicUrl(logoPath).data.publicUrl
}

/** Uploads a club's logo (already resized client-side — see forLogo in
 *  imaging.ts) and points the club row at it. Admin-only: enforced by the
 *  storage and clubs RLS policies, not just this function. */
export async function uploadClubLogo(clubId: string, image: Blob): Promise<string> {
  const path = `${clubId}/logo.jpg`
  const { error: upErr } = await supabase.storage
    .from('club-logos')
    .upload(path, image, { contentType: 'image/jpeg', upsert: true })
  if (upErr) throw upErr
  const { error } = await supabase.from('clubs').update({ logo_path: path }).eq('id', clubId)
  if (error) throw error
  return path
}

/** Creates a club and assigns its creator as the club's admin coach, both
 *  inside one database function — see create_club in the migration for why
 *  this isn't two client-side inserts. */
export async function createClub(name: string): Promise<Club> {
  const { data, error } = await supabase.rpc('create_club', { p_name: name })
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('Could not create club')
  return { id: row.id, name: row.name, joinCode: row.join_code, isAdmin: true, logoPath: null }
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
  const { data, error } = await supabase.from('clubs').select('id, name, join_code, logo_path').in('id', clubIds)
  if (error) throw error
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    joinCode: c.join_code,
    isAdmin: adminByClub.get(c.id) ?? false,
    logoPath: c.logo_path,
  }))
}

/** Admin-only, like creating a club — see rename_club in the migration,
 *  which checks is_admin itself and re-applies the same friendly
 *  uniqueness check create_club does. */
export async function renameClub(clubId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('rename_club', { p_club_id: clubId, p_name: name.trim() })
  if (error) throw error
}

export interface Program {
  id: string
  clubId: string
  name: string
  /** An athlete join code, scoped to this program — see
   *  join_program_as_athlete. Only ever read by a coach who can already see
   *  this row (this table has no separate admin-only code the way a club's
   *  coach invite code does). */
  joinCode: string
}

/** Every program under a club — see the "members read their programs"
 *  policy for who actually gets rows back (a coach scoped to one program
 *  only sees that one; oversight of the whole club sees them all). */
export async function programsForClub(clubId: string): Promise<Program[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('id, club_id, name, join_code')
    .eq('club_id', clubId)
    .order('name')
  if (error) throw error
  return (data ?? []).map((p) => ({ id: p.id, clubId: p.club_id, name: p.name, joinCode: p.join_code }))
}

/** Any coach assigned to the club can add one — not admin-only, unlike
 *  renaming the club itself. */
export async function createProgram(clubId: string, name: string): Promise<Program> {
  const { data, error } = await supabase
    .from('programs')
    .insert({ club_id: clubId, name: name.trim() })
    .select('id, club_id, name, join_code')
    .single()
  if (error) throw error
  return { id: data.id, clubId: data.club_id, name: data.name, joinCode: data.join_code }
}

/** Any coach who oversees the club, or is scoped to this program, can delete
 *  it — see delete_program. Athletes in it stay in the club, just unassigned. */
export async function deleteProgram(programId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_program', { p_program_id: programId })
  if (error) throw error
}

/** Takes an athlete out of a program without removing them from the club —
 *  see remove_athlete_from_program. */
export async function removeAthleteFromProgram(athleteId: string, programId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_athlete_from_program', { p_athlete_id: athleteId, p_program_id: programId })
  if (error) throw error
}

/** Admin-only, enforced by set_coach_admin itself — which also refuses to
 *  demote a club's last admin. */
export async function setCoachAdmin(clubId: string, coachId: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_coach_admin', { p_club_id: clubId, p_coach_id: coachId, p_is_admin: isAdmin })
  if (error) throw error
}

/** Admin-only, enforced by remove_coach_from_club itself. */
export async function removeCoachFromClub(clubId: string, coachId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_coach_from_club', { p_club_id: clubId, p_coach_id: coachId })
  if (error) throw error
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

export interface ProgramMatch {
  id: string
  name: string
  clubId: string
  clubName: string
}

/** Same idea as findClubByJoinCode, one level down — resolves a program's
 *  own code without requiring the caller already belong to it. */
export async function findProgramByJoinCode(code: string): Promise<ProgramMatch | null> {
  const { data, error } = await supabase.rpc('find_program_by_join_code', { p_code: code.trim().toUpperCase() })
  if (error) throw error
  const row = data?.[0]
  return row ? { id: row.id, name: row.name, clubId: row.club_id, clubName: row.club_name } : null
}

/** Joins the program's club too, if the athlete isn't a member yet — see
 *  join_program_as_athlete, which folds both into one step and moves an
 *  existing membership into the program rather than duplicating it. */
export async function joinProgramAsAthlete(code: string): Promise<ProgramMatch> {
  const { data, error } = await supabase.rpc('join_program_as_athlete', { p_code: code.trim().toUpperCase() })
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('Could not join that program')
  return { id: row.id, name: row.name, clubId: row.club_id, clubName: row.club_name }
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
  logoPath: string | null
  /** Null when the athlete hasn't been assigned to a program in this club
   *  yet — see athlete_memberships.program_id. */
  programName: string | null
}

export async function myMemberships(): Promise<Membership[]> {
  const athleteId = await currentUserId()
  const { data: memberships, error: mErr } = await supabase
    .from('athlete_memberships')
    .select('club_id, program_id')
    .eq('athlete_id', athleteId)
  if (mErr) throw mErr
  if (!memberships || memberships.length === 0) return []

  const clubIds = [...new Set(memberships.map((m) => m.club_id as string))]
  const programIds = [...new Set(memberships.map((m) => m.program_id as string | null).filter((id): id is string => id !== null))]

  const [{ data: clubs, error: cErr }, { data: programs, error: pErr }] = await Promise.all([
    supabase.from('clubs').select('id, name, logo_path').in('id', clubIds),
    programIds.length > 0
      ? supabase.from('programs').select('id, name').in('id', programIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ])
  if (cErr) throw cErr
  if (pErr) throw pErr

  const clubById = new Map((clubs ?? []).map((c) => [c.id, c]))
  const programNameById = new Map((programs ?? []).map((p) => [p.id, p.name]))

  return memberships.map((m) => {
    const club = clubById.get(m.club_id as string)
    return {
      clubId: m.club_id as string,
      clubName: club?.name ?? '',
      logoPath: club?.logo_path ?? null,
      programName: m.program_id ? programNameById.get(m.program_id as string) ?? null : null,
    }
  })
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
  /** Null when not yet assigned to a program in this club. */
  programId: string | null
}

export async function rosterForClub(clubId: string): Promise<RosterAthlete[]> {
  const { data: memberships, error: mErr } = await supabase
    .from('athlete_memberships')
    .select('athlete_id, program_id')
    .eq('club_id', clubId)
  if (mErr) throw mErr
  if (!memberships || memberships.length === 0) return []

  const programByAthlete = new Map(memberships.map((m) => [m.athlete_id as string, m.program_id as string | null]))
  const athleteIds = [...programByAthlete.keys()]

  const { data, error } = await supabase.from('athletes').select('id, display_name').in('id', athleteIds)
  if (error) throw error
  return (data ?? []).map((a) => ({
    athleteId: a.id,
    displayName: a.display_name,
    programId: programByAthlete.get(a.id) ?? null,
  }))
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

/** Every workout across a roster the caller coaches, with its click log and
 *  any coach notes already left on it — the same shape History and Analysis
 *  already know how to read, so a roster athlete's data drops straight into
 *  either view unchanged. */
export async function rosterWorkouts(athleteIds: string[]): Promise<Workout[]> {
  if (athleteIds.length === 0) return []
  const { data: rows, error } = await supabase.from('workouts').select('*').in('athlete_id', athleteIds).order('started_at', { ascending: false })
  if (error) throw error
  const workoutIds = (rows ?? []).map((r) => r.id as string)
  if (workoutIds.length === 0) return []

  const [{ data: clicks, error: clickErr }, { data: notes, error: notesErr }] = await Promise.all([
    supabase.from('click_adjustments').select('*').in('workout_id', workoutIds),
    supabase.from('workout_coach_notes').select('*').in('workout_id', workoutIds),
  ])
  if (clickErr) throw clickErr
  if (notesErr) throw notesErr
  return (rows as WorkoutRow[]).map((r) => toWorkout(r, (clicks as ClickRow[]) ?? [], (notes as CoachNoteRow[]) ?? []))
}

/** Leaves feedback on an athlete's workout — the one write a coach can make
 *  on data that is otherwise read-only to them. The database re-checks
 *  is_coach_of itself, so this can't be aimed at a workout outside the
 *  caller's roster by constructing the call directly. */
export async function addCoachNote(workoutId: string, note: string): Promise<CoachNote> {
  const coachId = await currentUserId()
  const coach = await getCoach(coachId)
  if (!coach) throw new Error('Only a coach can leave a coach note')
  const { data, error } = await supabase
    .from('workout_coach_notes')
    .insert({ workout_id: workoutId, coach_id: coachId, coach_name: coach.displayName, note })
    .select('*')
    .single()
  if (error) throw error
  return { id: data.id, coachId: data.coach_id, coachName: data.coach_name, createdAt: data.created_at, note: data.note }
}

/** A coach can only remove their own note — see the "coach deletes own
 *  notes" policy, which checks coach_id itself. */
export async function deleteCoachNote(id: string): Promise<void> {
  const { error } = await supabase.from('workout_coach_notes').delete().eq('id', id)
  if (error) throw error
}
