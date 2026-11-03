import { useEffect, useRef, useState } from 'react'
import type { Bout, MetalTarget, NationalTest, NationalTestStage, PendingTarget, Position, Settings, Workout } from '../lib/types'
import {
  ACROSS_STAGES, BASELINE_TOTAL, MISS_PENALTY, PRECISION_MAX, PRECISION_MINUTES, REST_SECONDS, SHOTS_PER_STAGE, SINGLE_PRONE_SHOTS, SPEED_MAX, STAGE_LABEL,
  STANDARD_A, STANDARD_B, TOTAL_MAX, clock, singleSeconds, PART_ORDER, testParts, precisionBouts, precisionResult, scoreNationalTest, stageSecondsFromTaps, testBouts, withoutLastTimed,
  type DrillKind, type PartId, type PartState,
} from '../lib/nationalTest'
import { errorMessage } from '../lib/errors'
import { playCountIn, type CountInSound } from '../lib/beep'
import { allMissed, METAL_TARGETS } from '../lib/metal'
import { CaptureView } from './CaptureView'
import { GoArrow, TrashIcon } from './icons'

const POSITION_LABEL: Record<Position, string> = { prone: 'Prone', standing: 'Standing' }

/** Points and times for a National Team test, shot or part-shot. Used while it
 *  is being shot and again when the workout is opened in History. */
export function NationalTestSummary({ bouts, test }: { bouts: Bout[]; test: Pick<NationalTest, 'stages'> & Partial<Pick<NationalTest, 'proneBoutId' | 'standingBoutId'>> }) {
  const s = scoreNationalTest(bouts, test)
  const groups = precisionBouts(bouts)
  const row = (label: string, value: string, note?: string) => (
    <div className="row" style={{ alignItems: 'baseline' }}>
      <span style={{ flex: 1 }}>{label}{note && <small className="meta" style={{ display: 'block' }}>{note}</small>}</span>
      <strong className="num" style={{ flex: 'none' }}>{value}</strong>
    </div>
  )
  const precisionNote = (['prone', 'standing'] as Position[])
    .map((p) => {
      const b = groups[p]
      if (b) return `${POSITION_LABEL[p]} ${precisionResult(b).rings}`
      const shot = p === 'prone' ? test.proneBoutId : test.standingBoutId
      return `${POSITION_LABEL[p]} ${shot ? 'shot, target not photographed' : 'not shot'}`
    })
    .join(' · ')
  const drillShots = test.stages.reduce((t, st) => t + SHOTS_PER_STAGE[st.kind], 0)
  const speedNote = s.missing.some((m) => m.includes('4x5') || m.includes('10x1'))
    ? 'Counted once both timed drills are shot'
    : `4x5 ${clock(s.proneSeconds + s.standingSeconds)} + 10x1 ${clock(s.singleSeconds)} = ${clock(s.proneSeconds + s.standingSeconds + s.singleSeconds)} (baseline ${clock(BASELINE_TOTAL)})`
  const missNote = `${s.precisionMisses} on paper · ${s.drillMisses} of ${drillShots} in the timed drills`
  return (
    <div className="card">
      {s.standard
        ? <p><span className="pill">{s.standard}-standard</span> <strong className="num">{s.total}</strong> of {TOTAL_MAX}</p>
        : <p><strong className="num">{s.total}</strong> of {TOTAL_MAX}{s.missing.length > 0 && <span className="meta"> so far · still to shoot: {s.missing.join(', ')}</span>}</p>}
      {row('Precision', `${s.precision} / ${PRECISION_MAX}`, precisionNote)}
      {row('Speed', `${s.speed} / ${SPEED_MAX}`, speedNote)}
      {row('Misses', s.penalties === 0 ? '0' : `−${s.penalties}`, `${MISS_PENALTY} points each: ${missNote}`)}
      <p className="meta" style={{ marginBottom: 0 }}>A-standard is {STANDARD_A}, B-standard {STANDARD_B}.</p>
    </div>
  )
}

