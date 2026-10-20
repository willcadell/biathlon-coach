import { useEffect, useMemo, useRef, useState } from 'react'
import { legStats, type TrackRow } from '../lib/sensor'
import type { Position } from '../lib/types'
import { RouteLegend, SensorRoute } from './SensorRoute'
import type { ShotMark } from './SensorTargets'

const SPEEDS = [0.5, 1, 2, 4]

/** A bout played back: the route is drawn as the rifle travels it, the aim point moves, and the shots appear as they were fired. A slider
 *  scrubs, Play runs it at a chosen speed, and the shot buttons jump to the moment of the previous or next shot. */
export function SensorReplay({ position, rows, shots, bout }: { position: Position; rows: TrackRow[]; shots: ShotMark[]; bout: number }) {
  const tmin = rows.length ? rows[0][0] : 0
  const tmax = Math.max(rows.length ? rows[rows.length - 1][0] : 0, ...shots.map((s) => s.t ?? 0))
  const span = Math.max(1, tmax - tmin)
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const posRef = useRef(0)
  const set = (p: number) => { posRef.current = p; setPos(p) }

  useEffect(() => {
    if (!playing) return
    let last = performance.now(), id = 0
    const step = (now: number) => {
      const next = Math.min(1, posRef.current + ((now - last) * speed) / span)
      last = now
      set(next)
      if (next >= 1) setPlaying(false)
      else id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [playing, speed, span])

  const T = tmin + pos * span
  let lo = 0, hi = rows.length - 1                                  // the last sample at or before T
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (rows[mid][0] <= T) lo = mid; else hi = mid - 1 }
  const extent = useMemo(() => legStats(rows), [rows])
  const legs = useMemo(() => legStats(rows.slice(0, lo + 1)), [rows, lo])
  const fired = shots.filter((s) => (s.t ?? 0) <= T)
  const marks = shots.map((s) => ((s.t ?? 0) - tmin) / span)
  const jump = (to: number) => { setPlaying(false); set(Math.min(1, Math.max(0, to))) }
  const prev = marks.filter((m) => m < pos - 0.003)
  const next = marks.filter((m) => m > pos + 0.003)
  const aim = rows.length ? { x: rows[lo][1], y: rows[lo][2] } : null

  if (rows.length < 2) return <p className="meta">Nothing to replay for this bout yet.</p>
  return (
    <div>
      <SensorRoute position={position} legs={legs} extent={extent} shots={fired} bout={bout} aim={aim} />
      <div className="sensor-replay">
        <button className="secondary" onClick={() => { if (playing) setPlaying(false); else { if (pos >= 1) set(0); setPlaying(true) } }}>{playing ? 'Pause' : 'Play'}</button>
        <input type="range" min={0} max={1000} value={Math.round(pos * 1000)} aria-label="Replay position"
          onChange={(e) => jump(Number(e.target.value) / 1000)} />
        <button className="secondary" aria-label="Previous shot" disabled={!prev.length && pos === 0} onClick={() => jump(prev.length ? prev[prev.length - 1] : 0)}>‹ Shot</button>
        <button className="secondary" aria-label="Next shot" disabled={!next.length} onClick={() => jump(next[0])}>Shot ›</button>
        <select aria-label="Speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEEDS.map((v) => <option key={v} value={v}>{v}×</option>)}
        </select>
      </div>
      <p className="meta" style={{ margin: '4px 0 0' }}>{((T - tmin) / 1000).toFixed(1)} s of {(span / 1000).toFixed(1)} s · {fired.length} of {shots.length} shot{shots.length === 1 ? '' : 's'} fired</p>
      <RouteLegend legs={legs} />
    </div>
  )
}
