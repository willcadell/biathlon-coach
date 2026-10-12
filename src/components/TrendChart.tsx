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
  /** The caption for the per-bout view, where nothing is averaged. */
  captionRecent: string
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
    captionRecent: 'Score out of what the target could give, one mark per bout. Higher is better.',
    label: 'Score as a percentage of the target maximum, one point per workout, split by shooting position',
    format: (v) => `${Math.round(v)}%`,
  },
  group: {
    value: (b) => b.metrics.meanRadius,
    axisMax: 20,
    tickStep: 5,
    reference: null,
    caption: 'Mean radius of the group, averaged across each workout. Lower is tighter.',
    captionRecent: 'Mean radius of the group, one mark per bout. Lower is tighter.',
    label: 'Group mean radius in millimetres, one point per workout, split by shooting position',
    format: (v) => `${Math.round(v)} mm`,
  },
}

/** Every point is range shooting, so one colour: the Range blue the rest of the
 *  app uses for it. Position is told apart by the SHAPE of the marker (a circle
 *  for prone, a diamond for standing), never by borrowing colours that mean a
 *  session type elsewhere (blue is Range, green is Dry-fire). */
const SERIES_COLOUR = 'var(--series-1)'
const MARKER: Record<Position, 'circle' | 'diamond'> = { prone: 'circle', standing: 'diamond' }

/** How many of the most recent bouts the default view shows. */
const RECENT_BOUTS = 10
/** A trend line needs this many points of one position; below it, two or
 *  three dots joined by a line is the data, not a trend. */
const MIN_TREND_POINTS = 5

type Granularity = 'week' | 'month' | 'year'
type View = 'recent' | Granularity

/** The views are rolling windows that end on the anchor day: the last 7 days,
 *  the last 4 weeks, the last 12 months. Not calendar weeks or months, which
 *  start the window at the first of the month with a few days' data in it. */
const WINDOW_LABEL: Record<Granularity, { short: string; long: string }> = {
  week: { short: '7 days', long: '7 days' },
  month: { short: '4 weeks', long: '4 weeks' },
  year: { short: '12 months', long: '12 months' },
}

/** The window of the given length ending on the anchor's day (inclusive). */
function rangeFor(granularity: Granularity, anchor: Date): { start: Date; end: Date } {
  const end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 23, 59, 59, 999)
  if (granularity === 'week') {
    return { start: new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6), end }
  }
  if (granularity === 'month') {
    return { start: new Date(end.getFullYear(), end.getMonth(), end.getDate() - 27), end }
  }
  // 12 months: from the day after this date a year ago.
  return { start: new Date(end.getFullYear() - 1, end.getMonth(), end.getDate() + 1), end }
}

/** The anchor moved one whole window back or forward, so each step lands on
 *  the window just before or after the one on screen. */
function step(granularity: Granularity, anchor: Date, dir: 1 | -1): Date {
  if (granularity === 'week') return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir * 7)
  if (granularity === 'month') return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir * 28)
  return new Date(anchor.getFullYear() + dir, anchor.getMonth(), anchor.getDate())
}

/** "Last 7 days" for the window ending today, otherwise "7 days to 3 Oct",
 *  with the dates beside it. */