/** The test as it sits among a session's entries: how far it is, and a way back in. */
export function NationalTestCard({ test, bouts, onOpen }: { test: NationalTest; bouts: Bout[]; onOpen: () => void }) {
  const s = scoreNationalTest(testBouts(test, bouts), test)
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <strong>National Team test</strong>
      <p className="meta" style={{ margin: '4px 0 10px' }}>
        {s.missing.length === 0
          ? <>{s.standard ? `${s.standard}-standard · ` : ''}{s.total} of {TOTAL_MAX}</>
          : <>In progress · still to shoot: {s.missing.join(', ')}</>}
      </p>
      <button className="secondary" style={{ width: '100%' }} onClick={onOpen}>{s.missing.length === 0 ? 'View' : 'Continue'}</button>
    </div>
  )
}

/** The five minutes between the two precision groups. The clock is held by the test, so it keeps
 *  running while the athlete does another part. */
function Rest({ endsAt, now, onStart, onSkip }: { endsAt: number | null; now: number; onStart: () => void; onSkip: () => void }) {
  const left = endsAt === null ? REST_SECONDS : Math.max(0, Math.ceil((endsAt - now) / 1000))
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Rest before the second group</h2>
      <p className="meta">The test needs at least five minutes between the prone and standing precision groups. You can do another part while you wait.</p>
      <p style={{ fontSize: 44, fontWeight: 600, textAlign: 'center', margin: '10px 0' }} className="num" aria-live="off">{clock(left)}</p>
      <div className="row">
        <button className="link" onClick={onSkip}>Already rested — skip</button>
        {endsAt === null && <button className="primary" onClick={onStart}>Start the rest</button>}
      </div>
    </div>
  )
}

