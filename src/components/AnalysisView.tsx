import { useMemo, useState } from 'react'
import type { Bout, MetalBout, Settings, Workout } from '../lib/types'
import { DISCS_PER_METAL_BOUT, hitsOf, missCount, targetStats } from '../lib/metal'
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

export function AnalysisView({
  bouts,
  metalBouts,
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
  const [openDrill, setOpenDrill] = useState<string | null>(null)
  const [proneWindow, setProneWindow] = useState<5 | 10 | 20>(10)
  const [standingWindow, setStandingWindow] = useState<5 | 10 | 20>(10)
  const [metalFilter, setMetalFilter] = useState<'all' | 'training' | 'race'>('all')

  const prone = bouts.filter((b) => b.position === 'prone')
  const standing = bouts.filter((b) => b.position === 'standing')
  const filteredMetal = metalBouts.filter((b) =>
    metalFilter === 'all' ? true : metalFilter === 'race' ? b.isRace : !b.isRace,
  )
  const metalProne = filteredMetal.filter((b) => b.position === 'prone')
  const metalStanding = filteredMetal.filter((b) => b.position === 'standing')

  const recent = useMemo(() => {
    const cutoff = Date.now() - WINDOW_DAYS * 86400_000
    return bouts.filter((b) => new Date(b.shotAt).getTime() >= cutoff).slice(0, MAX_BOUTS)
  }, [bouts])

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

  if (bouts.length === 0 && metalBouts.length === 0) {
    return (
      <>
        <h1>Analysis</h1>
        <div className="empty">
          <p>Nothing to analyse yet.</p>
          <p className="meta">
            Score a few bouts and this becomes a breakdown of your precision and metal shooting, with
            trends once you have a few — and a coaching read once you have three or four.
          </p>
        </div>
        <details style={{ marginTop: 20 }}>
          <summary>History</summary>
          <div style={{ marginTop: 12 }}>
            <HistoryView
              workouts={workouts} bouts={bouts} metalBouts={metalBouts} settings={settings} onChanged={onChanged}
              readOnly={readOnly} onAddCoachNote={onAddCoachNote}
            />
          </div>
        </details>
      </>
    )
  }

  const thin = recent.length > 0 && recent.length < 3

  return (
    <>
      <h1>Analysis</h1>

      <h3>Precision</h3>
      <div className="stats three">
        <div className="stat">
          <div className="k">Overall</div>
          <div className="v">{precisionPct(bouts)}</div>
          <div className="n">{bouts.length} bout{bouts.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="k">Prone</div>
          <div className="v">{precisionPct(prone)}</div>
          <div className="n">{prone.length} bout{prone.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
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

      {recent.length > 0 && <h2 style={{ marginTop: 20 }}>What your groups are saying</h2>}
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
          <h2>Your next two weeks</h2>
          <p className="lede">
            In order. The first one or two matter most — doing all six badly is worse than doing two
            properly.
          </p>
          <p className="meta" style={{ marginTop: -10 }}>
            Keep a session to 15–30 minutes and five to seven variations with one clear focus, not a
            long list. Run each rep until it holds steady — usually well under a minute — and if it
            never settles after a few tries, it's too hard today; back off rather than force it. Close
            every session with a couple of calm dry-fire clips under normal conditions.
          </p>
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

      {recent.length > 0 && (
        <p className="meta" style={{ marginTop: 20 }}>
          This reads your target photos and nothing else. It cannot see your position, your breathing
          or your skis, and it is no substitute for a coach watching you shoot — but it will tell you
          which question to ask one.
        </p>
      )}

      <h2 style={{ marginTop: 24 }}>Score over time</h2>
      <p className="lede">
        Averaged to one point per workout, not per bout — a session's whole story, not its noisiest shot.
      </p>
      <div className="card">
        <TrendChart bouts={bouts} workouts={workouts} metric="score" />
      </div>

      <h2>Group size over time</h2>
      <p className="lede">
        Score says how you did. Group size says whether the shooting or the sight was
        responsible, because a group can tighten while the score stays flat.
      </p>
      <div className="card">
        <TrendChart bouts={bouts} workouts={workouts} metric="group" />
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 24 }}>
        <h3 style={{ margin: 0 }}>Metal</h3>
        {metalBouts.some((b) => b.isRace) && (
          <div className="seg" style={{ flex: 'none', width: 168 }}>
            {(['all', 'training', 'race'] as const).map((f) => (
              <button
                key={f}
                aria-pressed={metalFilter === f}
                onClick={() => setMetalFilter(f)}
                style={{ padding: '4px 6px', fontSize: 11, borderRadius: 6 }}
              >
                {f === 'all' ? 'All' : f === 'training' ? 'Training' : 'Race'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="stats">
        <div className="stat">
          <div className="k">Prone</div>
          <div className="v">{metalPct(metalProne)}</div>
          <div className="n">{metalProne.length} bout{metalProne.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="k">Standing</div>
          <div className="v">{metalPct(metalStanding)}</div>
          <div className="n">{metalStanding.length} bout{metalStanding.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {targetsProne.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 20 }}>
            <h2 style={{ margin: 0 }}>Which targets get hit — prone</h2>
            <div className="seg" style={{ flex: 'none', width: 96 }}>
              {([5, 10, 20] as const).map((n) => (
                <button
                  key={n}
                  aria-pressed={proneWindow === n}
                  onClick={() => setProneWindow(n)}
                  style={{ padding: '4px 6px', fontSize: 11, borderRadius: 6 }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <p className="meta" style={{ marginTop: -6 }}>
            Hit rate per target, alpha to echo, left to right downrange — last {targetsProne[0]?.bouts ?? 0}{' '}
            prone metal bout{targetsProne[0]?.bouts === 1 ? '' : 's'}.
          </p>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {targetsProne.map((t) => (
              <div className="stat" key={t.target}>
                <div className="k">{t.target}</div>
                <div className="v">{t.hitRatePct}<small>%</small></div>
                <div className="n">{t.hits}/{t.bouts}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {targetsStanding.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 20 }}>
            <h2 style={{ margin: 0 }}>Which targets get hit — standing</h2>
            <div className="seg" style={{ flex: 'none', width: 96 }}>
              {([5, 10, 20] as const).map((n) => (
                <button
                  key={n}
                  aria-pressed={standingWindow === n}
                  onClick={() => setStandingWindow(n)}
                  style={{ padding: '4px 6px', fontSize: 11, borderRadius: 6 }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <p className="meta" style={{ marginTop: -6 }}>
            Hit rate per target, alpha to echo, left to right downrange — last {targetsStanding[0]?.bouts ?? 0}{' '}
            standing metal bout{targetsStanding[0]?.bouts === 1 ? '' : 's'}.
          </p>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {targetsStanding.map((t) => (
              <div className="stat" key={t.target}>
                <div className="k">{t.target}</div>
                <div className="v">{t.hitRatePct}<small>%</small></div>
                <div className="n">{t.hits}/{t.bouts}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <details style={{ marginTop: 24 }}>
        <summary>
          History ({workouts.length} workout{workouts.length === 1 ? '' : 's'})
        </summary>
        <div style={{ marginTop: 12 }}>
          <HistoryView
            workouts={workouts} bouts={bouts} metalBouts={metalBouts} settings={settings} onChanged={onChanged}
            readOnly={readOnly} onAddCoachNote={onAddCoachNote}
          />
        </div>
      </details>
    </>
  )
}
