/** A dry-fire session's stopwatch. Kept as timestamps rather than a ticking counter, so it stays
 *  right when the phone screen locks, the tab is backgrounded, or the page is reloaded. */

export interface TimerState {
  /** Epoch ms the timer last started running; null while paused or never started. */
  runningSince: number | null
  /** Time banked from earlier runs, before the current one. */
  bankedMs: number
  /** Whole minutes this timer has already put into the session's Minutes field, so only the
   *  change is added as it runs, and an athlete's own edit to that field is never overwritten. */
  loggedMin: number
}

export const IDLE_TIMER: TimerState = { runningSince: null, bankedMs: 0, loggedMin: 0 }

export function elapsedMs(t: TimerState, now: number): number {
  return t.bankedMs + (t.runningSince === null ? 0 : Math.max(0, now - t.runningSince))
}

export const startTimer = (t: TimerState, now: number): TimerState =>
  t.runningSince === null ? { ...t, runningSince: now } : t

export const pauseTimer = (t: TimerState, now: number): TimerState =>
  t.runningSince === null ? t : { ...t, runningSince: null, bankedMs: elapsedMs(t, now) }

/** "7:05", or "1:02:09" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Whole minutes to log for a timed run: rounded, but never zero once at least 30 s has run. */
export function minutesToLog(ms: number): number {
  if (ms < 30_000) return 0
  return Math.max(1, Math.round(ms / 60_000))
}

const key = (workoutId: string) => `545.dryfireTimer.${workoutId}`

export function loadTimer(workoutId: string): TimerState {
  try {
    const raw = localStorage.getItem(key(workoutId))
    if (!raw) return IDLE_TIMER
    const p = JSON.parse(raw) as Partial<TimerState>
    return {
      runningSince: typeof p.runningSince === 'number' ? p.runningSince : null,
      bankedMs: typeof p.bankedMs === 'number' && p.bankedMs >= 0 ? p.bankedMs : 0,
      loggedMin: typeof p.loggedMin === 'number' && p.loggedMin >= 0 ? p.loggedMin : 0,
    }
  } catch {
    return IDLE_TIMER
  }
}

export function saveTimer(workoutId: string, t: TimerState): void {
  try {
    if (t.runningSince === null && t.bankedMs === 0 && t.loggedMin === 0) localStorage.removeItem(key(workoutId))
    else localStorage.setItem(key(workoutId), JSON.stringify(t))
  } catch {
    // Private mode or blocked storage: the timer still works, it just won't survive a reload.
  }
}