const DRILL_BRIEF: Record<DrillKind, string> = {
  across:
    'Rifle unslung on the mat, action open, unloaded, no magazine in. Start behind the pylon, 3 m back, poles on. On "Go": run to the mat, get into position, load a magazine, shoot five, unload, open the action, leave the rifle on the mat and run back behind the pylon. Each of the four stages is timed on its own.',
  single:
    'Rifle unslung on the mat, completely empty. Start behind the pylon, 3 m back. On "Go": run to the mat, set up, load one round, shoot one, clear the rifle and run back behind the pylon, ten times: five prone, then five standing. The whole drill is one time, from "Go" to the last return, so there is nothing to tap per shot.',
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
        <span>
          Time to reach the phone
          <small>On your own? This much comes off every tap, so the time stops when you crossed the line, not when you tapped.</small>
        </span>
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
 * The 4x5 across: four lines, prone, standing, prone, standing, each with its five targets.
 * One timer serves all four. Its button names the stage it is on: start it (after the
 * count-in), stop it when back over the line, score the five targets on that line, confirm,
 * and the line turns green and the button moves to the next stage. Each stage is saved as
 * soon as it is confirmed, so leaving the test part-way keeps the finished ones.
 */
function AcrossDrill({ saved, onSaved }: { saved: NationalTestStage[]; onSaved: (stage: NationalTestStage) => void }) {
  const goAt = useRef(0)
  // The clock times of "Go" and of the stop, for matching the stage to a heart-rate stream.
  const times = useRef<{ startedAt?: string; endedAt?: string }>({})
  const sound = useRef<CountInSound | null>(null)
  const [phase, setPhase] = useState<'ready' | 'counting' | 'running' | 'scoring'>('ready')
  const [now, setNow] = useState(0)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [time, setTime] = useState('')
  const [targets, setTargets] = useState<Record<MetalTarget, boolean>>(allMissed)

  const index = saved.length
  // All four in: the lines stay to look at, with no timer.
  const finished = index >= ACROSS_STAGES.length
  const position = ACROSS_STAGES[index] ?? 'standing'
  const name = `${index + 1} of ${ACROSS_STAGES.length} · ${POSITION_LABEL[position]}`

  useEffect(() => {
    if (phase !== 'counting' && phase !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 50)
    return () => clearInterval(id)
  }, [phase])
  useEffect(() => { if (phase === 'counting' && now >= goAt.current) setPhase('running') }, [phase, now])
  useEffect(() => () => sound.current?.stop(), [])
  // A new stage starts from a clean slate, whichever way the last one ended.
  useEffect(() => { setPhase('ready'); setTargets(allMissed()) }, [index])

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
    const raw = Math.round(((Date.now() - goAt.current) / 1000) * 10) / 10
    // The stop is `allowance` seconds before the tap, as the stage time is.
    times.current = { startedAt: new Date(goAt.current).toISOString(), endedAt: new Date(Date.now() - prefs.allowance * 1000).toISOString() }
    setTime(String(stageSecondsFromTaps([raw], prefs.allowance)[0]))
    setTargets(allMissed())
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

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{STAGE_LABEL.across}</h2>

      {!finished && (
        <>
      {phase === 'counting'
        ? <><div key={toGo} className="count-in" aria-live="assertive">{toGo}</div><p className="meta" style={{ textAlign: 'center', margin: 0 }}>{POSITION_LABEL[position]}. Get behind the pylon.</p></>
        : <p className={`clock-face${phase === 'running' && elapsed < 1 ? ' go-flash' : ''}`} aria-live="off">{phase === 'scoring' ? (timeOk ? seconds.toFixed(1) : '—') : elapsed.toFixed(1)}</p>}

      {phase === 'ready' && <button className="primary" style={{ width: '100%', padding: '18px 0', fontSize: 17 }} onClick={start}>Start {name}</button>}
      {phase === 'counting' && <button className="link" style={{ marginTop: 8 }} onClick={reset}>Cancel</button>}
      {phase === 'running' && <button className="primary" style={{ width: '100%', padding: '22px 0', fontSize: 18 }} onClick={stop}>Stop {name}</button>}
      {phase === 'scoring' && (
        <button
          className="primary" style={{ width: '100%', padding: '18px 0', fontSize: 17 }} disabled={!timeOk}
          onClick={() => onSaved({ kind: 'across', position, seconds, hits: METAL_TARGETS.filter((t) => targets[t]).length, targets, ...times.current })}
        >
          Confirm {name}
        </button>
      )}
      {phase === 'running' && prefs.allowance > 0 && (
        <p className="meta" style={{ marginBottom: 0 }}>The tap takes {prefs.allowance.toFixed(1)} s off, for reaching the phone.</p>
      )}
        </>
      )}

      <div style={{ marginTop: 14 }}>
        {ACROSS_STAGES.map((pos, i) => {
          const stage = saved[i]
          const active = i === index
          const live = active && phase === 'scoring'
          const rowHits = stage ? (stage.targets ?? scatterHits(stage.hits)) : live ? targets : allMissed()
          return (
            <div
              key={i}
              style={{
                padding: '8px 10px', margin: '0 0 8px', borderRadius: 10, boxSizing: 'border-box',
                border: `2px solid ${stage ? 'var(--good)' : active ? 'var(--series-1)' : 'var(--grid)'}`,
                background: stage ? 'var(--good-wash)' : 'transparent',
                opacity: stage || active ? 1 : 0.6,
              }}
            >
              <div className="row" style={{ alignItems: 'baseline', marginBottom: 6 }}>
                <strong style={{ flex: 1 }}>{stage ? '✓ ' : ''}{i + 1} · {POSITION_LABEL[pos]}</strong>
                {stage && <span className="num" style={{ flex: 'none' }}>{stage.seconds.toFixed(1)} s · {stage.hits}/{SHOTS_PER_STAGE.across}</span>}
                {live && (
                  <input
                    type="number" inputMode="decimal" min={0} step={0.1} aria-label={`Stage ${i + 1} seconds`}
                    style={{ flex: '0 0 76px' }} value={time} onChange={(e) => setTime(e.target.value)}
                  />
                )}
              </div>
              <TargetRow hits={rowHits} done={!!stage} onChange={live ? setTargets : undefined} />
              {live && <p className="meta" style={{ margin: '6px 0 0' }}>Tap the targets that fell. Edit the time if the tap was late.</p>}
            </div>
          )
        })}
      </div>
      {!finished && phase === 'scoring' && <button className="link" onClick={reset}>Re-run this stage</button>}

      {!finished && phase === 'ready' && (
        <details style={{ marginTop: 8 }}>
          <summary className="meta">Timer options</summary>
          <p className="meta">{DRILL_BRIEF.across}</p>
          <TimerOptions prefs={prefs} onChange={changePrefs} />
        </details>
      )}
    </div>
  )
}

/** For a stage saved with only a count: that many targets shown as hit, left to right. */
function scatterHits(count: number): Record<MetalTarget, boolean> {
  return Object.fromEntries(METAL_TARGETS.map((t, i) => [t, i < count])) as Record<MetalTarget, boolean>
}

/**
 * The 10x1, timed as a whole: one start, one stop. There is nothing to tap per shot; the
 * ten singles (five prone, then five standing) are scored afterwards as hit or miss, in
 * two rows of five.
 */
