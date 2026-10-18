import { useMemo, useState } from 'react'
import type { Bout, Finding, MetalBout, MetalTarget, RaceType, Settings, ShootingDirection, Workout } from '../lib/types'
import { RACE_TYPE_LABEL, SHOOTING_DIRECTION_LABEL } from '../lib/types'
import { ofWorkouts } from '../lib/scope'
import { Help } from './Help'
import { PageTitle, IBU_LIBRARY_URL, useOpenLibrary } from './LibraryLink'
import { entriesForFinding } from '../lib/library'
import { AppMark, ChevronIcon, DryfireIcon, RaceMedalIcon, RangeIcon } from './icons'
import { DISCS_PER_METAL_BOUT, ZONE_COLOR, hitsOf, missCount, targetSeries, targetStats, type TargetStat } from '../lib/metal'
import { analyse } from '../lib/diagnostics'
import { analyseMetal, metalWindow } from '../lib/metalAdvice'
import { recommend } from '../lib/training'
import { TrendChart } from './TrendChart'
import { HistoryView } from './HistoryView'

/** Bouts older than this stop counting toward the coaching read below — the
 *  breakdown and trends above it stay all-time, since a distribution is only
 *  honest over the long run. */
const WINDOW_DAYS = 60
const MAX_BOUTS = 20

/** Ring points scored as a percentage of what was possible — turns a ring
 *  value out of 10 into the same units as a metal hit rate, so the two
 *  disciplines read side by side without pretending they are one score. */
function precisionPct(bouts: Bout[]): string {
  const shots = bouts.reduce((n, b) => n + b.shots.length, 0)
  if (!shots) return '—'
  const avg = bouts.reduce((n, b) => n + b.metrics.ringTotal, 0) / shots
  return `${Math.round((avg / 10) * 100)}%`
}

function metalPct(bouts: MetalBout[]): string {
  const shots = bouts.length * DISCS_PER_METAL_BOUT
  if (!shots) return '—'
  const misses = bouts.reduce((n, b) => n + missCount(hitsOf(b)), 0)
  return `${Math.round(((shots - misses) / shots) * 100)}%`
}

/** A biathlon season runs November to May, crossing the calendar year — the
 *  "start year" of a date's season is that November's year. June through
 *  October (the off-season) counts toward the upcoming season rather than
 *  the one just finished, so checking in mid-summer already reads as "this
 *  season" for the winter ahead. */
export function seasonStartYear(date: Date): number {
  const month = date.getMonth() + 1
  return month <= 5 ? date.getFullYear() - 1 : date.getFullYear()
}

export const seasonLabel = (startYear: number): string => `${String(startYear).slice(-2)}/${String(startYear + 1).slice(-2)}`

/** Overall/prone/standing hit rate for one group of metal bouts — reused
 *  for the season comparison and the by-format breakdown below it, so both
 *  read identically. */
export function MetalPositionStats({ bouts, races, raceWord = 'race' }: { bouts: MetalBout[]; races: number; raceWord?: string }) {
  const prone = bouts.filter((b) => b.position === 'prone')
  const standing = bouts.filter((b) => b.position === 'standing')
  return (
    <div className="stats three">
      <div className="stat race">
        <div className="k">Overall</div>
        <div className="v">{metalPct(bouts)}</div>
        <div className="n">{races} {raceWord}{races === 1 ? '' : 's'}</div>
      </div>
      <div className="stat race">
        <div className="k">Prone</div>
        <div className="v">{metalPct(prone)}</div>
      </div>
      <div className="stat race">
        <div className="k">Standing</div>
        <div className="v">{metalPct(standing)}</div>
      </div>
    </div>
  )
}

/** Minutes logged in dryfire workouts, in three rolling windows — the last
 *  7 and 30 days, not calendar week/month, same rolling-window convention
 *  the rest of this view uses (see WINDOW_DAYS above). */
function dryfireMinutes(workouts: Workout[]): { week: number; month: number; total: number } {
  const dryfire = workouts.filter((w) => w.workoutType === 'dryfire')
  const now = Date.now()
  const since = (days: number) => now - days * 86400_000
  const sum = (cutoff: number) =>
    dryfire.filter((w) => new Date(w.startedAt).getTime() >= cutoff).reduce((n, w) => n + w.dryfireMinutes, 0)
  return {
    week: sum(since(7)),
    month: sum(since(30)),
    total: dryfire.reduce((n, w) => n + w.dryfireMinutes, 0),
  }
}

/** One of the four top-level Analysis sections — collapsed by the arrow
 *  next to its title rather than the whole heading row, so the heading
 *  itself stays plain text, not link-styled. headerExtra (a filter, a
 *  window selector) only shows while the section is open — it has nothing
 *  to act on once its content is hidden. */
