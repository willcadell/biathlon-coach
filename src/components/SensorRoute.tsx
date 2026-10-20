import { DISC_DIAMETER_MM, TARGET_NAMES, TARGET_SPACING_MM, targetCentre, type LegStats } from '../lib/sensor'
import type { Position } from '../lib/types'
import type { ShotMark } from './SensorTargets'

const LEG_COLOURS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', '#9b59d0', '#d4a017']
const legColour = (leg: number) => LEG_COLOURS[leg % LEG_COLOURS.length]

/** The zoomed-out route of the rifle: every leg (the way from one shot to the next) as a few straight, arrowed segments, in a colour of its
 *  own, over the five targets and the shots. The picture is sized to the routes, so a rifle that wandered far still shows. */
export function SensorRoute({ position, legs, shots, bout, extent, aim }: {
  position: Position
  legs: Map<number, LegStats>
  shots: ShotMark[]
  bout: number
  /** The legs that set the size of the picture, when it is to stay put while the route is drawn bit by bit (a replay). */
  extent?: Map<number, LegStats>
  /** Where the rifle points now (a replay). */
  aim?: { x: number; y: number } | null
}) {
  let minX = -80, maxX = 80, minY = -45, maxY = 45
  for (const { points } of (extent ?? legs).values()) for (const { x, y } of points) {
    if (Math.abs(x) > 250 || Math.abs(y) > 200) continue         // a rifle lowered out of the picture would squash everything else
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const aspect = 16 / 7
  const halfW = Math.max(((maxX - minX) / 2) * 1.1, ((maxY - minY) / 2) * 1.1 * aspect)
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const k = halfW / 80                                            // one "pixel" of the 160-unit-wide default picture
  const board = TARGET_SPACING_MM * 0.46
  const disc = Math.max(DISC_DIAMETER_MM[position] / 2, 1.6 * k)
  const sy = (y: number) => -y
  const arrow = 1.5 * k
  return (
    <svg className="sensor-targets" viewBox={`${cx - halfW} ${-cy - halfW / aspect} ${halfW * 2} ${(halfW * 2) / aspect}`} role="img" aria-label="The route of the rifle to each shot">
      {[0, 1, 2, 3, 4].map((i) => {
        const c = targetCentre(i)
        return (
          <g key={i}>
            <circle cx={c.x} cy={0} r={board} className="st-board" vectorEffect="non-scaling-stroke" />
            <circle cx={c.x} cy={0} r={disc} className="st-disc" />
            <text x={c.x} y={board + 5.5 * k} className="st-name" textAnchor="middle" style={{ fontSize: 4 * k }}>{TARGET_NAMES[i][0]}</text>
          </g>
        )
      })}
      {[...legs].map(([leg, { points }]) => {
        if (points.length < 2) return null
        const colour = legColour(leg)
        return (
          <g key={leg} style={{ color: colour }}>
            <polyline points={points.map((p) => `${p.x.toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ')} className="st-leg" vectorEffect="non-scaling-stroke" />
            {points.slice(1).map((p, i) => {
              const a = points[i]
              if (Math.hypot(p.x - a.x, p.y - a.y) < 6) return null    // an arrowhead only on a segment long enough to show
              const mx = (a.x + p.x) / 2, my = sy((a.y + p.y) / 2), ang = Math.atan2(sy(p.y) - sy(a.y), p.x - a.x)
              const pt = (da: number, r: number) => `${(mx + Math.cos(ang + da) * r).toFixed(2)},${(my + Math.sin(ang + da) * r).toFixed(2)}`
              return <polygon key={i} points={`${pt(0, arrow)} ${pt(2.5, arrow)} ${pt(-2.5, arrow)}`} className="st-arrow" />
            })}
          </g>
        )
      })}
      {shots.map((s) => (
        <g key={s.n}>
          <circle cx={s.x} cy={sy(s.y)} r={2.6 * k} className={s.hit ? 'st-shot hit' : 'st-shot miss'} />
          <text x={s.x} y={sy(s.y) + 0.9 * k} className="st-shotn" textAnchor="middle" style={{ fontSize: 3.2 * k }}>{s.n}</text>
        </g>
      ))}
      {aim && (
        <g className="st-aim">
          <circle cx={aim.x} cy={sy(aim.y)} r={1.6 * k} />
          <path d={`M${aim.x - 3 * k},${sy(aim.y)} h${6 * k} M${aim.x},${sy(aim.y) - 3 * k} v${6 * k}`} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {legs.size === 0 && <text x={cx} y={-cy} className="st-name" textAnchor="middle" style={{ fontSize: 4.5 * k }}>{`The route of bout ${bout + 1} appears as you shoot.`}</text>}
    </svg>
  )
}

/** The key under the route: a colour per leg, how long it took and how far the rifle travelled (straight-line in brackets). */
export function RouteLegend({ legs }: { legs: Map<number, LegStats> }) {
  return (
    <div className="sensor-legend">
      {[...legs].map(([leg, s]) => (
        <span key={leg} className="meta"><i style={{ background: legColour(leg) }} />To shot {leg + 1}: {(s.ms / 1000).toFixed(1)} s, {Math.round(s.path)} mm travelled ({Math.round(s.straight)} straight)</span>
      ))}
    </div>
  )
}
