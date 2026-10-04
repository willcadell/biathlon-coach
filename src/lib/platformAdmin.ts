import { supabase } from './supabase'
import type { Club } from './coaching'

/**
 * The platform admin: the operator of the app, who can look at any club
 * read-only. It's a disclosed role, not a back door: it isn't a club coach and
 * appears on no coach list, but every time a club or an athlete is opened here
 * it's logged, and the athlete can see the entry about themselves. The role is
 * granted in the database only (see platform_admins), and the database, not
 * this file, decides what it can read.
 */

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}

export async function amPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('i_am_platform_admin')
  if (error) throw error
  return data === true
}

/** Every club, as the read-only view needs it: no join codes, and never admin. */
export async function platformClubs(): Promise<Club[]> {
  const { data, error } = await supabase.from('clubs').select('id, name, logo_path').order('name')
  if (error) throw error
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, joinCode: '', isAdmin: false, logoPath: c.logo_path }))
}

export type AccessAction = 'open_club' | 'open_athlete'

/** Records that a club or an athlete was opened. Called by the platform
 *  screens as they open; it records in-app use. */
export async function logPlatformAccess(action: AccessAction, clubId: string | null, athleteId: string | null): Promise<void> {
  const { error } = await supabase.rpc('log_platform_access', { p_action: action, p_club_id: clubId, p_athlete_id: athleteId })
  if (error) throw error
}

export interface AccessEntry {
  id: number
  action: AccessAction
  clubName: string | null
  athleteName: string | null
  at: string
}

/** The platform admin's own view of the log. */
export async function recentPlatformAccess(limit = 50): Promise<AccessEntry[]> {
  const { data, error } = await supabase
    .from('platform_access_log').select('id, action, club_name, athlete_name, at').order('at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, action: r.action, clubName: r.club_name, athleteName: r.athlete_name, at: r.at }))
}

/** When someone from the platform looked at this athlete's own training, for
 *  the athlete to see. Scoped to them, though the database only returns their
 *  own entries to an athlete anyway. */
export async function accessToMyData(limit = 20): Promise<{ id: number; at: string }[]> {
  const { data, error } = await supabase
    .from('platform_access_log').select('id, at').eq('athlete_id', await currentUserId()).eq('action', 'open_athlete')
    .order('at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as { id: number; at: string }[]
}