function SingleDrill({ onSaved }: { onSaved: (stage: NationalTestStage) => void }) {
  const goAt = useRef(0)
  // The clock times of "Go" and of the stop, for matching the stage to a heart-rate stream.
  const times = useRef<{ startedAt?: string; endedAt?: string }>({})
  const sound = useRef<CountInSound | null>(null)
  const [phase, setPhase] = useState<'ready' | 'counting' | 'running' | 'scoring'>('ready')
  const [now, setNow] = useState(0)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [time, setTime] = useState('')
  const [shots, setShots] = useState<boolean[]>(() => Array(SHOTS_PER_STAGE.single).fill(false))

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
    setPhase('counting')
  }
  function stop() {
    const raw = Math.round(((Date.now() - goAt.current) / 1000) * 10) / 10
    // The stop is `allowance` seconds before the tap, as the stage time is.
    times.current = { startedAt: new Date(goAt.current).toISOString(), endedAt: new Date(Date.now() - prefs.allowance * 1000).toISOString() }
    setTime(String(stageSecondsFromTaps([raw], prefs.allowance)[0]))
    setShots(Array(SHOTS_PER_STAGE.single).fill(false))
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
  const hits = shots.filter(Boolean).length
  const row = (from: number, to: number) => (
    <TargetRow
      labels={Array.from({ length: to - from }, (_, k) => String(from + k + 1))}
      hits={shots.slice(from, to)}
      onChange={phase === 'scoring' ? (next) => setShots((prev) => [...prev.slice(0, from), ...next, ...prev.slice(to)]) : undefined}
    />
  )

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{STAGE_LABEL.single}</h2>

      {phase === 'counting'
        ? <><div key={toGo} className="count-in" aria-live="assertive">{toGo}</div><p className="meta" style={{ textAlign: 'center', margin: 0 }}>Get behind the pylon.</p></>
        : <p className={`clock-face${phase === 'running' && elapsed < 1 ? ' go-flash' : ''}`} aria-live="off">{phase === 'scoring' ? (timeOk ? seconds.toFixed(1) : '—') : elapsed.toFixed(1)}</p>}

      {phase === 'ready' && <button className="primary" style={{ width: '100%', padding: '18px 0', fontSize: 17 }} onClick={start}>Start the 10x1</button>}
      {phase === 'counting' && <button className="link" style={{ marginTop: 8 }} onClick={reset}>Cancel</button>}
      {phase === 'running' && <button className="primary" style={{ width: '100%', padding: '22px 0', fontSize: 18 }} onClick={stop}>Stop the 10x1 — all ten shot</button>}
      {phase === 'running' && prefs.allowance > 0 && (
        <p className="meta" style={{ marginBottom: 0 }}>The tap takes {prefs.allowance.toFixed(1)} s off, for reaching the phone.</p>
      )}

      {phase === 'scoring' && (
        <>
          <label className="field">
            <span>Time, seconds<small>Edit it if the tap was late.</small></span>
            <input type="number" inputMode="decimal" min={0} step={0.1} aria-label="10x1 seconds" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <strong>Prone singles</strong>
          <div style={{ margin: '6px 0 12px' }}>{row(0, SINGLE_PRONE_SHOTS)}</div>
          <strong>Standing singles</strong>
          <div style={{ margin: '6px 0 12px' }}>{row(SINGLE_PRONE_SHOTS, SHOTS_PER_STAGE.single)}</div>
          <p className="meta">Tap the targets that fell. {hits} of {SHOTS_PER_STAGE.single} hit.</p>
          <button
            className="primary" style={{ width: '100%', padding: '18px 0', fontSize: 17 }} disabled={!timeOk}
            onClick={() => onSaved({ kind: 'single', position: 'prone', seconds, hits, ...times.current })}
          >
            Confirm the 10x1
          </button>
          <button className="link" style={{ marginTop: 8 }} onClick={reset}>Re-run the 10x1</button>
        </>
      )}

      {phase === 'ready' && (
        <>
          <p className="meta" style={{ marginTop: 12 }}>{DRILL_BRIEF.single}</p>
          <details>
            <summary className="meta">Timer options</summary>
            <TimerOptions prefs={prefs} onChange={changePrefs} />
          </details>
        </>
      )}
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
  single: '10x1 single shot',
  collect: 'Collect and photograph the targets',
}
const PART_BLURB: Record<PartId, string> = {
  prone: 'Ten shots on paper, lying.',
  standing: 'Ten shots on paper, standing.',
  across: 'Four timed stages: prone, standing, prone, standing.',
  single: 'Ten singles on one clock: five prone, then five standing.',
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
  // Held in memory only: after a reload the rest and the closed-range check are asked again.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [restSkipped, setRestSkipped] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [rangeClosed, setRangeClosed] = useState(false)
  const [marking, setMarking] = useState(false)
  const [error, setError] = useState('')

  const resting = restEndsAt !== null && now < restEndsAt
  useEffect(() => {
    if (!resting) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [resting])

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

  const takeBack = test.stages.some((x) => x.kind === 'single') ? '10x1' : '4x5 stage'
  const restOver = restSkipped || (restEndsAt !== null && now >= restEndsAt)

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
      // The first group starts the five minutes before the second.
      if (!test.proneBoutId && !test.standingBoutId) { setNow(Date.now()); setRestEndsAt(Date.now() + REST_SECONDS * 1000) }
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

  /** Whether this precision group has to wait for the rest: the other one is shot and the five minutes are not up. */
  const mustRest = (position: Position) => {
    const other = position === 'prone' ? test.standingBoutId : test.proneBoutId
    return !!other && !restOver
  }

  function partButtonNote(id: PartId): string {
    const st = states[id]
    if (st === 'locked') return 'Locked until the other four parts are shot'
    if (id === 'prone' || id === 'standing') {
      if (st === 'done') return 'Shot — target to collect at the end'
      const position = id
      if (mustRest(position)) return resting ? `Rest first · ${clock(Math.max(0, Math.ceil(((restEndsAt as number) - now) / 1000)))} left` : 'Rest five minutes first'
      return PART_BLURB[id]
    }
    if (id === 'across') {
      const n = test.stages.filter((x) => x.kind === 'across').length
      return st === 'done' ? 'All four stages done' : n > 0 ? `${n} of ${ACROSS_STAGES.length} stages done` : PART_BLURB[id]
    }
    if (id === 'single') return st === 'done' ? 'Done' : PART_BLURB[id]
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
        {position && states[part] !== 'done' && mustRest(position) && (
          <Rest
            endsAt={restEndsAt} now={now}
            onStart={() => { setNow(Date.now()); setRestEndsAt(Date.now() + REST_SECONDS * 1000) }}
            onSkip={() => setRestSkipped(true)}
          />
        )}
        {position && states[part] !== 'done' && !mustRest(position) && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>{PART_TITLE[part]}</h2>
            <p className="meta">
              Ten shots on an ISSF 50 m target. You have up to {PRECISION_MINUTES} minutes for both groups, and a coach may spot your shots for you.
              {position === 'prone'
                ? ' A shot outside the 8 ring counts as a miss and costs 10 points.'
                : ' A shot outside the black counts as a miss and costs 10 points.'}
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
          <AcrossDrill saved={test.stages.filter((x) => x.kind === 'across')} onSaved={(stage) => onTestChanged({ ...test, stages: [...test.stages, stage] })} />
        )}

        {part === 'single' && (states.single === 'done'
          ? (
              <div className="card">
                <h2 style={{ marginTop: 0 }}>{PART_TITLE.single}</h2>
                <p className="meta" style={{ marginBottom: 0 }}>
                  Done: {singleSeconds(test.stages).toFixed(1)} s, {test.stages.filter((x) => x.kind === 'single').reduce((t, x) => t + x.hits, 0)} of {SHOTS_PER_STAGE.single} hit.
                </p>
              </div>
            )
          : <SingleDrill onSaved={(stage) => onTestChanged({ ...test, stages: [...test.stages, stage] })} />)}

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
      <h1>National Team test</h1>
      <p className="lede">
        Do the parts in any order. Each turns green when it is done. Leaving for the session keeps what you have shot, and you can come back to it.
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

      <h2>Score so far</h2>
      <NationalTestSummary bouts={bouts} test={test} />

      {test.stages.length > 0 && (
        <button
          className="link" style={{ marginBottom: 10 }}
          onClick={() => { if (confirm(`Remove the last ${takeBack} so it can be shot again?`)) onTestChanged({ ...test, stages: withoutLastTimed(test.stages) }) }}
        >
          Take back the last {takeBack}
        </button>
      )}

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
