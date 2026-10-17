import type { Session } from '@supabase/supabase-js'
import { DEV_MODE_KEY, supabase } from './supabase'
import type { ShootingDirection } from './types'

/** Set by signOut() so the sign-in screen can tell "you pressed Sign out" from
 *  "your session ended on its own" and say so. */
let signOutRequested = false

/**
 * Fires immediately with whatever session already exists (or null), then
 * again on every sign-in/sign-out/token-refresh. Callers don't need to call
 * getSession() themselves first. The second argument is true only when the
 * session ended without the person asking (expired, revoked elsewhere).
 */
export function onAuthChange(cb: (session: Session | null, endedUnexpectedly: boolean) => void): () => void {
  void supabase.auth.getSession().then(({ data }) => cb(data.session, false))
  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    const unexpected = event === 'SIGNED_OUT' && !signOutRequested
    if (event === 'SIGNED_OUT') signOutRequested = false
    cb(session, unexpected)
  })
  return () => sub.subscription.unsubscribe()
}

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}

/** Signs out of THIS device only. supabase-js signs out everywhere by default,
 *  which meant pressing Sign out on a laptop ended the session on the phone
 *  too, in the middle of whatever the phone was doing. */
export function signOut() {
  // Dev mode is tied to the tab, so leave it behind with the account.
  try { sessionStorage.removeItem(DEV_MODE_KEY) } catch { /* nothing to clear */ }
  signOutRequested = true
  return supabase.auth.signOut({ scope: 'local' })
}

/** The signed-in person's id, read from the session on this device. It does
 *  not ask the auth server: getUser() makes a network call every time, which
 *  fails with no signal at the range, and signs the person out if the server
 *  answers that the session is gone. Row-level security checks the token on
 *  the server for every query anyway, so the id here is only for addressing. */
export async function currentUserIdOrNull(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export async function currentUserId(): Promise<string> {
  const id = await currentUserIdOrNull()
  if (!id) throw new Error('Not signed in')
  return id
}

const ROLE_INTENT_KEY = 'biathlon-coach:role-intent'

/** Captured on the sign-in screen before the redirect to Google, so the
 *  identity gate can act on "sign in as a coach/athlete" once the session
 *  comes back, instead of asking the same question again right after. */
export function setRoleIntent(role: 'athlete' | 'coach'): void {
  try {
    sessionStorage.setItem(ROLE_INTENT_KEY, role)
  } catch {
    // Not fatal — the identity gate just asks normally if this didn't stick.
  }
}

/** Reads and clears the intent in one step, so a later, unrelated identity
 *  refresh elsewhere in the app never re-applies a stale choice. */
export function consumeRoleIntent(): 'athlete' | 'coach' | null {
  try {
    const v = sessionStorage.getItem(ROLE_INTENT_KEY)
    sessionStorage.removeItem(ROLE_INTENT_KEY)
    return v === 'athlete' || v === 'coach' ? v : null
  } catch {
    return null
  }
}

/** Google SSO has no separate sign-up step, so this is the closest thing to
 *  one: the name a fresh identity starts with, before the athlete or coach
 *  ever gets a chance to change it themselves. */
export function displayNameFromSession(session: Session): string {
  const meta = session.user.user_metadata as { full_name?: string; name?: string }
  return meta.full_name ?? meta.name ?? session.user.email ?? ''
}

/**
 * Creates the `athletes` row for a signed-in user choosing to set up as an
 * athlete — at first sign-in, or later if they started as a coach-only
 * identity and want to add training of their own. Safe to call again: it
 * just re-syncs the display name from Google.
 */
export async function ensureAthleteRow(session: Session): Promise<void> {
  const { error } = await supabase
    .from('athletes')
    .upsert({ id: session.user.id, display_name: displayNameFromSession(session) })
  if (error) throw error
}

/** How an athlete (by default, the signed-in one) shoots the five metal discs. Anything unreadable is the
 *  default, alpha to echo, so a failed load never blocks the settings page. */
export async function getShootingDirection(athleteId?: string): Promise<ShootingDirection> {
  // A coach reads the athlete's row (policy: coach reads linked athletes).
  const id = athleteId ?? await currentUserId()
  const { data, error } = await supabase.from('athletes').select('shooting_direction').eq('id', id).maybeSingle()
  if (error) throw error
  return data?.shooting_direction === 'echo_to_alpha' ? 'echo_to_alpha' : 'alpha_to_echo'
}

export async function setShootingDirection(direction: ShootingDirection): Promise<void> {
  const id = await currentUserId()
  const { error } = await supabase.from('athletes').update({ shooting_direction: direction }).eq('id', id)
  if (error) throw error
}

export interface Athlete {
  id: string
  displayName: string
}

/** Null means this identity hasn't set up an athlete profile — a coach-only
 *  sign-in, most often — not an error. */
export async function getAthlete(userId: string): Promise<Athlete | null> {
  const { data, error } = await supabase.from('athletes').select('id, display_name').eq('id', userId).maybeSingle()
  if (error) throw error
  return data ? { id: data.id, displayName: data.display_name } : null
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await supabase.from('athletes').update({ display_name: displayName }).eq('id', userId)
  if (error) throw error
}
