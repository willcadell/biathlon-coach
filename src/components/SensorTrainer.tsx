import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CALIBRATION_PULLS, STEADY_SECONDS, STEADY_SPEED, SensorConnection, TARGET_NAMES, TARGET_SPACING_MM, TargetMap,
  aimSpeed, currentModel, holdBefore, legStats, needsExtraPull, observeBout, refineModel, scoreShot, sensorSupport, solveCalibration,
  type ConnectionState, type HoldSample, type Model, type Point, type Pull, type Quality, type SavedCalibration, type Sample, type TrackRow,
} from '../lib/sensor'
import type { Position, SensorShot } from '../lib/types'
import { sensorShotsFrom } from '../lib/sensorStats'
import { DryfireIcon } from './icons'
import { SensorReplay } from './SensorReplay'
import { RouteLegend, SensorRoute } from './SensorRoute'
import { SensorTargets, type GuideState, type ShotMark } from './SensorTargets'

/** What a finished sensor session hands back to the dry-fire session it belongs to. */
export interface SensorResult {
  minutes: number
  shots: number
  hits: number
  /** One line for the session's notes. */
  line: string
  /** The session itself, to be kept with the workout: the shots with their routes and steadiness. */
  session: { startedAt: string; position: Position; minutes: number; shots: SensorShot[] }
}

const MODEL_KEY = 'biathlon-coach:sensor-model'
const BOUT = 5
/** The sensor frame of this mount: x and y both run the "wrong" way round, and the scale is about 3.2 mm per raw unit at 5 m. */
const GEOMETRY = { flipX: true, flipY: true, scale: 3.2, rotation: 0 }

function loadModel(): Model {
  try { return currentModel(JSON.parse(localStorage.getItem(MODEL_KEY) ?? 'null') as Model | null) } catch { return currentModel(null) }
}
function saveModel(m: Model): void {
  try { localStorage.setItem(MODEL_KEY, JSON.stringify(m)) } catch { /* a model that is not remembered starts from the defaults next time */ }
}

type Phase = 'idle' | 'connecting' | 'calibrating' | 'shooting' | 'review'

interface CalView { index: number; total: number; current: number; taken: Record<number, number>; wanted: Record<number, number>; note: string }

const verdictText = (q: Quality) => (q.verdict === 'good' ? 'Good' : q.verdict === 'ok' ? 'Acceptable' : 'Poor: calibrate again')

/** The sensor trainer offered on a dry-fire session, on a computer only: nothing is shown on a phone or tablet, or in a browser without WebUSB.
 *  Closed, it is a card with one button; open, it runs a session: connect, calibrate (pulls on Alpha, Charlie and Echo, guided), then shoot. */
export function SensorTrainerCard({ position, onFinish }: { position: Position; onFinish: (r: SensorResult) => void }) {
  const support = useMemo(() => sensorSupport(), [])
  const [open, setOpen] = useState(false)
  if (!support.ok) return null
  return (
    <div className="card">
      <div className="sensor-head">
        <DryfireIcon size={26} />
        <div>
          <h3 style={{ margin: 0 }}>Sensor trainer</h3>
          <p className="meta" style={{ margin: 0 }}>Shoot Alpha to Echo on the optical dry-fire target. It calibrates itself and scores every shot.</p>
        </div>
        {!open && <button className="primary" onClick={() => setOpen(true)}>Open</button>}
      </div>
      {open && <SensorSession position={position} onClose={() => setOpen(false)} onFinish={onFinish} />}
    </div>
  )
}