/** The Race button's colour: also the filter and window chips' in Race performance. */
const RACE_COLOUR = 'color-mix(in srgb, var(--series-2) 80%, black)'

type TargetSeries = Record<MetalTarget, boolean[]>

/** One target's run of hit/miss outcomes, oldest to newest, as a small line.
 *  The line is the running hit rate (0–100%), so it shows whether the rate is
 *  settling, climbing or sliding; each bout is a dot, filled for a hit and
 *  hollow for a miss, until there are too many (over eight) to read as separate dots. The
 *  last point is drawn larger so the eye lands on "now". */
function TargetSparkline({ target, outcomes, colour }: { target: string; outcomes: boolean[]; colour: string }) {
  const W = 60
  const H = 32
  const PAD = 4
  const n = outcomes.length
  // Keep the row's height even when a target has no bouts, so tiles line up.
  if (n === 0) return <div style={{ height: 'auto', aspectRatio: `${W} / ${H}` }} aria-hidden />
  let hits = 0
  const points = outcomes.map((hit, i) => {
    if (hit) hits += 1
    const rate = hits / (i + 1)
    const x = n === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (n - 1)
    return { x, y: H - PAD - rate * (H - PAD * 2), hit }
  })
  const showDots = n <= 8
  const last = outcomes[n - 1]
  const label = `${target}: hit ${hits} of ${n} bout${n === 1 ? '' : 's'}, most recent ${last ? 'a hit' : 'a miss'}.`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <title>{label}</title>
      {/* the 50% line, faint, so "above or below half" reads at a glance */}
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--axis)" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      {n > 1 && (
        <polyline
          points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none" stroke={colour} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {points.map((p, i) => {
        const isLast = i === n - 1
        if (!showDots && !isLast) return null
        return (
          <circle
            key={i} cx={p.x} cy={p.y} r={isLast ? 2.6 : 1.9}
            fill={p.hit ? colour : 'var(--raised)'} stroke={colour} strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}

/** The five targets' hit rates as circles, alpha to echo, in their session's
 *  colour: Range blue in Metal, Race red in Race performance. With `series`,
 *  each circle carries a small line of that target's outcomes beneath it. */
function TargetTiles({ stats, tone, series }: { stats: TargetStat[]; tone?: 'range' | 'race'; series?: TargetSeries }) {
  const colour = tone === 'race' ? RACE_COLOUR : 'var(--series-1)'
  // Targets are round, so the tiles are circles. minmax(0, 1fr) and small type so
  // five of them fit a phone's width instead of running off the right edge.
  return (
    <div className="stats" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
      {stats.map((t) => (
        <div key={t.target} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div
          className={`stat${tone ? ` ${tone}` : ''}`}
          title={t.bouts < 3 ? `Only ${t.bouts} bout${t.bouts === 1 ? '' : 's'} so far: treat this as a first look` : undefined}
          style={{
            // A rate from one or two bouts is a first look, not a finding.
            opacity: t.bouts < 3 ? 0.55 : 1,
            aspectRatio: '1', borderRadius: '50%', padding: 0, minWidth: 0, textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            // The type is sized from the circle itself (cqw = 1% of its width), so
            // the numbers stay in proportion from a phone to a desktop.
            containerType: 'inline-size',
          }}
        >
          <div className="k" style={{ fontSize: 'max(9px, 12cqw)', letterSpacing: '0.02em' }}>{t.target}</div>
          <div className="v" style={{ fontSize: 'max(15px, 25cqw)', marginTop: 0, lineHeight: 1.1 }}>{t.hitRatePct}<small style={{ fontSize: '13cqw' }}>%</small></div>
          <div className="n" style={{ fontSize: 'max(9px, 13cqw)' }}>{t.hits}/{t.bouts}</div>
        </div>
        {series && <TargetSparkline target={t.target} outcomes={series[t.target]} colour={colour} />}
        </div>
      ))}
    </div>
  )
}

/** "Which targets get hit": the hit rate of each of the five targets for one
 *  position, from the most recent 5, 10 or 20 bouts. Used for range metal and,
 *  separately, for race metal. */
