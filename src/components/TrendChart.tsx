import { useEffect, useRef, useState } from 'react'
import type { Bout, MetalBout, Position, Workout } from '../lib/types'
import { DISCS_PER_METAL_BOUT, hitsOf, missCount } from '../lib/metal'

export type Metric = 'score' | 'group' | 'metal' | 'sensor' | 'sensorHold'

/** A bout of either kind: the chart only needs a value, a position and a date. */
type Entry = Bout | MetalBout

interface Spec {
  /** Value for one bout, on this metric's own scale. */
  value: (b: Entry) => number
  /** Whether a bigger number is the better one (a score, a hit rate) or the
   *  smaller (a group's size). */
  higherIsBetter: boolean
  /** Fit the axis to the data when it all sits high: for a percentage, where
   *  65–90% on a 0–100% axis would be squeezed into a fifth of the plot. A size
   *  has a meaningful zero, so it keeps its baseline. */
  fitAxis: boolean
  /** The values column's heading in the table twin, and the unit a change is
   *  quoted in. */
  columnLabel: string
  /** The series colour: Range blue for precision and metal, Dry-fire green for the sensor. */
  colour: string
  axisMax: number
  tickStep: number
  /** A meaningful line to draw across the plot, or null. */
  reference: number | null
  /** An axis tick without its unit: the unit is in the section's title. */
  tickFormat: (v: number) => string
  caption: string
  /** The caption for the per-bout view, where nothing is averaged. */
  captionRecent: string
  label: string
  format: (v: number) => string
}

const RANGE_BLUE = 'var(--series-1)'
/** The colour of dry-fire sessions, as on the Dry-fire tiles. */
const DRYFIRE_GREEN = 'color-mix(in srgb, var(--series-3) 72%, black)'

const SPECS: Record<Metric, Spec> = {
  score: {
    value: (b) => (b.kind === 'precision' ? (b.metrics.ringTotal / Math.max(1, b.metrics.ringPossible)) * 100 : 0),
    higherIsBetter: true,
    fitAxis: true,
    columnLabel: 'Score',
    colour: RANGE_BLUE,
    axisMax: 100,
    tickStep: 25,
    reference: null,
    caption: 'Score out of what the target could give, averaged across each workout. Higher is better.',
    captionRecent: 'Score out of what the target could give, one mark per bout. Higher is better.',
    label: 'Score as a percentage of the target maximum, one point per workout, split by shooting position',
    tickFormat: (v) => `${Math.round(v)}`,
    format: (v) => `${Math.round(v)}%`,
  },
  group: {
    value: (b) => (b.kind === 'precision' ? b.metrics.meanRadius : 0),
    higherIsBetter: false,
    fitAxis: false,
    columnLabel: 'Mean radius',
    colour: RANGE_BLUE,
    axisMax: 20,
    tickStep: 5,
    reference: null,
    caption: 'Mean radius of the group, averaged across each workout. Lower is tighter.',
    captionRecent: 'Mean radius of the group, one mark per bout. Lower is tighter.',
    label: 'Group mean radius in millimetres, one point per workout, split by shooting position',
    tickFormat: (v) => `${Math.round(v)}`,
    format: (v) => `${Math.round(v)} mm`,
  },
  metal: {
    // Targets hit out of five, as a percentage: the same units as the score.
    value: (b) => (b.kind === 'metal' ? ((DISCS_PER_METAL_BOUT - missCount(hitsOf(b))) / DISCS_PER_METAL_BOUT) * 100 : 0),
    higherIsBetter: true,
    fitAxis: true,
    columnLabel: 'Hit rate',
    colour: RANGE_BLUE,
    axisMax: 100,
    tickStep: 25,
    reference: null,
    caption: 'Targets hit out of five, averaged across each workout. Higher is better.',
    captionRecent: 'Targets hit out of five, one mark per bout. Higher is better.',
    label: 'Metal hit rate as a percentage of the five targets, one point per workout, split by shooting position',
    tickFormat: (v) => `${Math.round(v)}`,
    format: (v) => `${Math.round(v)}%`,
  },
  sensor: {
    // Targets hit out of five on the sensor target, a bout of five shots at a time.
    value: (b) => (b.kind === 'metal' ? ((DISCS_PER_METAL_BOUT - missCount(hitsOf(b))) / DISCS_PER_METAL_BOUT) * 100 : 0),
    higherIsBetter: true,
    fitAxis: true,
    columnLabel: 'Hit rate',
    colour: DRYFIRE_GREEN,
    axisMax: 100,
    tickStep: 25,
    reference: null,
    caption: 'Targets hit out of five on the sensor, averaged across each workout. Higher is better.',
    captionRecent: 'Targets hit out of five on the sensor, one mark per bout of five shots. Higher is better.',
    label: 'Sensor hit rate as a percentage of the five targets, one point per workout, split by shooting position',
    tickFormat: (v) => `${Math.round(v)}`,
    format: (v) => `${Math.round(v)}%`,
  },
  sensorHold: {
    // How much the aim wandered in the second before each pull, on the 50 m scale.
    value: (b) => (b.kind === 'metal' && 'hold' in b && typeof b.hold === 'number' ? b.hold : 0),
    higherIsBetter: false,
    fitAxis: false,
    columnLabel: 'Steadiness',
    colour: DRYFIRE_GREEN,
    axisMax: 40,
    tickStep: 10,
    reference: null,
    caption: 'How much the aim wandered in the second before the pull, averaged across each workout. Lower is steadier.',
    captionRecent: 'How much the aim wandered in the second before the pull, one mark per bout. Lower is steadier.',
    label: 'Aim wander before the pull in millimetres on the 50 m range, one point per workout, split by shooting position',
    tickFormat: (v) => `${Math.round(v)}`,
    format: (v) => `${Math.round(v)} mm`,
  },
}

