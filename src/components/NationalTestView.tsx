import { useEffect, useRef, useState } from 'react'
import type { Bout, MetalTarget, NationalTest, NationalTestStage, PendingTarget, Position, Settings, Workout } from '../lib/types'
import {
  ACROSS_BASELINE_SECONDS, ACROSS_STAGES, COMPONENT_MAX, FIRST_SHOT_BASELINE, FIRST_SHOT_HITS, PRECISION_MINUTES, REST_MINUTES, SHOTS_PER_ACROSS_STAGE,
  STAGE_LABEL, STANDARD_A, STANDARD_B, TOTAL_MAX, PART_ORDER, acrossScore, clock, precisionBouts, scoreNationalTest, stageSecondsFromTaps, testBouts, testParts,
  type PartId, type PartState,
} from '../lib/nationalTest'
import { errorMessage } from '../lib/errors'
import { playCountIn, type CountInSound } from '../lib/beep'
import { allMissed, METAL_TARGETS } from '../lib/metal'
import { CaptureView } from './CaptureView'
import { GoArrow, TrashIcon } from './icons'

const POSITION_LABEL: Record<Position, string> = { prone: 'Prone', standing: 'Standing' }

/** Points and times for a National Team Test, done or part-done. Used while it is being shot and
 *  again when the workout is opened in History. Each component scores as soon as it is done. */
export function NationalTestSummary({ bouts, test }: { bouts: Bout[]; test: Pick<NationalTest, 'stages'> & Partial<Pick<NationalTest, 'proneBoutId' | 'standingBoutId' | 'finishedAt'>> }) {
  const s = scoreNationalTest(bouts, test)
  const groups = precisionBouts(bouts)
  const acrossDone = !s.missing.includes('4x5 across')
  const row = (label: string, value: string, note?: string) => (
    <div className="row" style={{ alignItems: 'baseline' }}>
      <span style={{ flex: 1 }}>{label}{note && <small className="meta" style={{ display: 'block' }}>{note}</small>}</span>
      <strong className="num" style={{ flex: 'none' }}>{value}</strong>
    </div>
  )
  const precisionNote = (['prone', 'standing'] as Position[])
    .map((p) => {
      const b = groups[p]
      if (b) return `${POSITION_LABEL[p]} ${b.metrics.ringTotal}`
      const shot = p === 'prone' ? test.proneBoutId : test.standingBoutId
      return `${POSITION_LABEL[p]} ${shot ? 'shot, target not photographed' : 'not shot'}`
    })
    .join(' · ')
  const acrossNote = acrossDone
    ? `${s.acrossHits} of ${ACROSS_STAGES.length * SHOTS_PER_ACROSS_STAGE} hit · ${clock(s.acrossSeconds)} (perfect is ${clock(ACROSS_BASELINE_SECONDS)})`
    : 'Not done'
  const firstShotNote = (['prone', 'standing'] as Position[])
    .map((p) => {
      const t = s.firstShotSeconds[p]
      return t === null ? `${POSITION_LABEL[p]} not done` : `${POSITION_LABEL[p]} ${clock(t)} (baseline ${clock(FIRST_SHOT_BASELINE[p])})`
    })
    .join(' · ')
  const anyFirstShot = s.firstShotSeconds.prone !== null || s.firstShotSeconds.standing !== null
  const partial = !!test.finishedAt && s.missing.length > 0
  return (
    <div className="card">
      {s.standard
        ? <p><span className="pill">{s.standard}-standard</span> <strong className="num">{s.total}</strong> of {TOTAL_MAX}</p>
        : partial
          ? <p><span className="pill">Partial</span> <strong className="num">{s.total}</strong> of {TOTAL_MAX}<span className="meta"> · not done: {s.missing.join(', ')}</span></p>
          : <p><strong className="num">{s.total}</strong> of {TOTAL_MAX}{s.missing.length > 0 && <span className="meta"> so far · still to do: {s.missing.join(', ')}</span>}</p>}
      {row('Precision', `${s.precision} / ${COMPONENT_MAX}`, precisionNote)}
      {row('4x5 across', acrossDone ? `${s.across} / ${COMPONENT_MAX}` : '—', acrossNote)}
      {row('First-shot set-up', anyFirstShot ? `${s.firstShot} / ${COMPONENT_MAX}` : '—', firstShotNote)}
      <p className="meta" style={{ marginBottom: 0 }}>
        {partial
          ? 'A partial score: it adds up the components done. No standard is given.'
          : `A-standard is ${STANDARD_A}, B-standard ${STANDARD_B}.`}
      </p>
    </div>
  )
}