function TargetHitRates({
  position, kind, stats, series, windowSize, onWindowChange,
}: {
  position: 'prone' | 'standing'
  /** What the bouts are, for the caption: "metal" or "race". */
  kind: string
  stats: TargetStat[]
  series?: TargetSeries
  windowSize: 5 | 10 | 20
  onWindowChange: (n: 5 | 10 | 20) => void
}) {
  if (stats.length === 0) return null
  const bouts = stats[0]?.bouts ?? 0
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 20 }}>
        <h3 style={{ margin: 0 }}>Which targets get hit — {position}</h3>
        <div className="seg" style={{ flex: 'none', width: 96 }}>
          {([5, 10, 20] as const).map((n) => (
            <button
              key={n}
              aria-pressed={windowSize === n}
              onClick={() => onWindowChange(n)}
              style={{ padding: '4px 6px', fontSize: 11, borderRadius: 6 }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <p className="meta" style={{ marginTop: 6 }}>
        Last {bouts} {position} {kind} bout{bouts === 1 ? '' : 's'}.
      </p>
      <TargetTiles stats={stats} tone="range" series={series} />
    </>
  )
}

type RaceWindow = 3 | 5 | 10 | 'all'

/**
 * "Which targets get hit" for races. Unlike the range metal version, which
 * counts bouts, this counts RACES: a sprint has two shooting stages and a
 * pursuit or mass start four, so a bout window would mix formats unevenly.
 * Prone and standing both come from the same chosen races, and the section
 * says in the control ("Races: Last 5") and in a "?" that races are what's counted.
 */
function RaceTargetHitRates({
  prone, standing, proneSeries, standingSeries, windowValue, onWindowChange,
}: {
  prone: TargetStat[]
  standing: TargetStat[]
  proneSeries?: TargetSeries
  standingSeries?: TargetSeries
  windowValue: RaceWindow
  onWindowChange: (w: RaceWindow) => void
}) {
  if (prone.length === 0 && standing.length === 0) return null
  const options: RaceWindow[] = [3, 5, 10, 'all']
  const bouts = (stats: TargetStat[]) => stats[0]?.bouts ?? 0
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, margin: '20px 0 6px' }}>
        <h3 style={{ margin: 0 }}>
          Which targets get hit
          <Help>
            Here the count is <strong>races</strong>, not bouts. A sprint has two shooting stages (one prone, one
            standing); a pursuit or mass start has four. So "Last 5" means your five most recent races, however
            many bouts they hold, and prone and standing both come from those same races. The Metal section
            counts bouts instead, because range sessions don't have a fixed number.
          </Help>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginLeft: 'auto' }}>
          <span className="meta" style={{ margin: 0 }}>Races</span>
          <div className="seg" style={{ flex: 'none' }} role="group" aria-label="How many races to count">
            {options.map((o) => (
              <button
                key={o} aria-pressed={windowValue === o} onClick={() => onWindowChange(o)}
                style={{
                  padding: '4px 8px', fontSize: 11, borderRadius: 6, flex: 'none',
                  ...(windowValue === o
                    ? { background: RACE_COLOUR, borderColor: RACE_COLOUR, color: '#fff' }
                    : { borderColor: RACE_COLOUR, color: RACE_COLOUR }),
                }}
              >
                {o === 'all' ? 'All' : `Last ${o}`}
              </button>
            ))}
          </div>
        </div>
      </div>
      {prone.length > 0 && (
        <>
          <p className="meta" style={{ margin: '10px 0 4px' }}>Prone · {bouts(prone)} bout{bouts(prone) === 1 ? '' : 's'}</p>
          <TargetTiles stats={prone} tone="race" series={proneSeries} />
        </>
      )}
      {standing.length > 0 && (
        <>
          <p className="meta" style={{ margin: '10px 0 4px' }}>Standing · {bouts(standing)} bout{bouts(standing) === 1 ? '' : 's'}</p>
          <TargetTiles stats={standing} tone="race" series={standingSeries} />
        </>
      )}
    </>
  )
}

/** The icon for a kind of session, in that kind's colour — the same pairing as
 *  the session chooser and the feed's tiles. Precision and metal are both range
 *  shooting, so they share the range icon. */
const SESSION_ICON = {
  range: { Icon: RangeIcon, colour: 'var(--series-1)' },
  race: { Icon: RaceMedalIcon, colour: 'var(--series-2)' },
  dryfire: { Icon: DryfireIcon, colour: 'var(--series-3)' },
} as const

const sessionIcon = (kind: keyof typeof SESSION_ICON) => {
  const { Icon, colour } = SESSION_ICON[kind]
  return <span style={{ color: colour, display: 'inline-flex' }}><Icon size={22} /></span>
}

/** One finding: what the data shows, the likely cause, how much it rests on. */
function FindingCard({ f }: { f: Finding }) {
  const openLibrary = useOpenLibrary()
  const related = entriesForFinding(f.id)
  return (
    <div className={`finding ${f.severity}`}>
      <div className="badge">
        <i className="dot" />
        {f.severity === 'priority' ? 'Work on this' : f.severity === 'watch' ? 'Keep an eye on' : f.id === 'no_standout' ? 'Nothing flagged' : 'Doing well'}
      </div>
      <h3>{f.title}</h3>
      <p>{f.evidence}</p>
      <p className="cause">{f.cause}</p>
      <p className="meta">
        {Math.round(f.confidence * 100)}% confidence, from {f.sampleSize} bout
        {f.sampleSize === 1 ? '' : 's'}
      </p>
      {openLibrary && related.length > 0 && (
        <p className="meta" style={{ margin: '6px 0 0' }}>
          <button className="link" onClick={() => openLibrary({ findingId: f.id, title: f.title })}>
            Read more in the library ({related.length})
          </button>
        </p>
      )}
    </div>
  )
}