function periodLabel(granularity: Granularity, start: Date, end: Date, isCurrent: boolean): string {
  const withYear = granularity === 'year'
  const fmt = (d: Date) => d.toLocaleDateString(undefined, withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' })
  const name = WINDOW_LABEL[granularity].long
  return `${isCurrent ? `Last ${name}` : `${name} to ${fmt(end)}`} · ${fmt(start)} – ${fmt(end)}`
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
/** Axis end labels carry the year in the 12-month view, where the same month
 *  appears at both ends. */
const fmtAxisDate = (d: Date, withYear: boolean) =>
  d.toLocaleDateString(undefined, withYear ? { month: 'short', day: 'numeric', year: '2-digit' } : { month: 'short', day: 'numeric' })

/** One drawn mark: a circle for prone, a diamond for standing, in the series
 *  colour with a surface ring so overlapping marks stay readable. */
function PositionMarker({ position, x, y, r = 6 }: { position: Position; x: number; y: number; r?: number }) {
  return MARKER[position] === 'circle' ? (
    <circle cx={x} cy={y} r={r} fill={SERIES_COLOUR} stroke="var(--surface-1)" strokeWidth={2} />
  ) : (
    <rect
      x={x - r * 0.9} y={y - r * 0.9} width={r * 1.8} height={r * 1.8} rx={1}
      transform={`rotate(45 ${x} ${y})`} fill={SERIES_COLOUR} stroke="var(--surface-1)" strokeWidth={2}
    />
  )
}

interface PlotPoint {
  key: string
  /** 0..1 across the plot. */
  tt: number
  v: number
  position: Position
  at: Date
  /** Bouts this point stands for (1 in the recent view). */
  count: number
  /** What to call it when it stands for a stretch of time ("Oct 2026"), in
   *  place of a single date. */
  period?: string
}

/**
 * One measure for the athlete's bouts, prone against standing.
 *
 * The default view is the last ten bouts, one dot per bout in the order they
 * were shot, each with its value written beside it: most athletes have a
 * handful of bouts, and a calendar axis with three dots in the left third of an
 * empty month says less than the three numbers. A single bout is a stat tile,
 * not a chart. Week, Month and Year views remain for anyone with enough data to
 * want them, stepping through the calendar and averaged to one point per
 * workout.
 *
 * A trend line (and the previous period's ghost) is only drawn from five
 * points of a position: fewer than that is the data, not a trend.
 */
export function TrendChart({ bouts, workouts, metric }: { bouts: Bout[]; workouts: Workout[]; metric: Metric }) {
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null)
  const [view, setView] = useState<View>('recent')
  const [anchor, setAnchor] = useState(() => new Date())
  const spec = SPECS[metric]
  const calendar = view !== 'recent'
  const granularity: Granularity = calendar ? view : 'month'

  const { start: rangeStart, end: rangeEnd } = rangeFor(granularity, anchor)
  const now = new Date()
  const isCurrent = now >= rangeStart && now <= rangeEnd

  type CalPoint = { t: number; v: number; workout: Workout; bouts: Bout[] }

  /** Calendar views: one point per workout per position inside [start, end]. */
  const buildSeries = (start: Date, end: Date) => {
    const a = start.getTime()
    const span = Math.max(end.getTime() - a, 1)
    const within = (iso: string) => {
      const tt = new Date(iso).getTime()
      return tt >= a && tt <= end.getTime()
    }
    const byWorkout = new Map<string, Bout[]>()
    for (const b of bouts) {
      if (!within(b.shotAt)) continue
      const list = byWorkout.get(b.workoutId)
      if (list) list.push(b)
      else byWorkout.set(b.workoutId, [b])
    }
    return (['prone', 'standing'] as Position[])
      .map((position) => ({
        position,
        points: workouts
          .filter((w) => within(w.startedAt))
          .map((w) => {
            const own = (byWorkout.get(w.id) ?? []).filter((b) => b.position === position)
            if (own.length === 0) return null
            const v = own.reduce((sum, b) => sum + spec.value(b), 0) / own.length
            return { t: (new Date(w.startedAt).getTime() - a) / span, v, workout: w, bouts: own }
          })
          .filter((p): p is CalPoint => p !== null)
          .sort((x, y) => x.t - y.t),
      }))
      .filter((s) => s.points.length > 0)
  }

  // The points on the plot, whichever view.
  let pts: PlotPoint[]
  if (!calendar) {
    const recent = [...bouts].sort((x, y) => x.shotAt.localeCompare(y.shotAt)).slice(-RECENT_BOUTS)
    const n = recent.length
    pts = recent.map((b, i) => ({
      key: b.id, tt: n === 1 ? 0.5 : 0.04 + (i / (n - 1)) * 0.92, v: spec.value(b), position: b.position, at: new Date(b.shotAt), count: 1,
    }))
  } else if (granularity === 'year') {
    // Twelve months is too many workouts to read as separate marks: one mark per
    // position per month, averaged over that month's bouts.
    const a = rangeStart.getTime()
    const span = Math.max(rangeEnd.getTime() - a, 1)
    pts = buildSeries(rangeStart, rangeEnd).flatMap((s) => {
      const months = new Map<string, { sum: number; n: number; first: Date }>()
      for (const p of s.points) {
        const d = new Date(p.workout.startedAt)
        const k = `${d.getFullYear()}-${d.getMonth()}`
        const m = months.get(k) ?? { sum: 0, n: 0, first: d }
        for (const b of p.bouts) { m.sum += spec.value(b); m.n++ }
        months.set(k, m)
      }
      return [...months.entries()].map(([k, m]) => {
        // the mark sits mid-month, kept inside the window
        const mid = new Date(m.first.getFullYear(), m.first.getMonth(), 15)
        const at = new Date(Math.min(Math.max(mid.getTime(), a), rangeEnd.getTime()))
        return {
          key: `${s.position}-${k}`, tt: (at.getTime() - a) / span, v: m.sum / m.n, position: s.position,
          at, count: m.n, period: mid.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        }
      })
    })
  } else {
    pts = buildSeries(rangeStart, rangeEnd).flatMap((s) =>
      s.points.map((p) => ({ key: `${s.position}-${p.workout.id}`, tt: p.t, v: p.v, position: s.position, at: new Date(p.workout.startedAt), count: p.bouts.length })),
    )
  }
  const byPosition = (['prone', 'standing'] as Position[])
    .map((position) => ({ position, points: pts.filter((p) => p.position === position).sort((x, y) => x.tt - y.tt) }))
    .filter((s) => s.points.length > 0)

  // The previous period, only in the calendar views, and only where it had
  // enough points to be a real slope.
  const ghosts = !calendar ? [] : buildSeries(
    rangeFor(granularity, step(granularity, anchor, -1)).start,
    rangeFor(granularity, step(granularity, anchor, -1)).end,
  ).flatMap((s) => {
    if (s.points.length < MIN_TREND_POINTS) return []
    const trend = linearTrend(s.points)
    if (!trend) return []
    const tMin = s.points[0].t
    const tMax = s.points[s.points.length - 1].t
    return [{ position: s.position, tMin, tMax, vMin: trend.at(tMin), vMax: trend.at(tMax) }]
  })

  // The last three bouts of a position against the three before, over its whole
  // history: one number that says which way it is going, where a line would be
  // two or three dots.
  const deltas = (['prone', 'standing'] as Position[]).flatMap((position) => {
    const own = bouts.filter((b) => b.position === position).sort((x, y) => x.shotAt.localeCompare(y.shotAt))
    if (own.length < 6) return []
    const avg = (xs: Bout[]) => xs.reduce((n, b) => n + spec.value(b), 0) / xs.length
    const last = avg(own.slice(-3))
    const before = avg(own.slice(-6, -3))
    return [{ position, last, diff: last - before }]
  })

  // A score of 65–90% on a 0–100% axis is squeezed into a fifth of the plot and
  // its labels pile up, so a score axis is fitted to the data (and the ticks say
  // so). A size has a meaningful zero, so group size keeps its baseline.
  const all = [...pts.map((p) => p.v), ...ghosts.flatMap((g) => [g.vMin, g.vMax])]
  const lo = Math.min(...all), hi = Math.max(...all)
  let yMin = 0
  let yMax = Math.ceil(Math.max(spec.axisMax, hi) / spec.tickStep) * spec.tickStep
  let tickStep = spec.tickStep
  if (metric === 'score' && all.length > 0 && lo >= 40) {
    yMin = Math.max(0, Math.floor((lo - 6) / 10) * 10)
    yMax = Math.min(100, Math.ceil((hi + 4) / 10) * 10)
    if (yMax - yMin < 20) yMax = Math.min(100, yMin + 20)
    tickStep = yMax - yMin <= 30 ? 5 : 10
  }

  const sx = (tt: number) => PAD.left + Math.min(1, Math.max(0, tt)) * (W - PAD.left - PAD.right)
  const sy = (v: number) => PAD.top + (1 - (Math.max(yMin, v) - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom)
  const ticks = Array.from({ length: Math.round((yMax - yMin) / tickStep) + 1 }, (_, i) => yMin + i * tickStep)

  const trends = byPosition.flatMap((s) => {
    if (s.points.length < MIN_TREND_POINTS) return []
    const t = linearTrend(s.points.map((p) => ({ t: p.tt, v: p.v })))
    if (!t) return []
    const tMin = s.points[0].tt, tMax = s.points[s.points.length - 1].tt
    return [{ position: s.position, tMin, tMax, vMin: t.at(tMin), vMax: t.at(tMax) }]
  })

  // Write every value beside its dot while there are few enough to read; where
  // two dots stack at one x (prone and standing in the same workout), the
  // lower one's label goes below it.
  const labelled = pts.length <= 12
  const latestKeys = new Set(byPosition.map((s) => s.points[s.points.length - 1].key))
  const labelBelow = new Set<string>()
  for (const p of pts) {
    if (pts.some((o) => o !== p && Math.abs(sx(o.tt) - sx(p.tt)) < 26 && o.v > p.v)) labelBelow.add(p.key)
  }

  const periodText = calendar ? periodLabel(granularity, rangeStart, rangeEnd, isCurrent) : `Your last ${pts.length} bout${pts.length === 1 ? '' : 's'}`
  const single = !calendar && pts.length === 1

  const caption =
    `${calendar ? (granularity === 'year' ? spec.caption.replace('each workout', 'each month') : spec.caption) : spec.captionRecent}${trends.length > 0 ? ' The dashed line is the trend.' : ''}` +
    (ghosts.length > 0 ? ` The dotted line is the trend from the ${WINDOW_LABEL[granularity].long} before.` : '')

  const tableRows = [...pts].sort((x, y) => y.at.getTime() - x.at.getTime())

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 380, margin: '0 auto' }}>
        {calendar && (
          <button
            type="button" aria-label="Previous period"
            onClick={() => setAnchor(step(granularity, anchor, -1))}
            className="secondary"
            style={{ width: 22, height: 22, flex: 'none', padding: 0, fontSize: 12, borderRadius: 6 }}
          >‹</button>
        )}
        <div className="seg" style={{ flex: 1, gap: 4 }}>
          {(['recent', 'week', 'month', 'year'] as View[]).map((g) => (
            <button
              key={g} type="button" aria-pressed={view === g}
              onClick={() => { setView(g); setAnchor(new Date()) }}
              style={{ padding: '4px 6px', borderRadius: 6, fontSize: 11, whiteSpace: 'nowrap' }}
            >
              {g === 'recent' ? 'Recent' : WINDOW_LABEL[g].short}
            </button>
          ))}
        </div>
        {calendar && (
          <button
            type="button" aria-label="Next period" disabled={isCurrent}
            onClick={() => setAnchor(step(granularity, anchor, 1))}
            className="secondary"
            style={{ width: 22, height: 22, flex: 'none', padding: 0, fontSize: 12, borderRadius: 6, opacity: isCurrent ? 0.4 : 1 }}
          >›</button>
        )}
      </div>
      <p className="meta" style={{ textAlign: 'center', margin: '6px 0 12px' }}>{periodText}</p>

      {pts.length === 0 ? (
        <p className="meta">{calendar ? 'Nothing logged in this window.' : 'Nothing scored yet.'}</p>
      ) : single ? (
        // One bout is a number, not a chart.
        <div className="stat range" style={{ maxWidth: 220, margin: '0 auto' }}>
          <div className="k">{pts[0].position} · {fmtDate(pts[0].at)}</div>
          <div className="v">{spec.format(pts[0].v)}</div>
          <div className="n">1 bout. A trend appears after a few more targets.</div>
        </div>
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
                <line x1={PAD.left} y1={sy(v)} x2={W - PAD.right} y2={sy(v)} stroke="var(--grid)" strokeWidth={1} />
                <text x={PAD.left - 6} y={sy(v)} textAnchor="end" dominantBaseline="central"
                  fontSize={11} fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {spec.format(v)}
                </text>
              </g>
            ))}

            {calendar ? (
              <>
                <text x={PAD.left} y={H - 6} fontSize={11} fill="var(--text-muted)">{fmtAxisDate(rangeStart, granularity === 'year')}</text>
                <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={11} fill="var(--text-muted)">{fmtAxisDate(rangeEnd, granularity === 'year')}</text>
              </>
            ) : (
              // Dates under the dots, as many as fit.
              pts.map((p, i) => (pts.length <= 6 || i === 0 || i === pts.length - 1) && (
                <text key={`d-${p.key}`} x={sx(p.tt)} y={H - 6} fontSize={11} fill="var(--text-muted)"
                  textAnchor={i === 0 && pts.length > 6 ? 'start' : i === pts.length - 1 && pts.length > 6 ? 'end' : 'middle'}>
                  {fmtDate(p.at)}
                </text>
              ))
            )}

            {ghosts.map((g) => (
              <line
                key={`ghost-${g.position}`}
                x1={sx(g.tMin)} y1={sy(g.vMin)} x2={sx(g.tMax)} y2={sy(g.vMax)}
                stroke={SERIES_COLOUR} strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" opacity={0.5}
              />
            ))}

            {byPosition.map((s) => (
              <g key={s.position}>
                {s.points.length > 1 && (
                  <path
                    d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.tt)},${sy(p.v)}`).join(' ')}
                    fill="none" stroke={SERIES_COLOUR} strokeWidth={2} opacity={0.55}
                    strokeLinejoin="round" strokeLinecap="round"
                  />
                )}
              </g>
            ))}
            {trends.map((t) => (
              <line
                key={`trend-${t.position}`}
                x1={sx(t.tMin)} y1={sy(t.vMin)} x2={sx(t.tMax)} y2={sy(t.vMax)}
                stroke={SERIES_COLOUR} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.8}
              />
            ))}

            {pts.map((p) => {
              const x = sx(p.tt), y = sy(p.v)
              const text = `${p.period ?? fmtDate(p.at)} · ${p.position} · ${spec.format(p.v)} · ${p.count} bout${p.count === 1 ? '' : 's'}`
              const show = () => setHover({ x, y, label: text })
              return (
                <g
                  key={p.key} tabIndex={0} role="button" aria-label={text} style={{ cursor: 'pointer', outline: 'none' }}
                  onMouseEnter={show} onFocus={show} onClick={show}
                >
                  {/* A hit area well past the mark, so a thumb can land on it. */}
                  <circle cx={x} cy={y} r={16} fill="transparent" />
                  <PositionMarker position={p.position} x={x} y={y} />
                  {(labelled || latestKeys.has(p.key)) && (
                    <text
                      x={x} y={labelBelow.has(p.key) ? y + 22 : y - 12} textAnchor="middle"
                      fontSize={11} fontWeight={600} fill="var(--text-primary)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {spec.format(p.v)}
                    </text>
                  )}
                </g>
              )
            })}

            {hover && (
              <g pointerEvents="none">
                <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={H - PAD.bottom} stroke="var(--axis)" strokeWidth={1} />
                <rect
                  x={Math.min(Math.max(hover.x - 130, 2), W - 262)} y={Math.max(hover.y - 40, 2)}
                  width={260} height={24} rx={6} fill="var(--surface-1)" stroke="var(--border)"
                />
                <text
                  x={Math.min(Math.max(hover.x - 130, 2), W - 262) + 8} y={Math.max(hover.y - 40, 2) + 12}
                  dominantBaseline="central" fontSize={11} fill="var(--text-primary)"
                >
                  {hover.label}
                </text>
              </g>
            )}
          </svg>

          <div className="legend">
            {byPosition.map((s) => (
              <span key={s.position} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
                  <PositionMarker position={s.position} x={7} y={7} r={4.5} />
                </svg>
                {s.position}
              </span>
            ))}
            <span>{caption}</span>
          </div>
        </>
      )}

      {deltas.map((d) => {
        const better = metric === 'score' ? d.diff > 0 : d.diff < 0
        const size = Math.abs(d.diff)
        return (
          <p key={d.position} className="meta" style={{ margin: '8px 0 0' }}>
            <strong style={{ textTransform: 'capitalize' }}>{d.position}</strong>: your last 3 bouts average {spec.format(d.last)},{' '}
            {size < 0.5 ? 'level with' : metric === 'score'
              ? `${better ? 'up' : 'down'} ${Math.round(size)} point${Math.round(size) === 1 ? '' : 's'} on`
              : `${better ? 'tighter' : 'looser'} by ${Math.round(size)} mm than`}{' '}
            the 3 before.
          </p>
        )
      })}

      {pts.length > 0 && !single && (
        <details style={{ marginTop: 10 }}>
          <summary className="meta" style={{ cursor: 'pointer' }}>Show the values</summary>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '4px 0', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '4px 0', fontWeight: 600 }}>Position</th>
                <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>{metric === 'score' ? 'Score' : 'Mean radius'}</th>
                {calendar && <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>Bouts</th>}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((p) => (
                <tr key={p.key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '5px 0' }}>{p.period ?? fmtDate(p.at)}</td>
                  <td style={{ padding: '5px 0', textTransform: 'capitalize' }}>{p.position}</td>
                  <td style={{ padding: '5px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{spec.format(p.v)}</td>
                  {calendar && <td style={{ padding: '5px 0', textAlign: 'right' }}>{p.count}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}
