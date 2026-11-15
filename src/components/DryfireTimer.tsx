import { useEffect, useRef, useState } from 'react'
import {
  IDLE_TIMER, elapsedMs, formatClock, loadTimer, minutesToLog, pauseTimer, saveTimer, startTimer,
  type TimerState,
} from '../lib/dryfireTimer'

/** A big stopwatch for a dry-fire session. It sticks to the top of the screen, so it stays in view
 *  while the athlete scrolls to notes or the sensor trainer. The minutes it times flow into the
 *  session's Minutes field as it runs, as changes on top of whatever the field holds, so the
 *  athlete can still edit the field freely. */
export function DryfireTimer({ workoutId, onMinutesChange }: { workoutId: string; onMinutesChange: (delta: number) => void }) {
  const [timer, setTimer] = useState<TimerState>(() => loadTimer(workoutId))
  const [now, setNow] = useState(() => Date.now())
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)

  const running = timer.runningSince !== null
  const ms = elapsedMs(timer, now)

  function apply(next: TimerState) {
    saveTimer(workoutId, next)
    setNow(Date.now())
    setTimer(next)
  }

  // Redraw four times a second while running; the value itself comes from timestamps.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [running])

  // Keep the screen awake while timing, where the browser allows it (HTTPS or localhost only).
  useEffect(() => {
    if (!running) return
    let cancelled = false
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const acquire = () => {
      nav.wakeLock?.request('screen').then((lock) => {
        if (cancelled) void lock.release()
        else wakeLock.current = lock
      }).catch(() => undefined)
    }
    acquire()
    // The browser drops the lock whenever the page is hidden; take it again on return.
    const onVisible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); acquire() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void wakeLock.current?.release().catch(() => undefined)
      wakeLock.current = null
    }
  }, [running])

  const minutes = minutesToLog(ms)
  const started = running || ms > 0

  // Put each newly timed minute into the session's Minutes field. Only the change is sent.
  const logged = useRef(timer.loggedMin)
  useEffect(() => {
    if (minutes === logged.current) return
    const delta = minutes - logged.current
    logged.current = minutes
    onMinutesChange(delta)
    setTimer((t) => {
      const next = { ...t, loggedMin: minutes }
      saveTimer(workoutId, next)
      return next
    })
  }, [minutes, onMinutesChange, workoutId])

  function reset() {
    // Discarding a run takes back the minutes it put in.
    if (logged.current > 0) onMinutesChange(-logged.current)
    logged.current = 0
    apply(IDLE_TIMER)
  }

  return (
    <div className={`dryfire-timer${running ? ' running' : ''}`} role="timer" aria-label="Dry-fire timer">
      <div className="dryfire-timer-label">{running ? 'Timing' : started ? 'Paused' : 'Timer'}</div>
      <div className="dryfire-timer-digits" aria-live="off">{formatClock(ms)}</div>

      {!started && (
        <button type="button" className="dryfire-timer-btn" onClick={() => apply(startTimer(timer, Date.now()))}>
          Start timer
        </button>
      )}
      {running && (
        <button type="button" className="dryfire-timer-btn" onClick={() => apply(pauseTimer(timer, Date.now()))}>
          Pause
        </button>
      )}
      {!running && started && (
        <div className="dryfire-timer-row">
          <button type="button" className="dryfire-timer-btn" onClick={() => apply(startTimer(timer, Date.now()))}>
            Resume
          </button>
          <button
            type="button" className="dryfire-timer-btn alt"
            onClick={() => { if (ms < 30_000 || confirm('Discard this timed run? Its minutes come out of the session.')) reset() }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  )
}
