import type { Session } from '@supabase/supabase-js'
import { DEV_MODE_KEY, supabase } from './supabase'

/**
 * Fires immediately with whatever session already exists (or null), then
 * again on every sign-in/sign-out/token-refresh. Callers don't need to call
 * getSession() themselves first.
 */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  void supabase.auth.getSession().then(({ data }) => cb(data.session))
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => cb(session))
  return () => sub.subscription.unsubscribe()
}

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}

export function signOut() {
  // Dev mode is tied to the tab, so leave it behind with the account.
  try { sessionStorage.removeItem(DEV_MODE_KEY) } catch { /* nothing to clear */ }
  return supabase.auth.signOut()
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
