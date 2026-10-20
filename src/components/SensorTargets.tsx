import { DISC_DIAMETER_MM, TARGET_NAMES, targetCentre, TARGET_SPACING_MM, type Point } from '../lib/sensor'
import type { Position } from '../lib/types'

/** One shot on the targets, in millimetres (+x right, +y up, origin at Charlie). */
export interface ShotMark { n: number; x: number; y: number; hit: boolean }

/** Where the calibration is: which targets are part of it and how many pulls each has had. */
export interface GuideState {
  /** Target index (0 = Alpha) to aim at now. */
  current: number
  /** Pulls wanted and taken per target index. */
  total: Record<number, number>
  taken: Record<number, number>
}

/** The five targets, the aim point, its recent trace, the shots, and (while calibrating) a guide: AIM HERE on the target in turn, a dot per
 *  pull, a tick on a finished target, the others dimmed. SVG in millimetres, in the app's own colours. */
export function SensorTargets({ position, aim, trace, shots, guide }: {
  position: Position
  aim: Point | null
  trace: Point[]
  shots: ShotMark[]
  guide: GuideState | null
}) {
  const disc = DISC_DIAMETER_MM[position] / 2
  const board = TARGET_SPACING_MM * 0.46
  const sy = (y: number) => -y                       // the SVG's y runs down; the target's runs up
  const line = trace.map((p) => `${p.x.toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ')
  return (
    <svg className="sensor-targets" viewBox="-80 -26 160 56" role="img" aria-label="The five targets with the aim point">
      {[0, 1, 2, 3, 4].map((i) => {
        const c = targetCentre(i)
        const inGuide = guide ? i in guide.total : false
        const dim = guide !== null && !inGuide
        const taken = guide?.taken[i] ?? 0, total = guide?.total[i] ?? 0
        const done = inGuide && taken >= total
        const now = guide?.current === i
        return (
          <g key={i} opacity={dim ? 0.3 : 1}>
            <circle cx={c.x} cy={0} r={board} className="st-board" />
            <circle cx={c.x} cy={0} r={Math.max(disc, 1.2)} className="st-disc" />
            {now && <circle cx={c.x} cy={0} r={board + 1.4} className="st-now" />}
            {now && <text x={c.x} y={-board - 3} className="st-aimhere" textAnchor="middle">Aim here</text>}
            <text x={c.x} y={board + 6} className="st-name" textAnchor="middle">{TARGET_NAMES[i]}</text>
            {inGuide && Array.from({ length: total }, (_, k) => (
              <circle key={k} cx={c.x + (k - (total - 1) / 2) * 3.4} cy={board + 10.5} r={1.1} className={k < taken ? 'st-pull done' : 'st-pull'} />
            ))}
            {done && (
              <g>
                <circle cx={c.x + board * 0.72} cy={-board * 0.72} r={2.6} className="st-tick" />
                <path d={`M${c.x + board * 0.72 - 1.1},${-board * 0.72} l0.9,0.9 l1.7,-1.8`} className="st-tickmark" />
              </g>
            )}
          </g>
        )
      })}
      {line && <polyline points={line} className="st-trace" />}
      {shots.map((s) => (
        <g key={s.n}>
          <circle cx={s.x} cy={sy(s.y)} r={1.9} className={s.hit ? 'st-shot hit' : 'st-shot miss'} />
          <text x={s.x} y={sy(s.y) + 0.7} className="st-shotn" textAnchor="middle">{s.n}</text>
        </g>
      ))}
      {aim && (
        <g className="st-aim">
          <circle cx={aim.x} cy={sy(aim.y)} r={1.6} />
          <path d={`M${aim.x - 3},${sy(aim.y)} h6 M${aim.x},${sy(aim.y) - 3} v6`} />
        </g>
      )}
    </svg>
  )
}
