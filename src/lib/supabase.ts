import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check .env.local')
}

/** Dev mode is per browser tab, like the athlete/coach choice: it must not
 *  survive closing the tab, or a forgotten switch would quietly turn a real
 *  training session into test data. */
export const DEV_MODE_KEY = 'biathlon-coach:dev-mode'

export function devModeOn(): boolean {
  try {
    return sessionStorage.getItem(DEV_MODE_KEY) === '1'
  } catch {
    return false
  }
}

/** Tells the database which mode each data request is in. The server only
 *  honours it for accounts listed in dev_users, so it can't be used to
 *  reach test data by anyone else. */
const modeAwareFetch: typeof fetch = (input, init) => {
  const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!devModeOn() || !requestUrl.includes('/rest/v1/')) return fetch(input, init)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  headers.set('x-dev-mode', '1')
  return fetch(input, { ...init, headers })
}

export const supabase = createClient(url, anonKey, { global: { fetch: modeAwareFetch } })
