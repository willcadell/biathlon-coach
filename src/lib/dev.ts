import { DEV_MODE_KEY, devModeOn, supabase } from './supabase'

export { devModeOn }

/** Whether this account may use dev mode — granted in Supabase (the dev_users
 *  table), never from the app. */
export async function amDev(): Promise<boolean> {
  const { data, error } = await supabase.rpc('i_am_dev')
  if (error) throw error
  return data === true
}

/** Enter or leave dev mode. Reloads, so nothing loaded under the other mode
 *  (real workouts, or test ones) is left on screen. */
export function setDevMode(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(DEV_MODE_KEY, '1')
    else sessionStorage.removeItem(DEV_MODE_KEY)
    // An unfinished workout belongs to the mode it was started in and can't be
    // seen from the other one.
    localStorage.removeItem('biathlon-coach:active-workout')
  } catch {
    // Without storage the switch can't hold, so don't pretend it did.
    return
  }
  window.location.reload()
}

/** Turn one of your test workouts into a live one, with its bouts and click
 *  log. Only works from dev mode, on your own test workouts. */
export async function makeWorkoutLive(workoutId: string): Promise<void> {
  const { error } = await supabase.rpc('make_workout_live', { p_workout_id: workoutId })
  if (error) throw error
}
