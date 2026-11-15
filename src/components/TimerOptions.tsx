/** The count-in and phone allowance shared by every phone-timed measure: the National Team test
 *  drills and a metal bout's range time. */

/** Beeps and a count on screen before the clock starts, so the athlete can get behind the pylon. */
export const COUNT_IN_SECONDS = 5
/** Seconds that can be taken off each tap, for an athlete alone who has to reach the phone. */
export const ALLOWANCES = [0, 1, 2, 3]
const PREFS_KEY = 'biathlon-coach:test-timer'

export interface TimerPrefs { sound: boolean; allowance: number }

/** A per-device convenience, so it is kept in the browser and the timer works without it. */
export function loadPrefs(): TimerPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<TimerPrefs>
    return { sound: p.sound !== false, allowance: ALLOWANCES.includes(p.allowance as number) ? (p.allowance as number) : 0 }
  } catch {
    return { sound: true, allowance: 0 }
  }
}
export function savePrefs(p: TimerPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* the timer still works */ }
}

/** The count-in sound and the time allowed to reach the phone, shared by every timer. */
export function TimerOptions({ prefs, onChange }: { prefs: TimerPrefs; onChange: (next: TimerPrefs) => void }) {
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={prefs.sound} onChange={(e) => onChange({ ...prefs, sound: e.target.checked })} />
        Beep the {COUNT_IN_SECONDS}-second count-in
      </label>
      <label className="field">
        <span>Time to reach phone to finish</span>
        <div className="seg">
          {ALLOWANCES.map((a) => (
            <button key={a} aria-pressed={prefs.allowance === a} onClick={() => onChange({ ...prefs, allowance: a })}>
              {a === 0 ? 'None' : `${a} s`}
            </button>
          ))}
        </div>
      </label>
    </>
  )
}
