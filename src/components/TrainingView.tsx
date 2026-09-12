import { useMemo, useState } from 'react'
import type { Bout, MetalBout, Settings } from '../lib/types'
import { analyse } from '../lib/diagnostics'
import { recommend } from '../lib/training'
import { metalStats, targetStats } from '../lib/metal'

/** Bouts older than this stop counting — technique from three months ago is history. */
const WINDOW_DAYS = 60
const MAX_BOUTS = 20

export function TrainingView({ bouts, metalBouts, settings }: { bouts: Bout[]; metalBouts: MetalBout[]; settings: Settings }) {
  const [openDrill, setOpenDrill] = useState<string | null>(null)

  const recent = useMemo(() => {
    const cutoff = Date.now() - WINDOW_DAYS * 86400_000
    return bouts.filter((b) => new Date(b.shotAt).getTime() >= cutoff).slice(0, MAX_BOUTS)
  }, [bouts])

  const recentMetal = useMemo(() => {
    const cutoff = Date.now() - WINDOW_DAYS * 86400_000
    return metalBouts.filter((b) => new Date(b.shotAt).getTime() >= cutoff)
  }, [metalBouts])

  const findings = useMemo(() => analyse(recent, settings), [recent, settings])
  const plan = useMemo(() => recommend(findings), [findings])
  const metal = useMemo(() => metalStats(recentMetal), [recentMetal])
  const targets = useMemo(() => targetStats(recentMetal), [recentMetal])

  if (recent.length === 0 && metal.length === 0) {
    return (
      <>
        <h1>Training</h1>
        <div className="empty">
          <p>Nothing to work from yet.</p>
          <p className="meta">
            Score a few bouts and this becomes a training week built from what your groups actually
            look like. Three or four bouts is enough for the first read.
          </p>
        </div>
      </>
    )
  }

  const thin = recent.length > 0 && recent.length < 3

  return (
    <>
      <h1>Training</h1>
      {recent.length > 0 && (
        <p className="lede">
          Built from your last {recent.length} precision bout{recent.length === 1 ? '' : 's'}.
        </p>
      )}

      {metal.length > 0 && (
        <>
          <h2>On the metal</h2>
          <p className="lede">
            Hit rate is the number a race turns on. A metal bout has no photo to read shape from, so
            this tracks separately from the coaching below.
          </p>
          <div className="stats">
            {metal.map((s) => (
              <div className="stat" key={s.position}>
                <div className="k">{s.position}</div>
                <div className="v">{s.hitRatePct.toFixed(0)}<small>%</small></div>
                <div className="n">{s.bouts} bout{s.bouts === 1 ? '' : 's'}, {s.totalMisses} miss{s.totalMisses === 1 ? '' : 'es'}</div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 16 }}>Which targets get missed</h3>
          <p className="meta" style={{ marginTop: -6 }}>
            Miss rate per target, alpha to echo, left to right downrange.
          </p>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {targets.map((t) => (
              <div className="stat" key={t.target}>
                <div className="k">{t.target}</div>
                <div className="v">{t.missRatePct}<small>%</small></div>
                <div className="n">{t.misses}/{t.bouts}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {thin && (
        <div className="notice">
          This is a first read from very little data. Treat it as a hint until you have three or four
          bouts in each position — the confidence figures below will climb as you log more.
        </div>
      )}

      {recent.length > 0 && <h2>What your groups are saying</h2>}
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
    </>
  )
}
