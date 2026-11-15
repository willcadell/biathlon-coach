import { useEffect, useRef, useState } from 'react'
import { playCountIn, type CountInSound } from '../lib/beep'
import { stageSecondsFromTaps } from '../lib/nationalTest'
import { formatRangeTime } from '../lib/time'
import { COUNT_IN_SECONDS, TimerOptions, loadPrefs, savePrefs, type TimerPrefs } from './TimerOptions'

const tenths = (n: number) => Math.round(n * 10) / 10

/** The optional range time on a metal bout, timed the way the National Team test times a drill: a
 *  count-in with beeps so the athlete can get set, then the clock, then one tap as they leave the
 *  mat. The result lands in a box they can edit, or they can type a time in with no timing at all. */
export function RangeTimeField({
  value, onChange, onBusyChange,
}: {
  value: number | undefined
  onChange: (seconds: number | undefined) => void
  /** True from the count-in until the clock is stopped, so the form can hold off saving. */
  onBusyChange?: (busy: boolean) => void
}) {
  const goAt = useRef(0)
  const sound = useRef<CountInSound | null>(null)
  const [phase, setPhase] = useState<'ready' | 'counting' | 'running'>('ready')
  const [now, setNow] = useState(0)
  const [prefs, setPrefs] = useState<TimerPrefs>(loadPrefs)
  // The last timed run: what the clock showed, and the time it was cut to. Shown until the time is edited.
  const [lastRun, setLastRun] = useState<{ raw: number; net: number; allowance: number } | null>(null)

  const busyCb = useRef(onBusyChange)
  busyCb.current = onBusyChange
  useEffect(() => { busyCb.current?.(phase !== 'ready') }, [phase])

  useEffect(() => {
    if (phase === 'ready') return
    const id = setInterval(() => setNow(Date.now()), 50)
    return () => clearInterval(id)
  }, [phase])
  useEffect(() => { if (phase === 'counting' && now >= goAt.current) setPhase('running') }, [phase, now])
  useEffect(() => () => sound.current?.stop(), [])

  function changePrefs(next: TimerPrefs) {
    setPrefs(next)
    savePrefs(next)
  }
  function start() {
    sound.current?.stop()
    sound.current = prefs.sound ? playCountIn(COUNT_IN_SECONDS) : null
    goAt.current = Date.now() + COUNT_IN_SECONDS * 1000
    setNow(Date.now())
    setPhase('counting')
  }
  function stop() {
    const raw = tenths((Date.now() - goAt.current) / 1000)
    // The tap comes `allowance` seconds after the athlete left the mat.
    const net = stageSecondsFromTaps([raw], prefs.allowance)[0]
    onChange(net)
    setLastRun({ raw, net, allowance: prefs.allowance })
    setPhase('ready')
  }
  function cancel() {
    sound.current?.stop()
    sound.current = null
    setPhase('ready')
  }

  const elapsed = phase === 'running' ? Math.max(0, (now - goAt.current) / 1000) : 0
  const toGo = Math.max(1, Math.ceil((goAt.current - now) / 1000))

  return (
    <div className={`range-time${phase !== 'ready' ? ' running' : ''}`}>
      {phase === 'counting' && (
        <>
          <div key={toGo} className="count-in" aria-live="assertive">{toGo}</div>
          <p className="meta" style={{ textAlign: 'center', margin: 0 }}>Get set by the mat.</p>
          <button type="button" className="link" style={{ marginTop: 8 }} onClick={cancel}>Cancel</button>
        </>
      )}

      {phase === 'running' && (
        <>
          <p className={`clock-face${elapsed < 1 ? ' go-flash' : ''}`} aria-live="off" role="timer" aria-label="Range time">{elapsed.toFixed(1)}</p>
          <button type="button" className="range-time-btn" onClick={stop}>Off the mat — stop the clock</button>
          <button type="button" className="link" style={{ marginTop: 8 }} onClick={cancel}>Abandon this run</button>
          {prefs.allowance > 0 && <p className="meta" style={{ marginBottom: 0 }}>The tap takes {prefs.allowance.toFixed(1)} s off, for reaching the phone.</p>}
        </>
      )}

      {phase === 'ready' && (
        <>
          {lastRun && value !== undefined && Math.abs(value - lastRun.net) < 0.05 ? (
            <>
              {/* Clock minus phone access time equals the saved range time, so the cut is visible. */}
              <div className="range-calc" aria-label={`Clock ${lastRun.raw.toFixed(1)} seconds, minus ${tenths(lastRun.raw - lastRun.net).toFixed(1)} seconds phone access time, equals ${value.toFixed(1)} seconds`}>
                <div><small>Clock</small><span>{lastRun.raw.toFixed(1)} s</span></div>
                <div className="op">−</div>
                <div><small>Phone access</small><span>{tenths(lastRun.raw - lastRun.net).toFixed(1)} s</span></div>
                <div className="op">=</div>
                <div className="final"><small>Range time</small><span>{formatRangeTime(value)}</span></div>
              </div>
              <p className="meta" style={{ margin: '0 0 10px' }}>
                {lastRun.raw - lastRun.net > 0.05
                  ? 'The range time is shorter than the clock because the phone access time, to reach the phone to finish, is taken off.'
                  : 'No phone access time is taken off, so the range time is the clock time (set it in Timer settings).'}
              </p>
            </>
          ) : (
            <div className="range-time-digits" aria-label="Range time">{value ? formatRangeTime(value) : '—'}</div>
          )}
          <button type="button" className="range-time-btn" onClick={start}>{value ? 'Time it again' : 'Start timing'}</button>
          <label className="field" style={{ marginTop: 12, marginBottom: 0, textAlign: 'left' }}>
            <span>Range time, seconds<small>Set-up, shooting and exit, less any phone access time (Timer settings). Edit it if the tap was late, or type a time in.</small></span>
            <input
              type="number" inputMode="decimal" min={0} step={0.1} placeholder="—"
              aria-label="Range time in seconds"
              value={value ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value)
                onChange(e.target.value === '' || !(n > 0) ? undefined : tenths(n))
              }}
            />
          </label>
          <details style={{ marginTop: 10, textAlign: 'left' }}>
            <summary className="meta">Timer settings</summary>
            <div style={{ marginTop: 8 }}><TimerOptions prefs={prefs} onChange={changePrefs} /></div>
          </details>
        </>
      )}
    </div>
  )
}
