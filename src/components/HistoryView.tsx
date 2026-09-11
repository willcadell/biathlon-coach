import { useEffect, useState } from 'react'
import type { Bout, MetalBout, Settings, Workout } from '../lib/types'
import { faceById } from '../lib/types'
import { DISCS_PER_METAL_BOUT } from '../lib/metal'
import { deleteBout, deleteMetalBout, deleteWorkout, getImage } from '../lib/db'
import { ResultsView } from './ResultsView'
import { TrendChart } from './TrendChart'

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const WIND_LABEL: Record<Workout['wind'], string> = { none: 'No wind', light: 'Light wind', moderate: 'Moderate wind', strong: 'Strong wind' }

interface Props {
  workouts: Workout[]
  bouts: Bout[]
  metalBouts: MetalBout[]
  settings: Settings
  onChanged: () => void
}

export function HistoryView({ workouts, bouts, metalBouts, settings, onChanged }: Props) {
  const [openWorkoutId, setOpenWorkoutId] = useState<string | null>(null)
  const [openBoutId, setOpenBoutId] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const stopSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  async function removeSelected() {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} workout${ids.length === 1 ? '' : 's'} and everything shot in ${ids.length === 1 ? 'it' : 'them'}? This cannot be undone.`)) return
    await Promise.all(ids.map(deleteWorkout))
    stopSelecting()
    onChanged()
  }

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    void Promise.all(
      bouts.map(async (b) => {
        const img = await getImage(b.imageId)
        if (!img) return null
        const url = URL.createObjectURL(img.thumb)
        urls.push(url)
        return [b.id, url] as const
      }),
    ).then((pairs) => {
      if (cancelled) {
        urls.forEach(URL.revokeObjectURL)
        return
      }
      setThumbs(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)))
    })
    return () => {
      cancelled = true
      urls.forEach(URL.revokeObjectURL)
    }
  }, [bouts])

  const openBout = bouts.find((b) => b.id === openBoutId)
  if (openBout) {
    const boutWorkout = workouts.find((w) => w.id === openBout.workoutId)
    return (
      <>
        <button className="link" onClick={() => setOpenBoutId(null)}>← Back to workout</button>
        <h1 style={{ marginTop: 10 }}>{openBout.position === 'prone' ? 'Prone' : 'Standing'}</h1>
        <p className="lede">{fmt(openBout.shotAt)}</p>
        <ResultsView bout={openBout} settings={settings} workout={boutWorkout} />
        <button
          className="secondary danger"
          style={{ marginTop: 16 }}
          onClick={async () => {
            if (!confirm('Delete this bout and its photo? This cannot be undone.')) return
            await deleteBout(openBout.id)
            setOpenBoutId(null)
            onChanged()
          }}
        >
          Delete this bout
        </button>
      </>
    )
  }

  const openWorkout = workouts.find((w) => w.id === openWorkoutId)
  if (openWorkout) {
    const ownBouts = bouts.filter((b) => b.workoutId === openWorkout.id)
    const ownMetal = metalBouts.filter((m) => m.workoutId === openWorkout.id)
    const entries = [...ownBouts, ...ownMetal].sort((a, b) => a.shotAt.localeCompare(b.shotAt))

    return (
      <>
        <button className="link" onClick={() => setOpenWorkoutId(null)}>← All workouts</button>
        <h1 style={{ marginTop: 10 }}>Workout</h1>
        <p className="lede">
          {fmt(openWorkout.startedAt)} · {WIND_LABEL[openWorkout.wind]}
          {openWorkout.wind !== 'none' && ` from ${openWorkout.windDirection} o'clock`}
        </p>

        {openWorkout.clickLog.length > 0 && (
          <div className="card">
            <h3>Zero clicks logged</h3>
            {openWorkout.clickLog.map((c) => (
              <p key={c.id} className="meta" style={{ marginBottom: 4 }}>
                {c.vertical > 0 && `${c.vertical} click${c.vertical === 1 ? '' : 's'} ${c.verticalDir}`}
                {c.vertical > 0 && c.horizontal > 0 && ', '}
                {c.horizontal > 0 && `${c.horizontal} click${c.horizontal === 1 ? '' : 's'} ${c.horizontalDir}`}
                {c.note && ` — ${c.note}`}
              </p>
            ))}
          </div>
        )}

        <h2>Entries</h2>
        {entries.length === 0 && <p className="meta">Nothing was added to this workout.</p>}
        {entries.map((e) =>
          e.kind === 'precision' ? (
            <button key={e.id} className="boutrow" onClick={() => setOpenBoutId(e.id)}>
              {thumbs[e.id] ? <img src={thumbs[e.id]} alt="" /> : <div style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--grid)', flex: 'none' }} />}
              <div className="grow">
                <div className="title">{e.metrics.ringTotal}/{e.metrics.ringPossible} <span className="pill">{e.position}</span></div>
                <div className="meta">{fmt(e.shotAt)} · {e.metrics.meanRadius.toFixed(0)} mm mean radius</div>
              </div>
              <span className="meta" aria-hidden="true">›</span>
            </button>
          ) : (
            <div key={e.id} className="boutrow" style={{ cursor: 'default' }}>
              <div className="grow">
                <div className="title">{DISCS_PER_METAL_BOUT - e.misses}/{DISCS_PER_METAL_BOUT} hits <span className="pill">{e.position}</span></div>
                <div className="meta">{fmt(e.shotAt)} · metal</div>
              </div>
              <button
                className="link"
                onClick={async () => {
                  if (!confirm('Delete this metal bout?')) return
                  await deleteMetalBout(e.id)
                  onChanged()
                }}
              >
                Remove
              </button>
            </div>
          ),
        )}

        <button
          className="secondary danger"
          style={{ marginTop: 16 }}
          onClick={async () => {
            if (!confirm('Delete this whole workout, its bouts and their photos? This cannot be undone.')) return
            await deleteWorkout(openWorkout.id)
            setOpenWorkoutId(null)
            onChanged()
          }}
        >
          Delete this workout
        </button>
      </>
    )
  }

  if (workouts.length === 0) {
    return (
      <>
        <h1>History</h1>
        <div className="empty">
          <p>No workouts yet.</p>
          <p className="meta">Start a workout from the Shoot tab and it will appear here, with trends once you have a few.</p>
        </div>
      </>
    )
  }

  const total = bouts.reduce((n, b) => n + b.shots.length, 0)
  const metalShots = metalBouts.length * DISCS_PER_METAL_BOUT
  const prone = bouts.filter((b) => b.position === 'prone')
  const standing = bouts.filter((b) => b.position === 'standing')
  const metalProne = metalBouts.filter((b) => b.position === 'prone')
  const metalStanding = metalBouts.filter((b) => b.position === 'standing')
  /** Ring points scored as a percentage of what was possible — a ring value
   *  out of 10 turned into the same units as a metal hit rate, so the two
   *  disciplines read side by side without pretending they are one score. */
  const precisionPct = (set: Bout[]) => {
    const shots = set.reduce((n, b) => n + b.shots.length, 0)
    if (!shots) return '—'
    const avg = set.reduce((n, b) => n + b.metrics.ringTotal, 0) / shots
    return `${Math.round((avg / 10) * 100)}%`
  }
  const metalPct = (set: MetalBout[]) => {
    const shots = set.length * DISCS_PER_METAL_BOUT
    if (!shots) return '—'
    const misses = set.reduce((n, b) => n + b.misses, 0)
    return `${Math.round(((shots - misses) / shots) * 100)}%`
  }
  const mixedFaces = new Set(bouts.map((b) => b.targetFaceId)).size > 1

  return (
    <>
      <h1>History</h1>
      <p className="lede">
        {workouts.length} workout{workouts.length === 1 ? '' : 's'}, {bouts.length} precision bout{bouts.length === 1 ? '' : 's'}
        {' '}({total} shot{total === 1 ? '' : 's'}), {metalBouts.length} metal bout{metalBouts.length === 1 ? '' : 's'}
        {' '}({metalShots} shot{metalShots === 1 ? '' : 's'}).
      </p>

      <h3>Overall</h3>
      <div className="stats">
        <div className="stat">
          <div className="k">Precision</div>
          <div className="v">{precisionPct(bouts)}</div>
          <div className="n">{bouts.length} bout{bouts.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="k">Metal</div>
          <div className="v">{metalPct(metalBouts)}</div>
          <div className="n">{metalBouts.length} bout{metalBouts.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <h3 style={{ marginTop: 16 }}>Precision</h3>
      <div className="stats">
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

      <h3 style={{ marginTop: 16 }}>Metal</h3>
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

      {bouts.length >= 2 && (
        <>
          <h2>Score over time</h2>
          <div className="card">
            <TrendChart bouts={bouts} metric="score" />
          </div>

          <h2>Group size over time</h2>
          <p className="lede">
            Score says how you did. Group size says whether the shooting or the sight was
            responsible, because a group can tighten while the score stays flat.
          </p>
          <div className="card">
            <TrendChart bouts={bouts} metric="group" />
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '24px 0 8px' }}>
        <h2 style={{ margin: 0 }}>Workouts</h2>
        <button className="link" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
          {selecting ? 'Cancel' : 'Select'}
        </button>
      </div>
      {workouts.map((w) => {
        const ownBouts = bouts.filter((b) => b.workoutId === w.id)
        const ownMetal = metalBouts.filter((m) => m.workoutId === w.id)
        return (
          <button
            key={w.id}
            className="boutrow"
            aria-pressed={selecting ? selected.has(w.id) : undefined}
            onClick={() => (selecting ? toggle(w.id) : setOpenWorkoutId(w.id))}
          >
            {selecting && (
              <span className={`tick ${selected.has(w.id) ? 'on' : ''}`} aria-hidden="true">
                {selected.has(w.id) ? '✓' : ''}
              </span>
            )}
            <div className="grow">
              <div className="title">
                {fmt(w.startedAt)}
                {w.wind !== 'none' && <span className="pill">{w.wind} wind</span>}
              </div>
              <div className="meta">
                {ownBouts.length} precision · {ownMetal.length} metal
                {mixedFaces && ownBouts.length > 0 && ` · ${faceById(ownBouts[0].targetFaceId).name}`}
              </div>
            </div>
            {!selecting && <span className="meta" aria-hidden="true">›</span>}
          </button>
        )
      })}

      {selecting && (
        <div className="selectbar">
          <span className="meta">{selected.size} selected</span>
          <button className="secondary danger" disabled={selected.size === 0} onClick={removeSelected}>
            Delete
          </button>
        </div>
      )}
    </>
  )
}
