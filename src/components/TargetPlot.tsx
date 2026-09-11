import type { BoutMetrics, Position, Shot, TargetFace } from '../lib/types'
import { HIT_ZONE_MM } from '../lib/types'
import { ringRadii } from '../lib/scoring'

interface Props {
  shots: Shot[]
  position: Position
  metrics: BoutMetrics
  face: TargetFace
  bulletDiameterMm: number
  size?: number
}

/**
 * The bout drawn on its target face: scoring rings, where the shots went, and
 * where the group centre sits.
 *
 * Holes are drawn at their true diameter, because the inward-gauge rule is
 * about the edge of the hole and a dot in the middle hides why a shot scored
 * what it did.
 */
export function TargetPlot({ shots, position, metrics, face, bulletDiameterMm, size = 320 }: Props) {
  const radii = ringRadii(face)
  const blackRadius = face.blackMm / 2
  const hitRadius = HIT_ZONE_MM[position] / 2
  const bulletRadius = bulletDiameterMm / 2

  const furthest = shots.reduce((m, s) => Math.max(m, Math.hypot(s.mm.x, s.mm.y)), 0)
  // Always show at least the black plus one ring, so the picture is recognisable
  // whether the bout was a tight ten or scattered off the paper.
  const extent = Math.max(blackRadius * 1.15, furthest + bulletRadius * 2, radii[0] * 3)
  const vb = extent * 2

  const px = (mm: number) => extent + mm
  const py = (mm: number) => extent - mm
  const hair = vb / 380

  const e = metrics.ellipse
  const showEllipse = e.major > 0.5 && shots.length >= 3
  // Only label a ring when there is room between its line and the next one in.
  const labelStep = vb / 22

  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      width={size}
      height={size}
      style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
      role="img"
      aria-label={`${shots.length} shots scoring ${metrics.ringTotal} of ${metrics.ringPossible} on the ${face.name} face`}
    >
      {/* The solid black aiming area. */}
      <circle cx={extent} cy={extent} r={blackRadius} fill="var(--mark-fill)" />

      {radii.map((r, i) => {
        const value = 10 - i
        // Rings past the edge of the drawing would leave a label with no line.
        if (r > extent) return null
        const inBlack = r <= blackRadius
        return (
          <g key={value}>
            <circle
              cx={extent} cy={extent} r={r} fill="none"
              stroke={inBlack ? 'var(--mark-line)' : 'var(--grid)'}
              strokeWidth={hair}
            />
            {value < 10 && face.ringSpacingMm > labelStep && (
              <text
                x={extent} y={py(-(r - face.ringSpacingMm / 2))}
                textAnchor="middle" dominantBaseline="central"
                fontSize={vb / 30}
                fill={inBlack ? 'var(--mark-line)' : 'var(--text-muted)'}
              >
                {value}
              </text>
            )}
          </g>
        )
      })}

      {/* What this group would have done against the metal in a race. */}
      {hitRadius < extent && (
        <circle
          cx={extent} cy={extent} r={hitRadius} fill="none"
          stroke="var(--series-1)" strokeOpacity={0.75} strokeWidth={hair * 2}
          strokeDasharray={`${vb / 70} ${vb / 100}`}
        />
      )}

      {/* One standard deviation of the group, showing which way it is strung. */}
      {showEllipse && (
        <ellipse
          cx={px(metrics.mpi.x)} cy={py(metrics.mpi.y)}
          rx={Math.max(e.major, 0.5)} ry={Math.max(e.minor, 0.5)}
          transform={`rotate(${-e.angleDeg} ${px(metrics.mpi.x)} ${py(metrics.mpi.y)})`}
          fill="none" stroke="var(--series-2)" strokeWidth={hair * 2}
          strokeDasharray={`${vb / 90} ${vb / 130}`}
        />
      )}

      {/* Group centre. */}
      <g stroke="var(--series-2)" strokeWidth={hair * 3} strokeLinecap="round">
        <line x1={px(metrics.mpi.x) - vb / 45} y1={py(metrics.mpi.y)} x2={px(metrics.mpi.x) + vb / 45} y2={py(metrics.mpi.y)} />
        <line x1={px(metrics.mpi.x)} y1={py(metrics.mpi.y) - vb / 45} x2={px(metrics.mpi.x)} y2={py(metrics.mpi.y) + vb / 45} />
      </g>

      {shots.map((s, i) => {
        const ring = metrics.rings[i]
        const isFlier = metrics.flierIndex === i
        return (
          <g key={i}>
            <circle
              cx={px(s.mm.x)} cy={py(s.mm.y)} r={bulletRadius}
              fill={isFlier ? 'var(--critical)' : 'var(--series-1)'}
              fillOpacity={0.9}
              stroke="var(--surface-1)" strokeWidth={hair * 1.5}
            />
            {ring?.borderline && (
              <circle
                cx={px(s.mm.x)} cy={py(s.mm.y)} r={bulletRadius + hair * 4}
                fill="none" stroke="var(--warning)" strokeWidth={hair * 2}
              />
            )}
            {/* Firing order, not the ring value: the rings are drawn, so a
                shot's score can be read off the picture, but the order it was
                fired in cannot. */}
            <text
              x={px(s.mm.x)} y={py(s.mm.y)} fill="#fff"
              fontSize={Math.min(bulletRadius * 1.4, vb / 26)} fontWeight={700}
              textAnchor="middle" dominantBaseline="central"
            >
              {s.order}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
