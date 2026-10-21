import { useMemo, useState } from 'react'
import { TARGET_NAMES } from '../lib/sensor'
import { legsOf, rowsFromLegs, sensorBouts, sensorLine } from '../lib/sensorStats'
import type { SensorSession, SensorShot } from '../lib/types'
import { DryfireIcon } from './icons'
import { SensorReplay } from './SensorReplay'
import { RouteLegend, SensorRoute } from './SensorRoute'
import type { ShotMark } from './SensorTargets'

const fmtTime = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** The shots of a bout as marks on the route picture; `t` is when each was fired within the bout, so a replay can place them. */
function marksOf(shots: SensorShot[]): ShotMark[] {
  let t = 0
  return shots.map((s) => { t += s.legMs; return { n: s.n, x: s.x, y: s.y, hit: s.hit, t } })
}

/** A saved sensor session: how it went, and for each bout of five the route of the rifle to every shot, with a replay
 *  of that route and the shots in a table. The replay plays the saved, simplified route, not the raw trace. */
export function SensorSessionCard({ session, onDelete }: { session: SensorSession; onDelete?: () => void }) {
  const bouts = useMemo(() => sensorBouts(session.shots), [session.shots])
  const [bout, setBout] = useState(0)
  const [replay, setReplay] = useState(false)
  const shown = bouts[Math.min(bout, bouts.length - 1)]
  const legs = useMemo(() => legsOf(shown?.shots ?? []), [shown])
  const marks = useMemo(() => marksOf(shown?.shots ?? []), [shown])
  const rows = useMemo(() => rowsFromLegs(shown?.shots ?? []), [shown])
  if (!shown) return null
  const holds = shown.shots.map((s) => s.hold).filter((h): h is number => h !== null)
  const hold = holds.length ? (holds.reduce((a, b) => a + b, 0) / holds.length) * 10 : null     // 5 m millimetres to the 50 m range

  return (
    <div className="card">
      <div className="sensor-head">
        <DryfireIcon size={26} />
        <div>
          <h3 style={{ margin: 0 }}>Sensor session</h3>
          <p className="meta" style={{ margin: 0 }}>{sensorLine(session)} · {session.minutes} min</p>
        </div>
      </div>

      <div className="sensor-route-head" style={{ marginTop: 10 }}>
        <h3>Route to each shot</h3>
        <button className="secondary" onClick={() => setReplay(!replay)}>{replay ? 'Route' : 'Replay'}</button>
        {bouts.length > 1 && (
          <div className="seg" role="group" aria-label="Bout">
            {bouts.map((_, b) => <button key={b} aria-pressed={bout === b} onClick={() => { setBout(b); setReplay(false) }}>{b + 1}</button>)}
          </div>
        )}
      </div>
      {replay
        ? <SensorReplay key={bout} position={session.position} rows={rows} shots={marks} bout={bout} />
        : <><SensorRoute position={session.position} legs={legs} shots={marks} bout={bout} /><RouteLegend legs={legs} /></>}

      <div className="sensor-bout" style={{ marginTop: 8 }}>
        <span className="meta">Bout {bout + 1}</span>
        {shown.shots.map((s) => <span key={s.n} className={`sensor-chip ${s.hit ? 'hit' : 'miss'}`}>{TARGET_NAMES[s.target][0]}{s.hit ? ' ✓' : ''}</span>)}
        <span className="meta">{shown.shots.filter((s) => s.hit).length} of {shown.shots.length}{hold !== null && ` · steadiness ${Math.round(hold)} mm at 50 m`}</span>
      </div>

      <details style={{ marginTop: 8 }}>
        <summary className="meta" style={{ cursor: 'pointer' }}>Show the shots</summary>
        <table className="sensor-table">
          <thead><tr><th>Shot</th><th>Target</th><th>Result</th><th>Time to shot</th><th>Steadiness</th></tr></thead>
          <tbody>
            {session.shots.map((s) => (
              <tr key={s.n}>
                <td>{s.n}</td><td>{TARGET_NAMES[s.target]}</td><td>{s.hit ? 'Hit' : 'Miss'}</td>
                <td>{fmtTime(s.legMs)}</td><td>{s.hold === null ? '–' : `${Math.round(s.hold * 10)} mm`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="meta" style={{ marginTop: 4 }}>Steadiness is how much the aim wandered in the second before the pull, in millimetres on the 50 m range. Lower is steadier.</p>
      </details>
      {onDelete && <p style={{ margin: '8px 0 0' }}><button className="link" onClick={onDelete}>Remove this sensor session</button></p>}
    </div>
  )
}