/** The test as it sits among a session's entries: how far it is, and a way back in. */
export function NationalTestCard({ test, bouts, onOpen }: { test: NationalTest; bouts: Bout[]; onOpen: () => void }) {
  const s = scoreNationalTest(testBouts(test, bouts), test)
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <strong>National Team Test</strong>
      <p className="meta" style={{ margin: '4px 0 10px' }}>
        {s.missing.length === 0
          ? <>{s.standard ? `${s.standard}-standard · ` : ''}{s.total} of {TOTAL_MAX}</>
          : test.finishedAt
            ? <>Partial · {s.total} of {TOTAL_MAX} · not done: {s.missing.join(', ')}</>
            : <>In progress · still to shoot: {s.missing.join(', ')}</>}
      </p>
      <button className="secondary" style={{ width: '100%' }} onClick={onOpen}>{s.missing.length === 0 || test.finishedAt ? 'View' : 'Continue'}</button>
    </div>
  )
}

const DRILL_BRIEF: Record<'across' | 'firstShot', string> = {
  across:
    'Start standing next to the cone, 2 m from the shooting line. On Go, take prone and fire one shot at each of the five targets. Leave the position with the rifle on your back, move behind the 2 m marker with both feet, and return for the next five. Two rounds prone, then two standing. To finish, move behind the 2 m marker with the rifle on your back. One clock runs the whole way; tap each time you are behind the marker.',
  firstShot:
    'Start off the mat, next to the cone, 2 m from the shooting line. On Go, step on the mat, set up, shoot one shot, and exit the mat with the rifle on your back, behind the 2 m marker, for each shot. Keep going until you have five hits; the clock stops on the fifth. Then rest, and repeat standing.',
}

/** Beeps and a count on screen before the clock starts, so the athlete can get behind the pylon. */
const COUNT_IN_SECONDS = 5
/** Seconds that can be taken off each tap, for an athlete alone who has to reach the phone. */
const ALLOWANCES = [0, 1, 2, 3]
const PREFS_KEY = 'biathlon-coach:test-timer'

interface TimerPrefs { sound: boolean; allowance: number }

/** A per-device convenience, so it is kept in the browser and the timer works without it. */
function loadPrefs(): TimerPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<TimerPrefs>
    return { sound: p.sound !== false, allowance: ALLOWANCES.includes(p.allowance as number) ? (p.allowance as number) : 0 }
  } catch {
    return { sound: true, allowance: 0 }
  }
}
function savePrefs(p: TimerPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* the timer still works */ }
}