export function CollapsibleSection({
  title, icon, defaultOpen = true, headerExtra, headerExtraBelow = false, titleExtra, children,
}: {
  title: string
  /** Shown before the title, e.g. a session kind's icon. */
  icon?: React.ReactNode
  defaultOpen?: boolean
  headerExtra?: React.ReactNode
  /** Put headerExtra on its own row under the title instead of beside it. */
  headerExtraBelow?: boolean
  /** Small text alongside the title, shown only while the section is open. */
  titleExtra?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 12, rowGap: 6, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 2, minWidth: 0 }}>
          {icon}
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button
            className="link"
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronIcon direction={open ? 'up' : 'down'} />
          </button>
          {open && titleExtra}
        </div>
        {open && !headerExtraBelow && headerExtra}
        {open && headerExtraBelow && headerExtra && <div style={{ flexBasis: '100%', display: 'flex' }}>{headerExtra}</div>}
      </div>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </>
  )
}

export function AnalysisView({
  bouts: suppliedBouts,
  metalBouts: suppliedMetalBouts,
  settings,
  workouts,
  onChanged,
  readOnly,
  onAddCoachNote,
  shootingDirection,
  onOpenSettings,
}: {
  bouts: Bout[]
  metalBouts: MetalBout[]
  settings: Settings
  workouts: Workout[]
  onChanged: () => void
  /** True when viewing someone else's data (a coach on their roster) — the
   *  History rolled up below hides every delete action, same as HistoryView
   *  itself does. */
  readOnly?: boolean
  /** Present only for a coach viewing a linked athlete — forwarded straight
   *  through to the nested History section. */
  onAddCoachNote?: (workoutId: string, note: string) => Promise<void>
  /** The order this athlete shoots the five targets, once known. Shown under Metal. */
  shootingDirection?: ShootingDirection
  /** Takes the athlete to Settings, where the shooting direction is changed. */
  onOpenSettings?: () => void
}) {
  // Only bouts shot in the workouts we were given — see scope.ts.
  const bouts = useMemo(() => ofWorkouts(suppliedBouts, workouts), [suppliedBouts, workouts])
  const metalBouts = useMemo(() => ofWorkouts(suppliedMetalBouts, workouts), [suppliedMetalBouts, workouts])
  const openLibrary = useOpenLibrary()
  const [openDrill, setOpenDrill] = useState<string | null>(null)
  const [proneWindow, setProneWindow] = useState<5 | 10 | 20>(10)
  const [standingWindow, setStandingWindow] = useState<5 | 10 | 20>(10)
  const [raceWindow, setRaceWindow] = useState<RaceWindow>(5)
  // One race format at a time, or all of them: the whole Race performance
  // section follows it.
  const [raceFilter, setRaceFilter] = useState<'all' | RaceType>('all')
  // Metal here is range-session shooting only; race bouts have their own section
  // below. A zone option ('zone', 2) narrows to combo rounds shot at that target
  // heart-rate zone: one lens on Metal at a time.
  type MetalFilter = 'all' | { zone: number }
  const [metalFilter, setMetalFilter] = useState<MetalFilter>('all')

  const prone = bouts.filter((b) => b.position === 'prone')
  const standing = bouts.filter((b) => b.position === 'standing')
  const raceWorkoutIds = new Set(workouts.filter((w) => w.raceType).map((w) => w.id))
  // Only offer zones the athlete has actually used — most will have one or
  // two, not all eight.
  const rangeMetal = metalBouts.filter((b) => !raceWorkoutIds.has(b.workoutId))
  const presentZones = [...new Set(rangeMetal.map((b) => b.targetZone).filter((z): z is number => z !== null))].sort(
    (a, b) => a - b,
  )
  const filteredMetal = metalFilter === 'all' ? rangeMetal : rangeMetal.filter((b) => b.targetZone === metalFilter.zone)
  const metalProne = filteredMetal.filter((b) => b.position === 'prone')
  const metalStanding = filteredMetal.filter((b) => b.position === 'standing')

  // The coaching read is built from the last 60 days. After a longer break (the
  // off-season) nothing falls in that window, and the whole section used to
  // vanish: so fall back to the most recent bouts there are, and say so.
  const { recent, stale, daysSince } = useMemo(() => {
    const cutoff = Date.now() - WINDOW_DAYS * 86400_000
    const inWindow = bouts.filter((b) => new Date(b.shotAt).getTime() >= cutoff).slice(0, MAX_BOUTS)
    if (inWindow.length > 0 || bouts.length === 0) return { recent: inWindow, stale: false, daysSince: 0 }
    const latest = Math.max(...bouts.map((b) => new Date(b.shotAt).getTime()))
    return { recent: bouts.slice(0, MAX_BOUTS), stale: true, daysSince: Math.max(1, Math.round((Date.now() - latest) / 86400_000)) }
  }, [bouts])

  // Race metal bouts, grouped by the format they were raced under — a coach
  // wants to know how a sprint compares to a pursuit, not just one blended
  // number across every format ever raced.
  const raceTypeByWorkoutId = new Map(workouts.filter((w) => w.raceType).map((w) => [w.id, w.raceType as RaceType]))
  const raceMetal = metalBouts.filter((b) => raceTypeByWorkoutId.has(b.workoutId))
  const raceMetalByType = new Map<RaceType, MetalBout[]>()
  for (const b of raceMetal) {
    const type = raceTypeByWorkoutId.get(b.workoutId)
    if (!type) continue
    raceMetalByType.set(type, [...(raceMetalByType.get(type) ?? []), b])
  }
  const raceCount = new Set(raceMetal.map((b) => b.workoutId)).size
  // The formats actually raced, in a steady order, for the filter.
  const racedTypes = (Object.keys(RACE_TYPE_LABEL) as RaceType[]).filter((t) => raceMetalByType.has(t))
  const filteredRace = raceFilter === 'all' ? raceMetal : raceMetalByType.get(raceFilter) ?? []

  const raceWorkoutSeasonStart = new Map(
    workouts.filter((w) => w.raceType).map((w) => [w.id, seasonStartYear(new Date(w.startedAt))]),
  )
  const thisSeasonStart = seasonStartYear(new Date())
  const lastSeasonStart = thisSeasonStart - 1
  const raceMetalForSeason = (start: number) => filteredRace.filter((b) => raceWorkoutSeasonStart.get(b.workoutId) === start)
  const thisSeasonMetal = raceMetalForSeason(thisSeasonStart)
  const lastSeasonMetal = raceMetalForSeason(lastSeasonStart)
  const raceCountForSeason = (bs: MetalBout[]) => new Set(bs.map((b) => b.workoutId)).size

  const dryfire = dryfireMinutes(workouts)

  const findings = useMemo(() => analyse(recent, settings, workouts), [recent, settings, workouts])
  const metalFindings = useMemo(
    () => analyseMetal({ bouts: metalBouts, workouts, direction: shootingDirection }),
    [metalBouts, workouts, shootingDirection],
  )
  const metalRead = useMemo(() => metalWindow(metalBouts), [metalBouts])
  const plan = useMemo(() => recommend([...findings, ...metalFindings]), [findings, metalFindings])

  // Most recent N bouts for that position specifically, not a day-based
  // window — a coach checking in monthly wants "the last 10 I actually
  // shot", not "whatever fell inside the last 60 days".
  const proneWindowBouts = useMemo(
    () => [...metalProne].sort((a, b) => b.shotAt.localeCompare(a.shotAt)).slice(0, proneWindow),
    [metalProne, proneWindow],
  )
  const standingWindowBouts = useMemo(
    () => [...metalStanding].sort((a, b) => b.shotAt.localeCompare(a.shotAt)).slice(0, standingWindow),
    [metalStanding, standingWindow],
  )
  const targetsProne = useMemo(() => targetStats(proneWindowBouts), [proneWindowBouts])
  const targetsStanding = useMemo(() => targetStats(standingWindowBouts), [standingWindowBouts])
  const seriesProne = useMemo(() => targetSeries(proneWindowBouts), [proneWindowBouts])
  const seriesStanding = useMemo(() => targetSeries(standingWindowBouts), [standingWindowBouts])

  // The same per-target read for race shooting, counted in races: the most
  // recent N races (of the chosen format), then both positions from those.
  const recentRaceIds = useMemo(() => {
    const lastShot = new Map<string, string>()
    for (const b of filteredRace) {
      const prev = lastShot.get(b.workoutId)
      if (!prev || b.shotAt > prev) lastShot.set(b.workoutId, b.shotAt)
    }
    return [...lastShot.entries()].sort((x, y) => y[1].localeCompare(x[1])).map(([id]) => id)
  }, [filteredRace])
  const chosenRaces = useMemo(
    () => new Set(raceWindow === 'all' ? recentRaceIds : recentRaceIds.slice(0, raceWindow)),
    [recentRaceIds, raceWindow],
  )
  const raceProneBouts = useMemo(
    () => filteredRace.filter((b) => b.position === 'prone' && chosenRaces.has(b.workoutId)),
    [filteredRace, chosenRaces],
  )
  const raceStandingBouts = useMemo(
    () => filteredRace.filter((b) => b.position === 'standing' && chosenRaces.has(b.workoutId)),
    [filteredRace, chosenRaces],
  )
  const targetsRaceProne = useMemo(() => targetStats(raceProneBouts), [raceProneBouts])
  const targetsRaceStanding = useMemo(() => targetStats(raceStandingBouts), [raceStandingBouts])
  const seriesRaceProne = useMemo(() => targetSeries(raceProneBouts), [raceProneBouts])
  const seriesRaceStanding = useMemo(() => targetSeries(raceStandingBouts), [raceStandingBouts])

  if (bouts.length === 0 && metalBouts.length === 0 && dryfire.total === 0) {
    return (
      <>
        {!readOnly && <PageTitle>Analysis</PageTitle>}
        <div className="empty">
          <p>Nothing to analyse yet.</p>
          <p className="meta">
            Score a few bouts and this becomes a breakdown of your precision and metal shooting, with
            trends once you have a few — and a coaching read once you have three or four.
          </p>
        </div>
        <CollapsibleSection title="History" defaultOpen={false}>
          <HistoryView
            workouts={workouts} bouts={bouts} metalBouts={metalBouts} settings={settings} onChanged={onChanged}
            readOnly={readOnly} onAddCoachNote={onAddCoachNote}
          />
        </CollapsibleSection>
      </>
    )
  }

  const thin = recent.length > 0 && recent.length < 3

  return (
    <>
      {/* A coach is already under the athlete's name, so "Analysis" would only repeat it. */}
      {!readOnly && <PageTitle>Analysis</PageTitle>}

      {/* The advice reads every kind of shooting, so it sits under the page title
          rather than inside Precision. */}
      {(recent.length > 0 || metalFindings.length > 0) && (
        <CollapsibleSection title="Shooting advice" icon={<AppMark />}>
          {thin && (
            <div className="notice">
              This is a first read from very little recent data. Treat it as a hint until you have three
              or four bouts in each position — the confidence figures below will climb as you log more.
            </div>
          )}

          {recent.length > 0 && (
            <>
              <h3 style={{ marginTop: 0 }}>
                What your groups are saying
                <Help>
                  This reads your target photos. It cannot see your position, your breathing or your skis, and it
                  is no substitute for a coach watching you shoot — but it will tell you which question to ask one.
                </Help>
              </h3>
              <p className="lede" style={{ marginTop: -6 }}>
                {stale
                  ? `Built from your ${recent.length} most recent precision bout${recent.length === 1 ? '' : 's'}: your last was ${daysSince} days ago, beyond the ${WINDOW_DAYS}-day window this read normally uses.`
                  : `Built from your last ${recent.length} precision bout${recent.length === 1 ? '' : 's'} — the last ${WINDOW_DAYS} days, not your all-time record.`}
              </p>
              {findings.map((f, i) => <FindingCard key={`${f.id}-${i}`} f={f} />)}
            </>
          )}

          {metalFindings.length > 0 && (
            <>
              <h3 style={{ marginTop: recent.length > 0 ? 20 : 0 }}>
                What your metal shooting is saying
                <Help>
                  This reads which targets you hit, in which position and under what load. It cannot see how a shot
                  was released or where a miss went, so it points at steadiness and timing and leaves the rest to a coach.
                  Rules about your first and last shots need your shooting direction, set in Settings.
                </Help>
              </h3>
              <p className="lede" style={{ marginTop: -6 }}>
                {metalRead.stale
                  ? `Built from your ${metalRead.bouts.length} most recent metal bouts, older than the ${WINDOW_DAYS}-day window this read normally uses.`
                  : `Built from your last ${metalRead.bouts.length} metal bout${metalRead.bouts.length === 1 ? '' : 's'} — the last ${WINDOW_DAYS} days, not your all-time record.`}
              </p>
              {metalFindings.map((f, i) => <FindingCard key={`${f.id}-${i}`} f={f} />)}
            </>
          )}

          {plan.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>
                Your next two weeks
                <Help>
                  In order — the first one or two matter most, doing all six badly is worse than doing two
                  properly. Keep a session to 15–30 minutes and five to seven variations with one clear
                  focus, not a long list. Run each rep until it holds steady — usually well under a minute
                  — and if it never settles after a few tries, it's too hard today; back off rather than
                  force it. Close every session with a couple of calm dry-fire clips under normal
                  conditions.
                </Help>
              </h3>
              {plan.map(({ drill, reason }, i) => (
                <div key={drill.id} className="card">
                  <div className="badge" style={{ marginBottom: 4 }}>
                    {i + 1} · {drill.minutes} min · {drill.dryFire ? 'no range needed' : 'range'}
                  </div>
                  <h3>{drill.name}</h3>
                  <p>{drill.purpose}</p>
                  <p className="meta">Because of: {reason}. {drill.frequency}.</p>
                  <details open={openDrill === drill.id} onToggle={(e) =>
                    setOpenDrill((e.currentTarget as HTMLDetailsElement).open ? drill.id : null)
                  }>
                    <summary>How to do it</summary>
                    <ol className="steps">
                      {drill.steps.map((s, si) => <li key={si}>{s}</li>)}
                    </ol>
                  </details>
                </div>
              ))}
            </>
          )}

          <p className="meta" style={{ marginTop: 20, marginBottom: 0 }}>
            {openLibrary
              ? <button className="link" onClick={() => openLibrary()}>Want to know more?</button>
              : <a href={IBU_LIBRARY_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--series-1)', textDecoration: 'underline' }}>Want to know more?</a>}
          </p>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Precision" icon={sessionIcon('range')}>
        {bouts.length === 0 ? (
          // Most athletes haven't scored a target yet: say so once, and say what
          // to do, instead of three empty tiles and two empty charts.
          <div className="card">
            <p style={{ margin: '0 0 4px' }}><strong>No targets scored yet.</strong></p>
            <p className="meta" style={{ margin: 0 }}>
              Photograph a target after a precision session and your score, group size and trend appear here.
            </p>
          </div>
        ) : (
          <>
        <div className="stats three">
          <div className="stat range">
            <div className="k">Overall</div>
            <div className="v">{precisionPct(bouts)}</div>
            <div className="n">{bouts.length} bout{bouts.length === 1 ? '' : 's'}</div>
          </div>
          <div className="stat range">
            <div className="k">Prone</div>
            <div className="v">{precisionPct(prone)}</div>
            <div className="n">{prone.length} bout{prone.length === 1 ? '' : 's'}</div>
          </div>
          <div className="stat range">
            <div className="k">Standing</div>
            <div className="v">{precisionPct(standing)}</div>
            <div className="n">{standing.length} bout{standing.length === 1 ? '' : 's'}</div>
          </div>
        </div>

        <h3 style={{ marginTop: 20 }}>
          Score over time (%)
          <Help>Recent shows one mark per bout. The 7 days and 4 weeks views average each workout to one point, and the 12 months view averages each month, so you see the session's whole story, not its noisiest shot.</Help>
        </h3>
        <div className="card">
          <TrendChart bouts={bouts} workouts={workouts} metric="score" />
        </div>

        <h3>
          Group size over time (mm)
          <Help>
            Score says how you did. Group size says whether the shooting or the sight was responsible,
            because a group can tighten while the score stays flat.
          </Help>
        </h3>
        <div className="card">
          <TrendChart bouts={bouts} workouts={workouts} metric="group" />
        </div>
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Metal"
        icon={sessionIcon('range')}
        defaultOpen={false}
        // The order the targets are shot sits beside the title; the zone filters get the row below.
        headerExtraBelow
        titleExtra={shootingDirection && (
          <span className="meta" style={{ margin: 0 }}>
            {/* The whole phrase is the link to Settings, where it is changed. */}
            {!readOnly && onOpenSettings
              ? <button className="link" onClick={onOpenSettings}>Shooting {SHOOTING_DIRECTION_LABEL[shootingDirection]}</button>
              : <>Shooting {SHOOTING_DIRECTION_LABEL[shootingDirection]}</>}
          </span>
        )}
        headerExtra={presentZones.length > 0 && (
          <div className="seg" style={{ flex: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(
              [
                'all' as const,
                ...presentZones.map((zone) => ({ zone })),
              ] satisfies MetalFilter[]
            ).map((f) => {
              // Short label on the button itself (room is tight with a zone chip per
              // zone in use), full word for anyone using a screen reader.
              const fullLabel = typeof f === 'object' ? `Zone ${f.zone}` : 'All'
              const label = typeof f === 'object' ? `Z${f.zone}` : fullLabel
              const active = typeof f === 'object'
                ? typeof metalFilter === 'object' && metalFilter.zone === f.zone
                : metalFilter === f
              // Same colour as that zone's button in the "Start a combo" dialog, so a
              // zone reads as the same thing wherever it shows up.
              const color = typeof f === 'object' ? ZONE_COLOR[f.zone] : undefined
              return (
                <button
                  key={fullLabel}
                  aria-pressed={active}
                  aria-label={fullLabel}
                  onClick={() => setMetalFilter(f)}
                  style={{
                    padding: '4px 10px', fontSize: 11, borderRadius: 6, flex: 'none',
                    ...(color
                      ? active
                        ? { background: color, borderColor: color, color: '#fff' }
                        : { borderColor: color, color }
                      : {}),
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      >
        <div className="stats">
          <div className="stat range">
            <div className="k">Prone</div>
            <div className="v">{metalPct(metalProne)}</div>
            <div className="n">{metalProne.length} bout{metalProne.length === 1 ? '' : 's'}</div>
          </div>
          <div className="stat range">
            <div className="k">Standing</div>
            <div className="v">{metalPct(metalStanding)}</div>
            <div className="n">{metalStanding.length} bout{metalStanding.length === 1 ? '' : 's'}</div>
          </div>
        </div>

        {filteredMetal.length > 0 && (
          <>
            <h3 style={{ marginTop: 20 }}>
              Hit rate over time (%)
              <Help>
                Targets hit out of five, as a percentage. Recent shows one mark per bout. The 7 days and 4
                weeks views average each workout to one point, and the 12 months view averages each month.
                Prone is a circle and standing a diamond. With a zone selected above, only that zone's
                bouts are drawn.
              </Help>
            </h3>
            <div className="card">
              <TrendChart bouts={filteredMetal} workouts={workouts} metric="metal" />
            </div>
          </>
        )}

        <TargetHitRates position="prone" kind="metal" stats={targetsProne} series={seriesProne} windowSize={proneWindow} onWindowChange={setProneWindow} />
        <TargetHitRates position="standing" kind="metal" stats={targetsStanding} series={seriesStanding} windowSize={standingWindow} onWindowChange={setStandingWindow} />
      </CollapsibleSection>

      {raceCount > 0 && (
        <CollapsibleSection
          title="Race performance" icon={sessionIcon('race')} defaultOpen={false}
          headerExtra={racedTypes.length > 1 && (
            <div className="seg" style={{ flex: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(['all', ...racedTypes] as const).map((f) => {
                const active = raceFilter === f
                const label = f === 'all' ? 'All' : RACE_TYPE_LABEL[f]
                return (
                  <button
                    key={f} aria-pressed={active} onClick={() => setRaceFilter(f)}
                    style={{
                      padding: '4px 10px', fontSize: 11, borderRadius: 6, flex: 'none',
                      ...(active
                        ? { background: RACE_COLOUR, borderColor: RACE_COLOUR, color: '#fff' }
                        : { borderColor: RACE_COLOUR, color: RACE_COLOUR }),
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
        >
          <p className="meta" style={{ marginTop: 0, marginBottom: 4 }}>This season ({seasonLabel(thisSeasonStart)})</p>
          <MetalPositionStats bouts={thisSeasonMetal} races={raceCountForSeason(thisSeasonMetal)} />

          {lastSeasonMetal.length > 0 && (
            <>
              <p className="meta" style={{ marginTop: 12, marginBottom: 4 }}>Last season ({seasonLabel(lastSeasonStart)})</p>
              <MetalPositionStats bouts={lastSeasonMetal} races={raceCountForSeason(lastSeasonMetal)} />
            </>
          )}

          {/* Only when there's something older than the two seasons above. */}
          {raceCountForSeason(filteredRace) > raceCountForSeason(thisSeasonMetal) + raceCountForSeason(lastSeasonMetal) && (
            <>
              <p className="meta" style={{ marginTop: 12, marginBottom: 4 }}>All-time</p>
              <MetalPositionStats bouts={filteredRace} races={raceCountForSeason(filteredRace)} />
            </>
          )}

          <RaceTargetHitRates
            prone={targetsRaceProne} standing={targetsRaceStanding}
            proneSeries={seriesRaceProne} standingSeries={seriesRaceStanding}
            windowValue={raceWindow} onWindowChange={setRaceWindow}
          />
        </CollapsibleSection>
      )}

      {dryfire.total > 0 && (
        <CollapsibleSection title="Dry-fire" icon={sessionIcon('dryfire')} defaultOpen={false}>
          <div className="stats three">
            <div className="stat dryfire">
              <div className="k">This week</div>
              <div className="v">{dryfire.week}<small>min</small></div>
            </div>
            <div className="stat dryfire">
              <div className="k">This month</div>
              <div className="v">{dryfire.month}<small>min</small></div>
            </div>
            <div className="stat dryfire">
              <div className="k">Total</div>
              <div className="v">{dryfire.total}<small>min</small></div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title={`History (${workouts.length} workout${workouts.length === 1 ? '' : 's'})`} defaultOpen={false}
      >
        <HistoryView
          workouts={workouts} bouts={bouts} metalBouts={metalBouts} settings={settings} onChanged={onChanged}
          readOnly={readOnly} onAddCoachNote={onAddCoachNote}
        />
      </CollapsibleSection>
    </>
  )
}
