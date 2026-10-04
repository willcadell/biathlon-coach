import { useMemo, useState } from 'react'
import type { Bout, MetalBout, RaceType, Settings, Workout } from '../lib/types'
import { RACE_TYPE_LABEL } from '../lib/types'
import { ofWorkouts } from '../lib/scope'
import { Help } from './Help'
import { ChevronIcon, DryfireIcon, RaceMedalIcon, RangeIcon } from './icons'
import { DISCS_PER_METAL_BOUT, ZONE_COLOR, hitsOf, missCount, targetStats, type TargetStat } from '../lib/metal'
import { analyse } from '../lib/diagnostics'
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

/** The five discs' hit rates as tiles, alpha to echo. `tone="race"` gives them
 *  the Race colour, for everything in the Race performance section. */
function TargetTiles({ stats, tone }: { stats: TargetStat[]; tone?: 'race' }) {
  // Discs are round, so the tiles are circles. minmax(0, 1fr) and small type so
  // five of them fit a phone's width instead of running off the right edge.
  return (
    <div className="stats" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
      {stats.map((t) => (
        <div
          className={`stat${tone ? ` ${tone}` : ''}`} key={t.target}
          style={{
            aspectRatio: '1', borderRadius: '50%', padding: 0, minWidth: 0, textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div className="k" style={{ fontSize: 9, letterSpacing: '0.02em' }}>{t.target}</div>
          <div className="v" style={{ fontSize: 17, marginTop: 0 }}>{t.hitRatePct}<small>%</small></div>
          <div className="n" style={{ fontSize: 10 }}>{t.hits}/{t.bouts}</div>
        </div>
      ))}
    </div>
  )
}

/** "Which targets get hit": the hit rate of each of the five discs for one
 *  position, from the most recent 5, 10 or 20 bouts. Used for range metal and,
 *  separately, for race metal. */
function TargetHitRates({
  position, kind, stats, windowSize, onWindowChange,
}: {
  position: 'prone' | 'standing'
  /** What the bouts are, for the caption: "metal" or "race". */
  kind: string
  stats: TargetStat[]
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
      <p className="meta" style={{ marginTop: -6 }}>
        Hit rate per target, alpha to echo, left to right downrange — last {bouts} {position} {kind} bout{bouts === 1 ? '' : 's'}.
      </p>
      <TargetTiles stats={stats} />
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
  prone, standing, windowValue, onWindowChange,
}: {
  prone: TargetStat[]
  standing: TargetStat[]
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
      <p className="meta" style={{ marginTop: 0 }}>
        Hit rate per target, alpha to echo, left to right downrange.
      </p>
      {prone.length > 0 && (
        <>
          <p className="meta" style={{ margin: '10px 0 4px' }}>Prone · {bouts(prone)} bout{bouts(prone) === 1 ? '' : 's'}</p>
          <TargetTiles stats={prone} tone="race" />
        </>
      )}
      {standing.length > 0 && (
        <>
          <p className="meta" style={{ margin: '10px 0 4px' }}>Standing · {bouts(standing)} bout{bouts(standing) === 1 ? '' : 's'}</p>
          <TargetTiles stats={standing} tone="race" />
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

export function CollapsibleSection({
  title, icon, defaultOpen = true, headerExtra, children,
}: {
  title: string
  /** Shown before the title, e.g. a session kind's icon. */
  icon?: React.ReactNode
  defaultOpen?: boolean
  headerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
        </div>
        {open && headerExtra}
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
}) {
  // Only bouts shot in the workouts we were given — see scope.ts.
  const bouts = useMemo(() => ofWorkouts(suppliedBouts, workouts), [suppliedBouts, workouts])
  const metalBouts = useMemo(() => ofWorkouts(suppliedMetalBouts, workouts), [suppliedMetalBouts, workouts])
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

  const recent = useMemo(() => {
    const cutoff = Date.now() - WINDOW_DAYS * 86400_000
    return bouts.filter((b) => new Date(b.shotAt).getTime() >= cutoff).slice(0, MAX_BOUTS)
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
  const plan = useMemo(() => recommend(findings), [findings])

  // Most recent N bouts for that position specifically, not a day-based
  // window — a coach checking in monthly wants "the last 10 I actually
  // shot", not "whatever fell inside the last 60 days".
  const targetsProne = useMemo(() => {
    const sorted = [...metalProne].sort((a, b) => b.shotAt.localeCompare(a.shotAt))
    return targetStats(sorted.slice(0, proneWindow))
  }, [metalProne, proneWindow])
  const targetsStanding = useMemo(() => {
    const sorted = [...metalStanding].sort((a, b) => b.shotAt.localeCompare(a.shotAt))
    return targetStats(sorted.slice(0, standingWindow))
  }, [metalStanding, standingWindow])

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
  const targetsRaceProne = useMemo(
    () => targetStats(filteredRace.filter((b) => b.position === 'prone' && chosenRaces.has(b.workoutId))),
    [filteredRace, chosenRaces],
  )
  const targetsRaceStanding = useMemo(
    () => targetStats(filteredRace.filter((b) => b.position === 'standing' && chosenRaces.has(b.workoutId))),
    [filteredRace, chosenRaces],
  )

  if (bouts.length === 0 && metalBouts.length === 0 && dryfire.total === 0) {
    return (
      <>
        {!readOnly && <h1>Analysis</h1>}
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
      {!readOnly && <h1>Analysis</h1>}

      <CollapsibleSection title="Precision" icon={sessionIcon('range')}>
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

        {thin && (
          <div className="notice" style={{ marginTop: 16 }}>
            This is a first read from very little recent data. Treat it as a hint until you have three
            or four bouts in each position — the confidence figures below will climb as you log more.
          </div>
        )}

        {recent.length > 0 && (
          <h3 style={{ marginTop: 20 }}>
            What your groups are saying
            <Help>
              This reads your target photos and nothing else. It cannot see your position, your
              breathing or your skis, and it is no substitute for a coach watching you shoot — but it
              will tell you which question to ask one.
            </Help>
          </h3>
        )}
        {recent.length > 0 && (
          <p className="lede" style={{ marginTop: -6 }}>
            Built from your last {recent.length} precision bout{recent.length === 1 ? '' : 's'} —
            the last {WINDOW_DAYS} days, not your all-time record.
          </p>
        )}
        {findings.map((f, i) => (
          <div key={`${f.id}-${i}`} className={`finding ${f.severity}`}>
            <div className="badge">
              <i className="dot" />
              {f.severity === 'priority' ? 'Work on this' : f.severity === 'watch' ? 'Keep an eye on' : 'Doing well'}
            </div>
            <h3>{f.title}</h3>
            <p>{f.evidence}</p>
            <p className="cause">{f.cause}</p>
            <p className="meta">
              {Math.round(f.confidence * 100)}% confidence, from {f.sampleSize} bout
              {f.sampleSize === 1 ? '' : 's'}
            </p>
          </div>
        ))}

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

        <h3 style={{ marginTop: 20 }}>
          Score over time
          <Help>Averaged to one point per workout, not per bout — a session's whole story, not its noisiest shot.</Help>
        </h3>
        <div className="card">
          <TrendChart bouts={bouts} workouts={workouts} metric="score" />
        </div>

        <h3>
          Group size over time
          <Help>
            Score says how you did. Group size says whether the shooting or the sight was responsible,
            because a group can tighten while the score stays flat.
          </Help>
        </h3>
        <div className="card">
          <TrendChart bouts={bouts} workouts={workouts} metric="group" />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Metal"
        icon={sessionIcon('range')}
        defaultOpen={false}
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

        <TargetHitRates position="prone" kind="metal" stats={targetsProne} windowSize={proneWindow} onWindowChange={setProneWindow} />
        <TargetHitRates position="standing" kind="metal" stats={targetsStanding} windowSize={standingWindow} onWindowChange={setStandingWindow} />
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