/** The count-in sound and the time allowed to reach the phone, shared by every timer. */
function TimerOptions({ prefs, onChange }: { prefs: TimerPrefs; onChange: (next: TimerPrefs) => void }) {
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={prefs.sound} onChange={(e) => onChange({ ...prefs, sound: e.target.checked })} />
        Beep the {COUNT_IN_SECONDS}-second count-in
      </label>
      <label className="field">
        <span>Time to reach the phone</span>
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

/** The five targets of a stage, as on a metal bout: black until it falls, white once hit.
 *  Tappable while the stage is being scored; a stage that is done is outlined in green. */
function TargetRow<K extends string | number>({
  hits, onChange, done, labels,
}: {
  hits: Record<K, boolean> | boolean[]
  onChange?: (hits: Record<K, boolean> & boolean[]) => void
  done?: boolean
  /** Under each circle. The five metal targets by default. */
  labels?: string[]
}) {
  const edge = done ? 'var(--good)' : 'var(--series-1)'
  const keys = (Array.isArray(hits) ? hits.map((_, i) => i) : METAL_TARGETS) as K[]
  const names = labels ?? (keys as string[])
  const get = (k: K) => (hits as Record<K, boolean>)[k]
  const toggle = (k: K) => {
    if (Array.isArray(hits)) onChange?.(hits.map((h, i) => (i === (k as number) ? !h : h)) as Record<K, boolean> & boolean[])
    else onChange?.({ ...hits, [k]: !get(k) } as Record<K, boolean> & boolean[])
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
      {keys.map((t, n) => (
        <button
          key={String(t)} type="button" disabled={!onChange} aria-pressed={get(t)} aria-label={`${names[n]} ${get(t) ? 'hit' : 'not hit'}`}
          onClick={() => toggle(t)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 0, padding: '2px 0', cursor: onChange ? 'pointer' : 'default' }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 34, height: 34, borderRadius: '50%', boxSizing: 'border-box',
              background: get(t) ? 'var(--raised)' : 'var(--series-1)', border: `3px solid ${edge}`,
            }}
          />
          <span className="meta" style={{ textTransform: 'capitalize', fontSize: 11 }}>{names[n]}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The 4x5 across: four lines, prone, prone, standing, standing, each with its five targets, all on
 * ONE clock. Start (after the count-in), tap each time you are back behind the 2 m marker, and the
 * final tap stops the clock. Then tap the targets that fell on each line and confirm: the lines
 * turn green. The four stages are saved together; their times are the splits of the one clock.
 */
function AcrossDrill({
  saved, onSaved, onRestart,
}: {
  /** The 4x5 stages saved so far: all four once the component is done. */
  saved: NationalTestStage[]
  onSaved: (stages: NationalTestStage[]) => void
  /** Throws away the saved 4x5, so it can be shot again. */
  onRestart: () => void
}) {
  const goAt = useRef(0)
  const sound = useRef<CountInSound | null>(null)
  const [phase, setPhase] = useState<'ready' | 'counting' | 'running' | 'scoring'>('ready')
  const [now, setNow] = useState(0)
  const [prefs, setPrefs] = useState(loadPrefs)
  // Seconds on the one clock at each tap, before the allowance comes off.
  const [taps, setTaps] = useState<number[]>([])
  const [total, setTotal] = useState('')
  const [targets, setTargets] = useState<Record<MetalTarget, boolean>[]>(() => ACROSS_STAGES.map(() => allMissed()))

  const finished = saved.length >= ACROSS_STAGES.length

  useEffect(() => {
    if (phase !== 'counting' && phase !== 'running') return
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
    setTaps([])
    setPhase('counting')
  }
  function lap() {
    const t = Math.round(((Date.now() - goAt.current) / 1000) * 10) / 10
    const next = [...taps, t]
    setTaps(next)
    if (next.length === ACROSS_STAGES.length) {
      setTotal(stageSecondsFromTaps(next, prefs.allowance).reduce((a, b) => a + b, 0).toFixed(1))
      setTargets(ACROSS_STAGES.map(() => allMissed()))
      setPhase('scoring')
    }
  }
  function reset() {
    sound.current?.stop()
    sound.current = null
    setPhase('ready')
    setTaps([])
  }

  // Each stage's time on the one clock, with the allowance off.
  const splits = stageSecondsFromTaps(taps, prefs.allowance)
  const elapsed = phase === 'running' ? Math.max(0, (now - goAt.current) / 1000) : 0
  const toGo = Math.max(1, Math.ceil((goAt.current - now) / 1000))
  const totalSeconds = Number(total)
  const timeOk = Number.isFinite(totalSeconds) && totalSeconds > 0
  const hitsOf = (i: number) => METAL_TARGETS.filter((t) => targets[i][t]).length
  const hits = ACROSS_STAGES.reduce((t, _, i) => t + hitsOf(i), 0)
  const stage = taps.length

  function confirmIt() {
    // Splits that add to the total as entered: if it was edited, the last stage takes the difference.
    const parts = [...splits]
    const diff = Math.round((totalSeconds - parts.reduce((a, b) => a + b, 0)) * 10) / 10
    parts[parts.length - 1] = Math.max(0.1, Math.round((parts[parts.length - 1] + diff) * 10) / 10)
    let at = goAt.current
    onSaved(ACROSS_STAGES.map((position, i) => {
      const startedAt = new Date(at).toISOString()
      at += parts[i] * 1000
      return { kind: 'across' as const, position, seconds: parts[i], hits: hitsOf(i), targets: targets[i], startedAt, endedAt: new Date(at).toISOString() }
    }))
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{STAGE_LABEL.across}</h2>

      {!finished && (
        <>
          {phase === 'counting'
            ? <><div key={toGo} className="count-in" aria-live="assertive">{toGo}</div><p className="meta" style={{ textAlign: 'center', margin: 0 }}>Get ready by the cone.</p></>
            : <p className={`clock-face${phase === 'running' && elapsed < 1 ? ' go-flash' : ''}`} aria-live="off">
                {phase === 'scoring' ? (timeOk ? totalSeconds.toFixed(1) : '—') : elapsed.toFixed(1)}
              </p>}

          {phase === 'ready' && <button className="primary" style={{ width: '100%', padding: '18px 0', fontSize: 17 }} onClick={start}>Start the 4x5</button>}
          {phase === 'counting' && <button className="link" style={{ marginTop: 8 }} onClick={reset}>Cancel</button>}
          {phase === 'running' && (
            <button className="primary" style={{ width: '100%', padding: '22px 0', fontSize: 18 }} onClick={lap}>
              {stage + 1 === ACROSS_STAGES.length
                ? `Finish — stage 4 of 4 · ${POSITION_LABEL[ACROSS_STAGES[stage]]}`
                : `Behind the marker — stage ${stage + 1} of 4 · ${POSITION_LABEL[ACROSS_STAGES[stage]]}`}
            </button>
          )}
          {phase === 'running' && <button className="link" style={{ marginTop: 8 }} onClick={reset}>Abandon this run</button>}
          {phase === 'running' && prefs.allowance > 0 && (
            <p className="meta" style={{ marginBottom: 0 }}>Each tap takes {prefs.allowance.toFixed(1)} s off, for reaching the phone.</p>
          )}
          {phase === 'scoring' && (
            <>
              <label className="field">
                <span>Total time, seconds<small>All four stages on the one clock. Edit it if the last tap was late.</small></span>
                <input type="number" inputMode="decimal" min={0} step={0.1} aria-label="4x5 total seconds" value={total} onChange={(e) => setTotal(e.target.value)} />
              </label>
              <p className="meta" style={{ marginTop: 0 }}>
                Tap the targets that fell on each line. {hits} of 20 hit
                {timeOk && ` · scores ${acrossScore(hits, totalSeconds)} of ${COMPONENT_MAX}`}.
              </p>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 14 }}>
        {ACROSS_STAGES.map((pos, i) => {
          const done = finished ? saved[i] : null
          const split = finished ? saved[i].seconds : splits[i]
          const reached = finished || i < taps.length
          const scoringNow = !finished && phase === 'scoring'
          const active = !finished && phase === 'running' && i === stage
          const rowHits = done ? (done.targets ?? scatterHits(done.hits)) : targets[i]
          const complete = !!done
          return (
            <div
              key={i}
              style={{
                padding: '8px 10px', margin: '0 0 8px', borderRadius: 10, boxSizing: 'border-box',
                border: `2px solid ${complete ? 'var(--good)' : active || scoringNow || reached ? 'var(--series-1)' : 'var(--grid)'}`,
                background: complete ? 'var(--good-wash)' : 'transparent',
                opacity: complete || active || scoringNow || reached ? 1 : 0.6,
              }}
            >
              <div className="row" style={{ alignItems: 'baseline', marginBottom: 6 }}>
                <strong style={{ flex: 1 }}>{complete ? '✓ ' : ''}{i + 1} · {POSITION_LABEL[pos]}</strong>
                {reached && split !== undefined && <span className="num" style={{ flex: 'none' }}>{split.toFixed(1)} s{complete ? ` · ${done!.hits}/${SHOTS_PER_ACROSS_STAGE}` : ''}</span>}
              </div>
              <TargetRow
                hits={rowHits} done={complete}
                onChange={scoringNow ? (next) => setTargets((prev) => prev.map((t, j) => (j === i ? next : t))) : undefined}
              />
            </div>
          )
        })}
      </div>

      {phase === 'scoring' && (
        <>
          <button className="primary" style={{ width: '100%', padding: '18px 0', fontSize: 17 }} disabled={!timeOk} onClick={confirmIt}>Confirm the 4x5</button>
          <button className="link" style={{ marginTop: 8 }} onClick={reset}>Re-run the 4x5</button>
        </>
      )}
      {saved.length > 0 && (finished || phase === 'ready') && (
        <button
          className="link danger" style={{ display: 'block', marginTop: 4 }}
          onClick={() => { if (confirm('Scrub the 4x5 and start again? Its times and hits are deleted.')) onRestart() }}
        >
          Scrub the 4x5 and start again
        </button>
      )}

      {!finished && phase === 'ready' && (
        <>
          <p className="meta" style={{ marginTop: 12 }}>{DRILL_BRIEF.across}</p>
          <details>
            <summary className="meta">Timer options</summary>
            <TimerOptions prefs={prefs} onChange={changePrefs} />
          </details>
        </>
      )}
    </div>
  )
}

/** For a stage saved with only a count: that many targets shown as hit, left to right. */
function scatterHits(count: number): Record<MetalTarget, boolean> {
  return Object.fromEntries(METAL_TARGETS.map((t, i) => [t, i < count])) as Record<MetalTarget, boolean>
}

/**
 * One position of the first-shot set-up: shoot single shots, off the mat and back each time, until
 * five hits, and the clock stops on the fifth. So there is one start and one stop, and no tap per
 * shot; the time to the fifth hit is what is scored. The number of shots fired is optional.
 */
function FirstShotRun({
  position, saved, prefs, blocked, onBusy, onSaved, onScrub,
}: {
  position: Position
  saved: NationalTestStage | null
  prefs: TimerPrefs
  /** The other position is mid-run. */
  blocked: boolean
  onBusy: (busy: boolean) => void
  onSaved: (stage: NationalTestStage) => void
  onScrub: () => void
}) {
  const goAt = useRef(0)
  const times = useRef<{ startedAt?: string; endedAt?: string }>({})
  const sound = useRef<CountInSound | null>(null)
  const [phase, setPhase] = useState<'ready' | 'counting' | 'running' | 'scoring'>('ready')
  const [now, setNow] = useState(0)
  const [time, setTime] = useState('')
  const [shots, setShots] = useState('')

  useEffect(() => {
    if (phase !== 'counting' && phase !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 50)
    return () => clearInterval(id)
  }, [phase])
  useEffect(() => { if (phase === 'counting' && now >= goAt.current) setPhase('running') }, [phase, now])
  useEffect(() => { onBusy(phase !== 'ready') }, [phase, onBusy])
  useEffect(() => () => sound.current?.stop(), [])

  function start() {
    sound.current?.stop()
    sound.current = prefs.sound ? playCountIn(COUNT_IN_SECONDS) : null
    goAt.current = Date.now() + COUNT_IN_SECONDS * 1000
    setNow(Date.now())
    setPhase('counting')
  }
  function stop() {
    const raw = Math.round(((Date.now() - goAt.current) / 1000) * 10) / 10
    // The clock stopped on the fifth hit, `allowance` seconds before the tap.
    times.current = { startedAt: new Date(goAt.current).toISOString(), endedAt: new Date(Date.now() - prefs.allowance * 1000).toISOString() }
    setTime(String(stageSecondsFromTaps([raw], prefs.allowance)[0]))
    setShots('')
    setPhase('scoring')
  }
  function reset() {
    sound.current?.stop()
    sound.current = null
    setPhase('ready')
  }

  const elapsed = phase === 'running' ? Math.max(0, (now - goAt.current) / 1000) : 0
  const toGo = Math.max(1, Math.ceil((goAt.current - now) / 1000))
  const seconds = Number(time)
  const timeOk = Number.isFinite(seconds) && seconds > 0
  const baseline = FIRST_SHOT_BASELINE[position]
  const border = saved ? 'var(--good)' : phase === 'ready' ? 'var(--grid)' : 'var(--series-1)'

  return (
    <div style={{ padding: '10px 12px', margin: '0 0 10px', borderRadius: 10, border: `2px solid ${border}`, background: saved ? 'var(--good-wash)' : 'transparent', opacity: blocked && phase === 'ready' && !saved ? 0.6 : 1 }}>
      <strong>{saved ? '✓ ' : ''}{POSITION_LABEL[position]}</strong>

      {saved && (
        <>
          <p className="meta" style={{ margin: '4px 0 0' }}>
            {saved.seconds.toFixed(1)} s to the fifth hit · scores {Math.round((baseline - saved.seconds) * 100) / 100} ({clock(baseline)} baseline){saved.shots ? ` · ${saved.shots} shots fired` : ''}
          </p>
          <button
            className="link danger" style={{ marginTop: 6 }}
            onClick={() => { if (confirm(`Scrub the ${position} run and start it again? Its time is deleted.`)) onScrub() }}
          >
            Scrub the {position} run and start again
          </button>
        </>
      )}

      {!saved && (
        <>
          {phase === 'counting'
            ? <><div key={toGo} className="count-in" aria-live="assertive">{toGo}</div><p className="meta" style={{ textAlign: 'center', margin: 0 }}>Get ready by the cone.</p></>
            : (phase === 'running' || phase === 'scoring') && (
                <p className={`clock-face${phase === 'running' && elapsed < 1 ? ' go-flash' : ''}`} aria-live="off">
                  {phase === 'scoring' ? (timeOk ? seconds.toFixed(1) : '—') : elapsed.toFixed(1)}
                </p>
              )}

          {phase === 'ready' && (
            <button className="primary" style={{ width: '100%', marginTop: 8, padding: '16px 0' }} disabled={blocked} onClick={start}>Start {position}</button>
          )}
          {phase === 'counting' && <button className="link" style={{ marginTop: 8 }} onClick={reset}>Cancel</button>}
          {phase === 'running' && (
            <>
              <button className="primary" style={{ width: '100%', padding: '22px 0', fontSize: 18 }} onClick={stop}>Fifth hit — stop the clock</button>
              <button className="link" style={{ marginTop: 8 }} onClick={reset}>Abandon this run</button>
              {prefs.allowance > 0 && <p className="meta" style={{ marginBottom: 0 }}>The tap takes {prefs.allowance.toFixed(1)} s off, for reaching the phone.</p>}
            </>
          )}
          {phase === 'scoring' && (
            <>
              <label className="field">
                <span>Time to the fifth hit, seconds<small>Edit it if the tap was late.</small></span>
                <input type="number" inputMode="decimal" min={0} step={0.1} aria-label={`${position} seconds`} value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
              <label className="field">
                <span>Shots fired<small>Optional. It is not scored.</small></span>
                <input type="number" inputMode="numeric" min={FIRST_SHOT_HITS} step={1} placeholder="—" aria-label={`${position} shots fired`} value={shots} onChange={(e) => setShots(e.target.value)} />
              </label>
              {timeOk && <p className="meta" style={{ marginTop: 0 }}>Scores {Math.round((baseline - seconds) * 100) / 100} ({clock(baseline)} baseline minus the time).</p>}
              <button
                className="primary" style={{ width: '100%', padding: '16px 0' }} disabled={!timeOk}
                onClick={() => onSaved({ kind: 'firstShot', position, seconds, hits: FIRST_SHOT_HITS, ...(Number(shots) >= FIRST_SHOT_HITS ? { shots: Math.round(Number(shots)) } : {}), ...times.current })}
              >
                Confirm {position}
              </button>
              <button className="link" style={{ marginTop: 8 }} onClick={reset}>Re-run {position}</button>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** The first-shot set-up: a run each for prone and standing, with their own start and stop. */
function FirstShotPart({
  stages, onSaved, onScrub,
}: {
  stages: NationalTestStage[]
  onSaved: (stage: NationalTestStage) => void
  onScrub: (position: Position) => void
}) {
  const [prefs, setPrefs] = useState(loadPrefs)
  const [busy, setBusy] = useState<Record<Position, boolean>>({ prone: false, standing: false })
  const found = (p: Position) => stages.filter((x) => x.kind === 'firstShot' && x.position === p).pop() ?? null
  function changePrefs(next: TimerPrefs) {
    setPrefs(next)
    savePrefs(next)
  }
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{STAGE_LABEL.firstShot}</h2>
      <p className="meta">{DRILL_BRIEF.firstShot}</p>
      <p className="meta">Rest at least {REST_MINUTES} minutes between the prone and standing runs.</p>
      {(['prone', 'standing'] as Position[]).map((p) => (
        <FirstShotRun
          key={p} position={p} saved={found(p)} prefs={prefs}
          blocked={busy[p === 'prone' ? 'standing' : 'prone']}
          onBusy={(b) => setBusy((prev) => (prev[p] === b ? prev : { ...prev, [p]: b }))}
          onSaved={onSaved} onScrub={() => onScrub(p)}
        />
      ))}
      <details>
        <summary className="meta">Timer options</summary>
        <TimerOptions prefs={prefs} onChange={changePrefs} />
      </details>
    </div>
  )
}

interface Props {
  settings: Settings
  workout: Workout
  test: NationalTest
  /** All of this workout's precision bouts; only the test's own two count. */
  bouts: Bout[]
  /** This workout's targets that are shot and waiting for a photo. */
  pendingTargets: PendingTarget[]
  /** Records that a group has been shot, before its target can be collected. */
  onMarkPending: (position: Position) => Promise<PendingTarget>
  onTestChanged: (test: NationalTest) => void
  onDataChanged: () => void
  /** Leave the test for the session, keeping what is shot so far. */
  onBack: () => void
  onCancel: () => void
}

const PART_TITLE: Record<PartId, string> = {
  prone: 'Prone precision',
  standing: 'Standing precision',
  across: '4x5 across',
  firstShot: 'First-shot set-up',
  collect: 'Collect and photograph the targets',
}
const PART_BLURB: Record<PartId, string> = {
  prone: 'Ten one-shots on precision target.',
  standing: 'Ten one-shots on precision target.',
  across: 'Four rounds on one clock: prone, prone, stand, stand.',
  firstShot: 'Set up, shoot, exit the mat, repeat until five hits. Prone, then standing, timed to the fifth hit.',
  collect: 'Once all the shooting is done and the range is closed.',
}

/**
 * The National Team test, in parts the athlete can do in any order, each from its own
 * button, which turns green once it is done. The range is open for all of the shooting, so
 * the paper targets are collected and photographed last, once the range is closed. What is
 * done is read from what has been saved, so closing the app mid-test picks up where it left off.
 */
export function NationalTestView({
  settings, workout, test, bouts: workoutBouts, pendingTargets, onMarkPending, onTestChanged, onDataChanged, onBack, onCancel,
}: Props) {
  const bouts = testBouts(test, workoutBouts)
  // The part open now; none is the list of parts.
  const [part, setPart] = useState<PartId | null>(null)
  // The target being photographed, if any.
  const [collecting, setCollecting] = useState<PendingTarget | null>(null)
  // Held in memory only: after a reload the closed-range check is asked again.
  const [rangeClosed, setRangeClosed] = useState(false)
  const [marking, setMarking] = useState(false)
  const [error, setError] = useState('')

  const states = testParts(bouts, test)
  // A finished part goes back to the list, unless the athlete opened it to look.
  const opened = useRef<PartState | null>(null)
  useEffect(() => {
    if (part && opened.current !== 'done' && states[part] === 'done') setPart(null)
  }, [part, states])

  if (collecting) {
    return (
      <CaptureView
        settings={settings} workout={workout} fixedPosition={collecting.position} pending={collecting}
        onSaved={onDataChanged} onExit={() => setCollecting(null)}
      />
    )
  }

  function open(id: PartId) {
    opened.current = states[id]
    setPart(id)
  }

  async function markShot(position: Position) {
    setError('')
    setMarking(true)
    try {
      const pending = await onMarkPending(position)
      onTestChanged({ ...test, ...(position === 'prone' ? { proneBoutId: pending.id } : { standingBoutId: pending.id }) })
    } catch (e) {
      setError(errorMessage(e, 'Could not record the group. Check your connection and try again.'))
    } finally {
      setMarking(false)
    }
  }

  /** The target waiting for this position's photo — rebuilt from the test if the row is gone. */
  function targetFor(position: Position): PendingTarget {
    const id = position === 'prone' ? test.proneBoutId : test.standingBoutId
    return pendingTargets.find((p) => p.id === id) ?? { id: id as string, workoutId: workout.id, shotAt: new Date().toISOString(), position }
  }

  function partButtonNote(id: PartId): string {
    const st = states[id]
    if (st === 'locked') return 'Locked until the other four parts are shot, or the test is finished'
    if (id === 'prone' || id === 'standing') {
      return st === 'done' ? 'Shot — target to collect at the end' : PART_BLURB[id]
    }
    if (id === 'across') return st === 'done' ? 'Done' : PART_BLURB[id]
    if (id === 'firstShot') {
      const ran = (['prone', 'standing'] as Position[]).filter((p) => test.stages.some((x) => x.kind === 'firstShot' && x.position === p))
      return st === 'done' ? 'Prone and standing done' : ran.length === 1 ? `${POSITION_LABEL[ran[0]]} done, ${ran[0] === 'prone' ? 'standing' : 'prone'} to do` : PART_BLURB[id]
    }
    return st === 'done' ? 'Both targets photographed' : st === 'partial' ? 'One target photographed' : 'The range is closed: go and get them'
  }

  const back = (
    <button className="link" style={{ marginBottom: 8 }} onClick={() => setPart(null)}>← Back to the parts of the test</button>
  )

  if (part) {
    const position = part === 'prone' || part === 'standing' ? part : null
    return (
      <>
        {back}
        {error && <div className="notice error">{error}</div>}

        {position && states[part] === 'done' && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>{PART_TITLE[part]}</h2>
            <p className="meta" style={{ marginBottom: 0 }}>This group is shot. Its target waits, where it is, until the range is closed and you collect and photograph it with the others.</p>
          </div>
        )}
        {position && states[part] !== 'done' && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>{PART_TITLE[part]}</h2>
            <p className="meta">
              Ten shots on an ISSF 50 m target. You have up to {PRECISION_MINUTES} minutes for both groups, and a coach may spot your shots for you.
              Rest at least {REST_MINUTES} minutes before the next component.
            </p>
            <p className="meta">
              The range is open while you shoot, so the target stays where it is. You will collect and photograph both
              targets at the end, once the range is closed.
            </p>
            <button className="primary" style={{ width: '100%' }} disabled={marking} onClick={() => void markShot(position)}>
              {marking ? 'Saving…' : `Ten ${position} shots fired`}
            </button>
          </div>
        )}

        {part === 'across' && (
          <AcrossDrill
            saved={test.stages.filter((x) => x.kind === 'across')}
            onSaved={(stages) => onTestChanged({ ...test, stages: [...test.stages.filter((x) => x.kind !== 'across'), ...stages] })}
            onRestart={() => { opened.current = 'todo'; onTestChanged({ ...test, stages: test.stages.filter((x) => x.kind !== 'across') }) }}
          />
        )}

        {part === 'firstShot' && (
          <FirstShotPart
            stages={test.stages}
            onSaved={(stage) => onTestChanged({ ...test, stages: [...test.stages.filter((x) => !(x.kind === 'firstShot' && x.position === stage.position)), stage] })}
            onScrub={(p) => { opened.current = 'todo'; onTestChanged({ ...test, stages: test.stages.filter((x) => !(x.kind === 'firstShot' && x.position === p)) }) }}
          />
        )}

        {part === 'collect' && !rangeClosed && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>All the shooting is done</h2>
            <p className="meta">
              Make sure the range is closed and safe before anyone goes downrange. Then collect your two targets
              and photograph them here.
            </p>
            <button className="primary" style={{ width: '100%' }} onClick={() => setRangeClosed(true)}>The range is closed — collect my targets</button>
          </div>
        )}
        {part === 'collect' && rangeClosed && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Photograph the targets</h2>
            <p className="meta">The range is closed. Collect each target and photograph it square-on.</p>
            {(['prone', 'standing'] as Position[]).map((p) => {
              const photographed = precisionBouts(bouts)[p]
              const wasShot = !!(p === 'prone' ? test.proneBoutId : test.standingBoutId)
              if (!wasShot) return <div key={p} className="meta" style={{ padding: '6px 0' }}>{POSITION_LABEL[p]} was not shot, so there is no target to collect</div>
              return photographed
                ? <div key={p} className="meta" style={{ padding: '6px 0' }}>✓ {POSITION_LABEL[p]} target photographed</div>
                : <button key={p} className="primary" style={{ width: '100%', margin: '4px 0' }} onClick={() => setCollecting(targetFor(p))}>Photograph the {p} target</button>
            })}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <h1>National Team Test</h1>
      <p className="lede">
        Do the parts in any order. Each turns green when it is done, and the score adds up the parts done. Rest at least {REST_MINUTES} minutes between components. Leaving for the session keeps what you have done.
      </p>
      {error && <div className="notice error">{error}</div>}

      {PART_ORDER.map((id) => {
        const st = states[id]
        const done = st === 'done'
        return (
          <button
            key={id} className="boutrow" disabled={st === 'locked'} onClick={() => open(id)}
            style={{
              width: '100%', textAlign: 'left', marginBottom: 8,
              border: `2px solid ${done ? 'var(--good)' : 'var(--border)'}`, background: done ? 'var(--good-wash)' : undefined,
              opacity: st === 'locked' ? 0.55 : 1,
            }}
          >
            <div className="grow">
              <div className="title">{done ? '✓ ' : ''}{PART_TITLE[id]}<GoArrow /></div>
              <div className="meta">{partButtonNote(id)}</div>
            </div>
          </button>
        )
      })}

      {test.finishedAt ? (
        <p className="meta" style={{ marginTop: 10 }}>
          Finished with a partial score.{' '}
          <button className="link" onClick={() => onTestChanged({ ...test, finishedAt: null })}>Reopen the test</button>
        </p>
      ) : PART_ORDER.some((id) => states[id] !== 'done') && (
        <div style={{ marginTop: 10 }}>
          <button
            className="confirm" style={{ width: '100%' }}
            onClick={() => {
              if (confirm('Finish the test with what has been done? Parts not done score nothing, and the test is shown as a partial score.')) {
                onTestChanged({ ...test, finishedAt: new Date().toISOString() })
              }
            }}
          >
            Finish the test with a partial score
          </button>
          <p className="meta" style={{ margin: '4px 0 0' }}>Not everything has to be shot. You can still collect the targets you did shoot.</p>
        </div>
      )}

      <h2>Score so far</h2>
      <NationalTestSummary bouts={bouts} test={test} />

      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="secondary danger" style={{ flex: 'none', width: 44, padding: '13px 0' }}
          aria-label="Cancel test" title="Cancel test"
          onClick={() => { if (confirm('Cancel this test? Its target photos and every timed stage will be deleted; the rest of the session stays. This cannot be undone.')) onCancel() }}
        >
          <TrashIcon />
        </button>
        <button className="primary" onClick={onBack}>Back to the session</button>
      </div>
    </>
  )
}