/** Every point is range shooting, so one colour: the Range blue the rest of the
 *  app uses for it. Position is told apart by the SHAPE of the marker (a circle
 *  for prone, a diamond for standing), never by borrowing colours that mean a
 *  session type elsewhere (blue is Range, green is Dry-fire). */
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

// top leaves room for the value written above the highest point; left holds
// the widest tick label (a plain number now that the unit is in the title).
const PAD = { top: 26, right: 14, bottom: 26, left: 40 }

const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
/** Axis end labels carry the year in the 12-month view, where the same month
 *  appears at both ends. */
const fmtAxisDate = (d: Date, withYear: boolean) =>
  d.toLocaleDateString(undefined, withYear ? { month: 'short', day: 'numeric', year: '2-digit' } : { month: 'short', day: 'numeric' })

/** One drawn mark: a circle for prone, a diamond for standing, in the series
 *  colour with a surface ring so overlapping marks stay readable. */
function PositionMarker({ position, x, y, r = 6, colour }: { position: Position; x: number; y: number; r?: number; colour: string }) {
  return MARKER[position] === 'circle' ? (
    <circle cx={x} cy={y} r={r} fill={colour} stroke="var(--surface-1)" strokeWidth={2} />
  ) : (
    <rect
      x={x - r * 0.9} y={y - r * 0.9} width={r * 1.8} height={r * 1.8} rx={1}
      transform={`rotate(45 ${x} ${y})`} fill={colour} stroke="var(--surface-1)" strokeWidth={2}
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
export function TrendChart({ bouts, workouts, metric }: { bouts: Entry[]; workouts: Workout[]; metric: Metric }) {
  const [hover, setHover] = useState<{ x: number; y: number; value: string; rest: string } | null>(null)
  // Drawn at the width it's shown at, so text is true pixel size on a phone
  // instead of a 640-wide drawing shrunk to a third of that.
  const wrap = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(640)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setBoxW(Math.round(Math.max(280, Math.min(760, el.clientWidth || 640))))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const W = boxW
  const H = Math.round(Math.max(210, Math.min(270, boxW * 0.6)))
  const [view, setView] = useState<View>('recent')
  const [anchor, setAnchor] = useState(() => new Date())
  const spec = SPECS[metric]
  const calendar = view !== 'recent'
  const granularity: Granularity = calendar ? view : 'month'

  const { start: rangeStart, end: rangeEnd } = rangeFor(granularity, anchor)
  const now = new Date()
  const isCurrent = now >= rangeStart && now <= rangeEnd

  type CalPoint = { t: number; v: number; workout: Workout; bouts: Entry[] }

  /** Calendar views: one point per workout per position inside [start, end]. */
  const buildSeries = (start: Date, end: Date) => {
    const a = start.getTime()
    const span = Math.max(end.getTime() - a, 1)
    const within = (iso: string) => {
      const tt = new Date(iso).getTime()
      return tt >= a && tt <= end.getTime()
    }
    const byWorkout = new Map<string, Entry[]>()
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
    const avg = (xs: Entry[]) => xs.reduce((n, b) => n + spec.value(b), 0) / xs.length
    const last = avg(own.slice(-3))
    const before = avg(own.slice(-6, -3))
    return [{ position, last, diff: last - before }]
  })

  // A rate of 65–90% on a 0–100% axis is squeezed into a fifth of the plot and
  // its labels pile up, so a percentage axis is fitted to the data (and the
  // ticks say so). A size has a meaningful zero, so group size keeps its baseline.
  const all = [...pts.map((p) => p.v), ...ghosts.flatMap((g) => [g.vMin, g.vMax])]
  const lo = Math.min(...all), hi = Math.max(...all)
  let yMin = 0
  let yMax = Math.ceil(Math.max(spec.axisMax, hi) / spec.tickStep) * spec.tickStep
  let tickStep = spec.tickStep
  if (spec.fitAxis && all.length > 0 && lo >= 40) {
    yMin = Math.max(0, Math.floor((lo - 6) / 10) * 10)
    yMax = Math.min(100, Math.ceil((hi + 4) / 10) * 10)
    if (yMax - yMin < 20) yMax = Math.min(100, yMin + 20)
    tickStep = yMax - yMin <= 30 ? 5 : 10
  }

  const sx = (tt: number) => PAD.left + Math.min(1, Math.max(0, tt)) * (W - PAD.left - PAD.right)
  // The per-bout view carries a second row under the dates (the time between
  // bouts), so it keeps more room at the bottom.
  const bottom = calendar ? PAD.bottom : 46
  const sy = (v: number) => PAD.top + (1 - (Math.max(yMin, v) - yMin) / (yMax - yMin)) * (H - PAD.top - bottom)
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
  const xs = pts.map((p) => sx(p.tt)).sort((a, b) => a - b)
  const minGapPx = xs.length > 1 ? Math.min(...xs.slice(1).map((x, i) => x - xs[i])) : Infinity
  // value written beside every dot only while each has room to be read
  const labelled = pts.length <= 12 && minGapPx >= 26
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
    <div ref={wrap}>
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
        <div className={metric === 'sensor' || metric === 'sensorHold' ? 'stat dryfire' : 'stat range'} style={{ maxWidth: 220, margin: '0 auto' }}>
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
                  {spec.tickFormat(v)}
                </text>
              </g>
            ))}

            {calendar ? (
              <>
                <text x={PAD.left} y={H - 6} fontSize={11} fill="var(--text-muted)">{fmtAxisDate(rangeStart, granularity === 'year')}</text>
                <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={11} fill="var(--text-muted)">{fmtAxisDate(rangeEnd, granularity === 'year')}</text>
              </>
            ) : (
              // Spacing is by order, so time has to be said in words: the date
              // under every dot (once per day), a tick at each, and between
              // dots how long the gap was.
              <g>
                {(() => {
                  // A date under a dot only where it has room: every dot, or
                  // every second or third one as the chart narrows, and always the
                  // latest. Real pixels, so this tracks the phone's width.
                  const px = pts.map((p) => sx(p.tt))
                  const tightest = px.length > 1 ? Math.min(...px.slice(1).map((x, i) => x - px[i])) : Infinity
                  const every = Math.max(1, Math.ceil(46 / Math.max(tightest, 1)))
                  const dateShown = pts.map((_, i) => i === pts.length - 1 || i % every === 0)
                  // never two shown dates closer than a label is wide
                  for (let i = pts.length - 2; i >= 0; i--) {
                    if (dateShown[i] && dateShown.slice(i + 1).some((v, k) => v && px[i + 1 + k] - px[i] < 40)) dateShown[i] = false
                  }
                  let lastShown: Date | null = null
                  return pts.map((p, i) => {
                    const prev = pts[i - 1]
                    const sameDay = prev && prev.at.toDateString() === p.at.toDateString()
                    // The month goes on a label unless the last label shown was
                    // the same month, so a thinned "26" still says which month.
                    const sameMonth = lastShown !== null && lastShown.getMonth() === p.at.getMonth() && lastShown.getFullYear() === p.at.getFullYear()
                    const x = px[i]
                    const gapDays = prev ? Math.round((p.at.getTime() - prev.at.getTime()) / 864e5) : 0
                    const gap = gapDays <= 0 ? '' : gapDays < 14 ? `${gapDays}d` : gapDays < 60 ? `${Math.round(gapDays / 7)}w` : `${Math.round(gapDays / 30)}mo`
                    const showMonth = !sameMonth
                    if (!sameDay && dateShown[i]) lastShown = p.at
                    return (
                      <g key={`d-${p.key}`}>
                        <line x1={x} y1={H - bottom} x2={x} y2={H - bottom + 4} stroke="var(--axis)" strokeWidth={1} />
                        {!sameDay && dateShown[i] && (
                          <text x={x} y={H - bottom + 17} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
                            {showMonth ? fmtDate(p.at) : p.at.toLocaleDateString(undefined, { day: 'numeric' })}
                          </text>
                        )}
                        {gap && prev && x - px[i - 1] >= 22 && (
                          <text x={(px[i - 1] + x) / 2} y={H - 5} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
                            {gap}
                          </text>
                        )}
                      </g>
                    )
                  })
                })()}
                <text x={PAD.left - 6} y={H - 5} textAnchor="end" fontSize={10} fill="var(--text-muted)">gap</text>
              </g>
            )}

            {ghosts.map((g) => (
              <line
                key={`ghost-${g.position}`}
                x1={sx(g.tMin)} y1={sy(g.vMin)} x2={sx(g.tMax)} y2={sy(g.vMax)}
                stroke={spec.colour} strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" opacity={0.5}
              />
            ))}

            {byPosition.map((s) => (
              <g key={s.position}>
                {s.points.length > 1 && (
                  <path
                    d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.tt)},${sy(p.v)}`).join(' ')}
                    fill="none" stroke={spec.colour} strokeWidth={2} opacity={0.55}
                    strokeLinejoin="round" strokeLinecap="round"
                  />
                )}
              </g>
            ))}
            {trends.map((t) => (
              <line
                key={`trend-${t.position}`}
                x1={sx(t.tMin)} y1={sy(t.vMin)} x2={sx(t.tMax)} y2={sy(t.vMax)}
                stroke={spec.colour} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.8}
              />
            ))}

            {pts.map((p) => {
              const x = sx(p.tt), y = sy(p.v)
              const when = p.period ?? fmtDate(p.at)
              const rest = `${when} · ${p.position} · ${p.count} bout${p.count === 1 ? '' : 's'}`
              const text = `${when} · ${p.position} · ${spec.format(p.v)} · ${p.count} bout${p.count === 1 ? '' : 's'}`
              const show = () => setHover({ x, y, value: spec.format(p.v), rest })
              return (
                <g
                  key={p.key} tabIndex={0} role="button" aria-label={text} style={{ cursor: 'pointer', outline: 'none' }}
                  onMouseEnter={show} onFocus={show} onClick={show}
                >
                  {/* A hit area well past the mark, so a thumb can land on it. */}
                  <circle cx={x} cy={y} r={16} fill="transparent" />
                  <PositionMarker position={p.position} x={x} y={y} colour={spec.colour} />
                  {(labelled || latestKeys.has(p.key)) && (
                    <text
                      x={x} y={labelBelow.has(p.key) ? y + 22 : y - 12} textAnchor="middle"
                      fontSize={11} fontWeight={600} fill="var(--text-primary)"
                      stroke="var(--surface-1)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {spec.format(p.v)}
                    </text>
                  )}
                </g>
              )
            })}

            {hover && (
              <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={H - bottom} stroke="var(--axis)" strokeWidth={1} pointerEvents="none" />
            )}
          </svg>

          {/* The selected mark, written out at normal size under the chart: a
              tooltip inside a phone-width drawing was unreadable and sat under
              the thumb that tapped it. */}
          <div
            aria-live="polite"
            style={{
              minHeight: 64, margin: '10px 0 8px', padding: '10px 14px', borderRadius: 10,
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 12px',
              border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--series-1) 8%, transparent)',
            }}
          >
            {hover ? (
              <>
                <strong style={{ fontSize: 30, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{hover.value}</strong>
                <span style={{ fontSize: 17, color: 'var(--text-secondary)' }}>{hover.rest}</span>
              </>
            ) : (
              <span style={{ fontSize: 15, color: 'var(--text-muted)' }}>Tap a mark for its date and value.</span>
            )}
          </div>

          <div className="legend">
            {byPosition.map((s) => (
              <span key={s.position} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
                  <PositionMarker position={s.position} x={7} y={7} r={4.5} colour={spec.colour} />
                </svg>
                {s.position}
              </span>
            ))}
            <span>{caption}</span>
          </div>
        </>
      )}

      {deltas.map((d) => {
        const better = spec.higherIsBetter ? d.diff > 0 : d.diff < 0
        const size = Math.abs(d.diff)
        return (
          <p key={d.position} className="meta" style={{ margin: '8px 0 0' }}>
            <strong style={{ textTransform: 'capitalize' }}>{d.position}</strong>: your last 3 bouts average {spec.format(d.last)},{' '}
            {size < 0.5 ? 'level with' : spec.higherIsBetter
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
                <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right' }}>{spec.columnLabel}</th>
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
