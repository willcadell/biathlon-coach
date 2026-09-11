import { useState } from 'react'
import type { Bout, Position } from '../lib/types'
import { HIT_ZONE_MM } from '../lib/types'

export type Metric = 'score' | 'group'

interface Spec {
  /** Value for one bout, on this metric's own scale. */
  value: (b: Bout) => number
  axisMax: number
  tickStep: number
  /** A meaningful line to draw across the plot, or null. */
  reference: number | null
  caption: string
  label: string
  format: (v: number) => string
}

const SPECS: Record<Metric, Spec> = {
  score: {
    value: (b) => b.metrics.ringTotal / Math.max(1, b.shots.length),
    axisMax: 10,
    tickStep: 2,
    reference: null,
    caption: 'Points per shot. Higher is better.',
    label: 'Average ring value per shot, over time, split by shooting position',
    format: (v) => v.toFixed(1),
  },
  group: {
    value: (b) => (b.metrics.meanRadius / (HIT_ZONE_MM[b.position] / 2)) * 100,
    axisMax: 100,
    tickStep: 25,
    reference: 100,
    caption: 'Group size against the metal you would face in a race. Lower is tighter.',
    label: 'Group size as a percentage of the biathlon hit-zone radius, over time, split by shooting position',
    format: (v) => `${Math.round(v)}%`,
  },
}

const SERIES_COLOUR: Record<Position, string> = {
  prone: 'var(--series-1)',
  standing: 'var(--series-2)',
}

const W = 640
const H = 220
const PAD = { top: 14, right: 14, bottom: 26, left: 38 }

/**
 * One measure over time, prone against standing.
 *
 * Both series share one axis. Score is already comparable between positions;
 * group size is made comparable by expressing it against the hit zone that
 * position actually shoots at.
 */
export function TrendChart({ bouts, metric }: { bouts: Bout[]; metric: Metric }) {
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null)
  const spec = SPECS[metric]

  const ordered = [...bouts].sort((a, b) => a.shotAt.localeCompare(b.shotAt))
  if (ordered.length < 2) return null

  const t0 = new Date(ordered[0].shotAt).getTime()
  const t1 = new Date(ordered[ordered.length - 1].shotAt).getTime()
  const span = Math.max(t1 - t0, 1)

  const series = (['prone', 'standing'] as Position[])
    .map((position) => ({
      position,
      colour: SERIES_COLOUR[position],
      points: ordered
        .filter((b) => b.position === position)
        .map((b) => ({
          t: (new Date(b.shotAt).getTime() - t0) / span,
          v: spec.value(b),
          bout: b,
        })),
    }))
    .filter((s) => s.points.length > 0)

  const peak = Math.max(spec.axisMax, ...series.flatMap((s) => s.points.map((p) => p.v)))
  const yMax = Math.ceil(peak / spec.tickStep) * spec.tickStep

  const sx = (t: number) => PAD.left + t * (W - PAD.left - PAD.right)
  const sy = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom)

  const ticks = Array.from({ length: Math.round(yMax / spec.tickStep) + 1 }, (_, i) => i * spec.tickStep)
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={spec.label}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} y1={sy(v)} x2={W - PAD.right} y2={sy(v)}
              stroke={v === spec.reference ? 'var(--axis)' : 'var(--grid)'}
              strokeWidth={v === spec.reference ? 1.5 : 1}
              strokeDasharray={v === spec.reference ? '4 3' : undefined} />
            <text x={PAD.left - 6} y={sy(v)} textAnchor="end" dominantBaseline="central"
              fontSize={11} fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {v}
            </text>
          </g>
        ))}

        <text x={PAD.left} y={H - 6} fontSize={11} fill="var(--text-muted)">
          {fmtDate(ordered[0].shotAt)}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={11} fill="var(--text-muted)">
          {fmtDate(ordered[ordered.length - 1].shotAt)}
        </text>

        {series.map((s) => (
          <g key={s.position}>
            {s.points.length > 1 && (
              <path
                d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.t)},${sy(p.v)}`).join(' ')}
                fill="none" stroke={s.colour} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round"
              />
            )}
            {s.points.map((p, i) => (
              <circle
                key={i} cx={sx(p.t)} cy={sy(p.v)} r={5}
                fill={s.colour} stroke="var(--surface-1)" strokeWidth={2}
                onMouseEnter={() =>
                  setHover({
                    x: sx(p.t),
                    y: sy(p.v),
                    label: `${fmtDate(p.bout.shotAt)} · ${s.position} · ${spec.format(p.v)} · ${p.bout.metrics.ringTotal}/${p.bout.metrics.ringPossible}`,
                  })
                }
              />
            ))}
            {/* Direct label on the last point, so identity never rests on colour. */}
            <text
              x={sx(s.points[s.points.length - 1].t) - 8}
              y={sy(s.points[s.points.length - 1].v) - 10}
              textAnchor="end" fontSize={11} fontWeight={600} fill="var(--text-secondary)"
            >
              {s.position}
            </text>
          </g>
        ))}

        {hover && (
          <g pointerEvents="none">
            <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={H - PAD.bottom}
              stroke="var(--axis)" strokeWidth={1} />
            <rect
              x={Math.min(Math.max(hover.x - 100, 2), W - 202)}
              y={Math.max(hover.y - 34, 2)}
              width={200} height={24} rx={6}
              fill="var(--surface-1)" stroke="var(--border)"
            />
            <text
              x={Math.min(Math.max(hover.x - 100, 2), W - 202) + 8}
              y={Math.max(hover.y - 34, 2) + 12}
              dominantBaseline="central" fontSize={11} fill="var(--text-primary)"
            >
              {hover.label}
            </text>
          </g>
        )}
      </svg>

      <div className="legend">
        {series.map((s) => (
          <span key={s.position}>
            <i className="swatch" style={{ background: s.colour }} /> {s.position}
          </span>
        ))}
        <span>{spec.caption}</span>
      </div>
    </div>
  )
}
