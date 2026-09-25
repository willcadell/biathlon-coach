import { supabase } from './supabase'

/**
 * A personal coach is one person following one athlete — a parent, or a coach
 * outside the athlete's club. It always starts with the athlete: they make an
 * invite, hand over the code, and the coach accepts it. Neither side can
 * create the link alone (see the personal_coaches migration), and either can
 * end it.
 */

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}

export interface PersonalInvite {
  code: string
  expiresAt: string
}

/** The athlete's live invite, if they have one that hasn't expired. */
export async function currentPersonalInvite(): Promise<PersonalInvite | null> {
  const { data, error } = await supabase
    .from('personal_coach_invites')
    .select('code, expires_at')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw error
  return data ? { code: data.code, expiresAt: data.expires_at } : null
}

/** Replaces any earlier invite, so only the newest code works. */
export async function createPersonalInvite(): Promise<PersonalInvite> {
  const { data, error } = await supabase.rpc('create_personal_coach_invite')
  if (error) throw error
  const row = (data as { invite_code: string; invite_expires_at: string }[] | null)?.[0]
  if (!row) throw new Error('Could not create an invite')
  return { code: row.invite_code, expiresAt: row.invite_expires_at }
}

export async function cancelPersonalInvite(): Promise<void> {
  const { error } = await supabase.from('personal_coach_invites').delete().eq('athlete_id', await currentUserId())
  if (error) throw error
}

export interface PersonalCoach {
  coachId: string
  displayName: string
}

/** The people who can follow this athlete. */
export async function myPersonalCoaches(): Promise<PersonalCoach[]> {
  const athleteId = await currentUserId()
  const { data: links, error } = await supabase.from('personal_coaches').select('coach_id').eq('athlete_id', athleteId)
  if (error) throw error
  if (!links || links.length === 0) return []
  const ids = links.map((l) => l.coach_id as string)
  const { data: coaches, error: cErr } = await supabase.from('coaches').select('id, display_name').in('id', ids)
  if (cErr) throw cErr
  const nameById = new Map((coaches ?? []).map((c) => [c.id as string, c.display_name as string]))
  return ids.map((id) => ({ coachId: id, displayName: nameById.get(id) ?? '' }))
}

export async function removePersonalCoach(coachId: string): Promise<void> {
  const { error } = await supabase
    .from('personal_coaches').delete().eq('athlete_id', await currentUserId()).eq('coach_id', coachId)
  if (error) throw error
}

export interface PersonalAthlete {
  athleteId: string
  displayName: string
}

/** The athletes this coach follows personally, whatever club they're in. */
export async function myPersonalAthletes(): Promise<PersonalAthlete[]> {
  const coachId = await currentUserId()
  const { data: links, error } = await supabase.from('personal_coaches').select('athlete_id').eq('coach_id', coachId)
  if (error) throw error
  if (!links || links.length === 0) return []
  const ids = links.map((l) => l.athlete_id as string)
  const { data: athletes, error: aErr } = await supabase.from('athletes').select('id, display_name').in('id', ids)
  if (aErr) throw aErr
  const nameById = new Map((athletes ?? []).map((a) => [a.id as string, a.display_name as string]))
  return ids
    .map((id) => ({ athleteId: id, displayName: nameById.get(id) ?? '' }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** Who a live invite code belongs to, without using it up. Null if it's not valid. */
export async function findPersonalInvite(code: string): Promise<PersonalAthlete | null> {
  const { data, error } = await supabase.rpc('find_personal_coach_invite', { p_code: code.trim().toUpperCase() })
  if (error) throw error
  const row = (data as { athlete_id: string; athlete_name: string }[] | null)?.[0]
  return row ? { athleteId: row.athlete_id, displayName: row.athlete_name } : null
}

/** Accept an athlete's invite. The code is single-use and expires. */
export async function redeemPersonalInvite(code: string): Promise<PersonalAthlete> {
  const { data, error } = await supabase.rpc('redeem_personal_coach_invite', { p_code: code.trim().toUpperCase() })
  if (error) throw error
  const row = (data as { athlete_id: string; athlete_name: string }[] | null)?.[0]
  if (!row) throw new Error('Could not accept that invite')
  return { athleteId: row.athlete_id, displayName: row.athlete_name }
}

/** A personal coach steps away from an athlete. */
export async function stopCoachingAthlete(athleteId: string): Promise<void> {
  const { error } = await supabase
    .from('personal_coaches').delete().eq('coach_id', await currentUserId()).eq('athlete_id', athleteId)
  if (error) throw error
}
