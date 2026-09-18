import { useState } from 'react'
import type { Bout, Position, Workout } from '../lib/types'

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
    value: (b) => (b.metrics.ringTotal / Math.max(1, b.metrics.ringPossible)) * 100,
    axisMax: 100,
    tickStep: 25,
    reference: null,
    caption: 'Score out of what the target could give, averaged across each workout. Higher is better.',
    label: 'Score as a percentage of the target maximum, one point per workout, split by shooting position',
    format: (v) => `${Math.round(v)}%`,
  },
  group: {
    value: (b) => b.metrics.meanRadius,
    axisMax: 20,
    tickStep: 5,
    reference: null,
    caption: 'Mean radius of the group, averaged across each workout. Lower is tighter.',
    label: 'Group mean radius in millimetres, one point per workout, split by shooting position',
    format: (v) => `${Math.round(v)} mm`,
  },
}

/** Standing shoots against the sky, prone against the ground — blue and
 *  green read the same way a course map does. */
const SERIES_COLOUR: Record<Position, string> = {
  standing: 'var(--series-1)',
  prone: 'var(--series-3)',
}

type Granularity = 'week' | 'month' | 'year'

/** Calendar-aligned bounds for one unit of the given granularity, anchored
 *  on any date inside it. Week runs Monday to Sunday. */
function rangeFor(granularity: Granularity, anchor: Date): { start: Date; end: Date } {
  if (granularity === 'week') {
    const dayIndex = (anchor.getDay() + 6) % 7 // Monday = 0 .. Sunday = 6
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dayIndex)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999)
    return { start, end }
  }
  if (granularity === 'month') {
    return {
      start: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
      end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999),
    }
  }
  return {
    start: new Date(anchor.getFullYear(), 0, 1),
    end: new Date(anchor.getFullYear(), 11, 31, 23, 59, 59, 999),
  }
}

/** A date guaranteed to land in the next or previous unit, for rangeFor to
 *  re-align — stepping the anchor's day by a week's worth, or the month/year
 *  field by one, rather than any fixed number of days. */
function step(granularity: Granularity, anchor: Date, dir: 1 | -1): Date {
  if (granularity === 'week') return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir * 7)
  if (granularity === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1)
  return new Date(anchor.getFullYear() + dir, 0, 1)
}

function periodLabel(granularity: Granularity, start: Date, end: Date): string {
  if (granularity === 'year') return String(start.getFullYear())
  if (granularity === 'month') return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const sameMonth = start.getMonth() === end.getMonth()
  const startStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
  return `${startStr} – ${endStr}, ${end.getFullYear()}`
}

/** Ordinary least squares over a series' own points, in its normalised
 *  0..1 time units — drawn only across that series' own span, since
 *  extrapolating past the last real workout would be a guess dressed up as a
 *  line. Null when every point shares one instant, where a slope has no
 *  meaning. */
function linearTrend(points: { t: number; v: number }[]): { at: (t: number) => number } | null {
  const n = points.length
  if (n < 2) return null
  let sumT = 0, sumV = 0, sumTT = 0, sumTV = 0
  for (const p of points) {
    sumT += p.t
    sumV += p.v
    sumTT += p.t * p.t
    sumTV += p.t * p.v
  }
  const denom = n * sumTT - sumT * sumT
  if (Math.abs(denom) < 1e-9) return null
  const slope = (n * sumTV - sumT * sumV) / denom
  const intercept = (sumV - slope * sumT) / n
  return { at: (t) => slope * t + intercept }
}

const W = 640
const H = 220
// left is wide enough for the widest tick label ("100%", "100 mm" on a very
// loose group) plus the gap before the plot area — narrower clipped it off
// the left edge.
const PAD = { top: 14, right: 14, bottom: 26, left: 52 }

const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/**
 * One measure over a calendar window the chart owns and steps through
 * itself — week, month or year, moved backward and forward independently of
 * any other chart on the page — prone against standing, averaged to one
 * point per workout, since a within-workout spread is noise this view isn't
 * meant to show.
 *
 * Both series share one axis. Score is already comparable between positions;
 * group size is made comparable by expressing it against the hit zone that
 * position actually shoots at.
 */