function SensorSession({ position: initialPosition, onClose, onFinish }: { position: Position; onClose: () => void; onFinish: (r: SensorResult) => void }) {
  const conn = useRef<SensorConnection>(new SensorConnection())
  const [position, setPosition] = useState<Position>(initialPosition)
  const [phase, setPhaseState] = useState<Phase>('idle')
  const [status, setStatus] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState('')
  const [aim, setAim] = useState<Point | null>(null)
  const [trace, setTrace] = useState<Point[]>([])
  const [shots, setShots] = useState<ShotMark[]>([])
  const [cal, setCal] = useState<CalView | null>(null)
  const [quality, setQuality] = useState<Quality | null>(null)
  const [details, setDetails] = useState(false)
  const [held, setHeld] = useState(0)
  const [tick, setTick] = useState(0)                 // bumped as the track grows, to redraw the route
  const [routeBout, setRouteBout] = useState<number | null>(null)
  const [replaying, setReplaying] = useState(false)

  // Everything the event handlers need, as refs, because they are registered once.
  const phaseRef = useRef<Phase>('idle')
  const positionRef = useRef<Position>(position)
  const buf = useRef<HoldSample[]>([])
  const aimRef = useRef<Point | null>(null)
  const traceRef = useRef<(Point & { t: number })[]>([])
  const shotsRef = useRef<ShotMark[]>([])
  const trackRef = useRef<TrackRow[]>([])           // every aim sample since shooting began, with the number of shots fired so far (its leg)
  const uxRef = useRef<number[]>([])
  const calRef = useRef<{ set: number[]; pulls: Pull[]; saved: SavedCalibration | null }>({ set: [...CALIBRATION_PULLS], pulls: [], saved: null })
  const modelRef = useRef<Model>(loadModel())
  const greenRef = useRef(0)
  const startedAt = useRef(0)
  const holdSince = useRef<number | null>(null)

  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p) }
  useEffect(() => { positionRef.current = position }, [position])

  const lights = useCallback((red: number, green: number) => { conn.current.setLights(red, green).catch(() => undefined) }, [])

  const viewOf = useCallback((note = ''): CalView => {
    const { set, pulls } = calRef.current
    const wanted: Record<number, number> = {}, taken: Record<number, number> = {}
    for (const a of new Set(set)) { wanted[a] = set.filter((x) => x === a).length; taken[a] = set.slice(0, pulls.length).filter((x) => x === a).length }
    return { index: pulls.length + 1, total: set.length, current: set[Math.min(pulls.length, set.length - 1)], taken, wanted, note }
  }, [])

  // The calibration lights: every light off, a target's light flashing green when a pull of it is accepted, and steady green once all its pulls are taken.
  const blinkRef = useRef(0)
  const calibrationLights = useCallback((accepted = -1) => {
    const { set, pulls } = calRef.current
    let done = 0
    for (const a of new Set(set)) if (set.every((x, i) => x !== a || i < pulls.length)) done |= 1 << a
    const id = ++blinkRef.current
    const bit = accepted < 0 ? 0 : 1 << accepted
    if (!bit || done & bit) { lights(0, done); return }
    [done | bit, done, done | bit, done].forEach((g, i) => setTimeout(() => { if (blinkRef.current === id) lights(0, g) }, i * 220))   // two flashes, ending as it was
  }, [lights])

  const beginCalibration = useCallback((note = '') => {
    calRef.current.set = [...CALIBRATION_PULLS]
    calRef.current.pulls = []
    conn.current.tracker.map = null
    setPhase('calibrating')
    setQuality(null)
    setCal(viewOf(note))
    calibrationLights()
  }, [viewOf, calibrationLights])

  const flash = useCallback((times: number) => {
    blinkRef.current++
    let i = 0
    const step = () => {
      if (i >= times * 2) { lights(0x1f, 0); return }
      lights(0, i % 2 === 0 ? 0x1f : 0)
      i++
      setTimeout(step, i % 2 === 1 ? 220 : 160)
    }
    step()
  }, [lights])

  const onShot = useCallback((shot: Sample & { strength: number }) => {
    if (phaseRef.current === 'calibrating') {
      const hold = holdBefore(buf.current, shot.t)
      const c = calRef.current
      if (!hold) {
        setCal(viewOf('That pull had too few aim samples in the 1.5 s before it: tracking was weak. Hold still and pull again.'))
        return
      }
      c.pulls.push(hold)
      if (needsExtraPull(c.set, c.pulls)) c.set.splice(c.pulls.length, 0, c.set[c.pulls.length - 1])   // a pair that disagrees earns a third pull
      if (c.pulls.length < c.set.length) { setCal(viewOf()); calibrationLights(c.set[c.pulls.length - 1]); return }
      const out = solveCalibration(c.set, c.pulls, c.saved, modelRef.current)
      if ('rejected' in out) { beginCalibration(`${out.rejected} Starting again.`); return }
      c.saved = out.saved
      conn.current.tracker.map = new TargetMap(out.centres, TARGET_SPACING_MM)
      conn.current.tracker.shiftZero(out.charlie.x, out.charlie.y)           // Charlie's reading is the zero
      setQuality(out.quality)
      setCal(null)
      setPhase('shooting')
      greenRef.current = 0
      flash(3)
      return
    }
    if (phaseRef.current !== 'shooting') return
    const r = scoreShot(shot.x, shot.y, positionRef.current)
    const n = shotsRef.current.length + 1
    const mark: ShotMark = { n, x: shot.x, y: shot.y, hit: r.hit, t: shot.t }
    shotsRef.current = [...shotsRef.current, mark]
    uxRef.current = [...uxRef.current, shot.ux]
    setShots(shotsRef.current)
    setTick((t) => t + 1)
    if ((n - 1) % BOUT === 0) greenRef.current = 0
    if (r.hit) greenRef.current |= 1 << r.target
    lights(0x1f & ~greenRef.current, greenRef.current)
    if (n % BOUT === 0) {                                                       // a finished bout: learn from it if it was fired in order
      const saved = calRef.current.saved
      if (saved && saved.anchors.length === 3) {
        const obs = observeBout(uxRef.current.slice(-BOUT), [saved.base[0].x, saved.base[1].x, saved.base[2].x])
        if (obs) { modelRef.current = refineModel(modelRef.current, obs.obsB, obs.obsD, 0.5); saveModel(modelRef.current) }
      }
      // The finished bout's result stays lit for a few seconds, then every light flashes off and comes back red (twice), so the next bout starts clean.
      ;[0, 1, 0, 1].forEach((on, i) => setTimeout(() => {
        if (phaseRef.current === 'shooting' && shotsRef.current.length === n) { greenRef.current = 0; lights(on ? 0x1f : 0, 0) }
      }, 4000 + i * 220))
    }
  }, [viewOf, calibrationLights, beginCalibration, flash, lights])

  // Wire the connection once, and draw at most 30 times a second.
  useEffect(() => {
    const c = conn.current
    const offs = [
      c.on('status', (s) => setStatus(s.state)),
      c.on('sample', (s) => {
        buf.current.push({ t: s.t, ux: s.ux, uy: s.uy })
        while (buf.current.length && buf.current[0].t < s.t - 3000) buf.current.shift()
        aimRef.current = { x: s.x, y: s.y }
        traceRef.current.push({ x: s.x, y: s.y, t: s.t })
        if (phaseRef.current === 'shooting') trackRef.current.push([s.t, s.x, s.y, shotsRef.current.length])
        while (traceRef.current.length && traceRef.current[0].t < s.t - 2500) traceRef.current.shift()
      }),
      c.on('shot', onShot),
    ]
    let frames = 0
    const timer = window.setInterval(() => {
      if (++frames % 15 === 0 && phaseRef.current === 'shooting') setTick((t) => t + 1)
      setAim(aimRef.current)
      setTrace(traceRef.current.map((p) => ({ x: p.x, y: p.y })))
      if (phaseRef.current === 'calibrating') {
        const speed = aimSpeed(buf.current)
        if (speed == null || speed > STEADY_SPEED * 2) holdSince.current = null
        else if (speed <= STEADY_SPEED && holdSince.current == null) holdSince.current = performance.now()
        setHeld(holdSince.current == null ? 0 : (performance.now() - holdSince.current) / 1000)
      }
    }, 33)
    return () => { offs.forEach((off) => off()); window.clearInterval(timer); void c.disconnect() }
  }, [onShot])

  async function start() {
    setError('')
    setPhase('connecting')
    try {
      await conn.current.connect()
      await conn.current.start({ ...GEOMETRY, map: null })
      await conn.current.setTargets(0x1f)
      shotsRef.current = []; uxRef.current = []; trackRef.current = []; setShots([]); setRouteBout(null); setReplaying(false)
      calRef.current = { set: [...CALIBRATION_PULLS], pulls: [], saved: null }
      startedAt.current = Date.now()
      beginCalibration()
    } catch (e) {
      setError((e as Error).message)
      setPhase('idle')
    }
  }

  async function finish() {
    const all = shotsRef.current
    const hits = all.filter((s) => s.hit).length
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000))
    await conn.current.disconnect()
    if (!all.length) { setPhase('idle'); onClose(); return }
    setPhase('review')                                                          // the session stays on screen to be replayed until it is closed
    onFinish({
      minutes, shots: all.length, hits, line: `Sensor trainer: ${hits} of ${all.length} shots hit${position === 'prone' ? ' (prone)' : ' (standing)'}.`,
      session: { startedAt: new Date(startedAt.current).toISOString(), position, minutes, shots: sensorShotsFrom(all, trackRef.current) },
    })
  }

  const running = phase === 'calibrating' || phase === 'shooting'
  const guide: GuideState | null = phase === 'calibrating' && cal ? { current: cal.current, total: cal.wanted, taken: cal.taken } : null
  const bouts = Math.ceil(shots.length / BOUT)
  const routeShown = Math.min(routeBout ?? bouts - 1, bouts - 1)
  const route = useMemo(() => {
    const lo = Math.max(0, routeShown) * BOUT, hi = lo + BOUT
    return legStats(trackRef.current.filter((q) => q[3] >= lo && q[3] < hi))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, routeShown])
  // What a replay plays: the bout's aim track up to its last shot, frozen when the replay is opened.
  const replaySnap = useMemo(() => {
    if (!replaying && phase !== 'review') return null
    const lo = Math.max(0, routeShown) * BOUT
    const inBout = shotsRef.current.slice(lo, lo + BOUT)
    const endT = inBout.length ? inBout[inBout.length - 1].t ?? 0 : 0
    return { rows: trackRef.current.filter((q) => q[3] >= lo && q[3] < lo + BOUT && q[0] <= endT + 500), shots: inBout }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaying, phase, routeShown])

  return (
    <div style={{ marginTop: 12 }}>
      {error && <div className="notice error" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="sensor-controls">
        <div className="seg" role="group" aria-label="Position">
          {(['prone', 'standing'] as Position[]).map((p) => (
            <button key={p} aria-pressed={position === p} disabled={running || phase === 'review'} onClick={() => setPosition(p)}>{p === 'prone' ? 'Prone' : 'Standing'}</button>
          ))}
        </div>
        {!running && <button className="primary" disabled={phase === 'connecting'} onClick={() => void start()}>{phase === 'connecting' ? 'Connecting…' : phase === 'review' ? 'Start another' : 'Connect and start'}</button>}
        {running && phase === 'shooting' && <button className="secondary" onClick={() => beginCalibration()}>Calibrate again</button>}
        {running && <button className="secondary" onClick={() => void finish()}>Finish</button>}
        {(phase === 'idle' || phase === 'review') && <button className="secondary" onClick={onClose}>Close</button>}
      </div>

      {status === 'ready' && !running && <p className="meta">Receiver connected.</p>}

      {phase === 'calibrating' && cal && (
        <div className="sensor-guide">
          <div className="sg-step">Calibration · pull {cal.index} of {cal.total}</div>
          <div className="sg-title">Aim at {TARGET_NAMES[cal.current]}{cal.wanted[cal.current] > 1 ? ` · pull ${cal.taken[cal.current] + 1} of ${cal.wanted[cal.current]}` : ''}</div>
          {cal.note && <div className="notice error" style={{ margin: '8px 0' }}>{cal.note}</div>}
          <div className="sg-pips">
            {Object.keys(cal.wanted).map(Number).map((a) => (
              <span key={a} className={`sg-pip ${cal.taken[a] >= cal.wanted[a] ? 'done' : a === cal.current ? 'now' : ''}`}>
                {TARGET_NAMES[a]} {cal.taken[a] >= cal.wanted[a] ? '✓' : `${cal.taken[a]}/${cal.wanted[a]}`}
              </span>
            ))}
          </div>
          <div className="sg-meter" aria-hidden="true"><i className={held >= STEADY_SECONDS ? 'ready' : ''} style={{ width: `${Math.min(100, (held / STEADY_SECONDS) * 100)}%` }} /></div>
          <div className="meta">{held >= STEADY_SECONDS ? 'Steady. Fire when you are ready.' : held > 0 ? `Holding… ${held.toFixed(1)} s of ${STEADY_SECONDS}` : 'Settle on the target, then hold still.'}</div>
        </div>
      )}

      {running && <SensorTargets position={position} aim={aim} trace={trace} shots={shots} guide={guide} />}

      {phase === 'shooting' && quality && (
        <p className="meta" style={{ marginTop: 6 }}>
          Calibration: <strong>{verdictText(quality)}</strong> · overall {quality.overall.toFixed(1)} mm{' '}
          <button className="link" onClick={() => setDetails(!details)}>{details ? 'Hide details' : 'Details'}</button>
        </p>
      )}
      {phase === 'shooting' && quality && details && (
        <table className="sensor-table">
          <thead><tr><th>Target</th><th>Hold wobble</th><th>Pulls apart</th><th>Vs earlier pass</th></tr></thead>
          <tbody>
            {quality.rows.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td>{r.wobble.toFixed(1)}</td><td>{r.repeat == null ? '–' : `${r.repeat.toFixed(1)} mm${r.dropped ? ` (${r.dropped} stray dropped)` : ''}`}</td><td>{r.diff == null ? '–' : `${r.diff.toFixed(1)} mm`}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      {(phase === 'shooting' || phase === 'review') && shots.length > 0 && (
        <div>
          <div className="sensor-route-head">
            <h3>Route to each shot</h3>
            {phase === 'shooting' && <button className="secondary" onClick={() => setReplaying(!replaying)}>{replaying ? 'Live route' : 'Replay'}</button>}
            {bouts > 1 && (
              <div className="seg" role="group" aria-label="Bout">
                {Array.from({ length: bouts }, (_, b) => <button key={b} aria-pressed={routeShown === b} onClick={() => setRouteBout(b)}>{b + 1}</button>)}
              </div>
            )}
          </div>
          {replaySnap ? (
            <SensorReplay key={`${routeShown}|${replaySnap.rows.length}`} position={position} rows={replaySnap.rows} shots={replaySnap.shots} bout={routeShown} />
          ) : (
            <>
              <SensorRoute position={position} legs={route} shots={shots.slice(routeShown * BOUT, (routeShown + 1) * BOUT)} bout={routeShown} />
              <RouteLegend legs={route} />
            </>
          )}
        </div>
      )}

      {shots.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {Array.from({ length: bouts }, (_, b) => {
            const bout = shots.slice(b * BOUT, (b + 1) * BOUT)
            return (
              <div key={b} className="sensor-bout">
                <span className="meta">Bout {b + 1}</span>
                {bout.map((s) => <span key={s.n} className={`sensor-chip ${s.hit ? 'hit' : 'miss'}`}>{TARGET_NAMES[nearest(s)][0]}{s.hit ? ' ✓' : ''}</span>)}
                <span className="meta">{bout.filter((s) => s.hit).length} of {bout.length}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const nearest = (s: ShotMark): number => Math.max(0, Math.min(4, Math.round(s.x / TARGET_SPACING_MM) + 2))