export function TrendChart({ bouts, workouts, metric }: { bouts: Bout[]; workouts: Workout[]; metric: Metric }) {
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null)
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const spec = SPECS[metric]

  const { start: rangeStart, end: rangeEnd } = rangeFor(granularity, anchor)
  const now = new Date()
  const isCurrent = now >= rangeStart && now <= rangeEnd

  const t0 = rangeStart.getTime()
  const t1 = rangeEnd.getTime()
  const span = Math.max(t1 - t0, 1)
  const t = (iso: string) => (new Date(iso).getTime() - t0) / span
  const inRange = (iso: string) => {
    const tt = new Date(iso).getTime()
    return tt >= t0 && tt <= t1
  }

  const rangedWorkouts = workouts.filter((w) => inRange(w.startedAt))
  const boutsByWorkout = new Map<string, Bout[]>()
  for (const b of bouts) {
    if (!inRange(b.shotAt)) continue
    const list = boutsByWorkout.get(b.workoutId)
    if (list) list.push(b)
    else boutsByWorkout.set(b.workoutId, [b])
  }

  const series = (['prone', 'standing'] as Position[])
    .map((position) => ({
      position,
      colour: SERIES_COLOUR[position],
      points: rangedWorkouts
        .map((w) => {
          const own = (boutsByWorkout.get(w.id) ?? []).filter((b) => b.position === position)
          if (own.length === 0) return null
          const v = own.reduce((sum, b) => sum + spec.value(b), 0) / own.length
          return { t: t(w.startedAt), v, workout: w, bouts: own }
        })
        .filter((p): p is { t: number; v: number; workout: Workout; bouts: Bout[] } => p !== null)
        .sort((a, b) => a.t - b.t),
    }))
    .filter((s) => s.points.length > 0)

  const peak = Math.max(spec.axisMax, ...series.flatMap((s) => s.points.map((p) => p.v)))
  const yMax = Math.ceil(peak / spec.tickStep) * spec.tickStep

  const sx = (tt: number) => PAD.left + Math.min(1, Math.max(0, tt)) * (W - PAD.left - PAD.right)
  const sy = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom)

  const ticks = Array.from({ length: Math.round(yMax / spec.tickStep) + 1 }, (_, i) => i * spec.tickStep)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 260, margin: '0 auto' }}>
        <button
          type="button" aria-label="Previous period"
          onClick={() => setAnchor(step(granularity, anchor, -1))}
          className="secondary"
          style={{ width: 22, height: 22, flex: 'none', padding: 0, fontSize: 12, borderRadius: 6 }}
        >‹</button>
        <div className="seg" style={{ flex: 1, gap: 4 }}>
          {(['week', 'month', 'year'] as Granularity[]).map((g) => (
            <button
              key={g} type="button" aria-pressed={granularity === g}
              onClick={() => { setGranularity(g); setAnchor(new Date()) }}
              style={{ padding: '4px 6px', borderRadius: 6, fontSize: 11 }}
            >
              {g === 'week' ? 'Week' : g === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </div>
        <button
          type="button" aria-label="Next period" disabled={isCurrent}
          onClick={() => setAnchor(step(granularity, anchor, 1))}
          className="secondary"
          style={{ width: 22, height: 22, flex: 'none', padding: 0, fontSize: 12, borderRadius: 6, opacity: isCurrent ? 0.4 : 1 }}
        >›</button>
      </div>
      <p className="meta" style={{ textAlign: 'center', margin: '6px 0 12px' }}>
        {periodLabel(granularity, rangeStart, rangeEnd)}
      </p>

      {series.length === 0 ? (
        <p className="meta">Nothing logged in this window.</p>
      ) : (
        <>
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
                  {spec.format(v)}
                </text>
              </g>
            ))}

            <text x={PAD.left} y={H - 6} fontSize={11} fill="var(--text-muted)">
              {fmtDate(rangeStart)}
            </text>
            <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={11} fill="var(--text-muted)">
              {fmtDate(rangeEnd)}
            </text>

            {series.map((s) => {
              const trend = linearTrend(s.points)
              const tMin = s.points[0].t
              const tMax = s.points[s.points.length - 1].t
              return (
                <g key={s.position}>
                  {s.points.length > 1 && (
                    <path
                      d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.t)},${sy(p.v)}`).join(' ')}
                      fill="none" stroke={s.colour} strokeWidth={2}
                      strokeLinejoin="round" strokeLinecap="round"
                    />
                  )}
                  {trend && (
                    <line
                      x1={sx(tMin)} y1={sy(trend.at(tMin))} x2={sx(tMax)} y2={sy(trend.at(tMax))}
                      stroke={s.colour} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.55}
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
                          label: `${fmtDate(new Date(p.workout.startedAt))} · ${s.position} · ${spec.format(p.v)} · ${p.bouts.length} bout${p.bouts.length === 1 ? '' : 's'}`,
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
              )
            })}

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
            <span>{spec.caption} Dashed line is the trend.</span>
          </div>
        </>
      )}
    </div>
  )
}
