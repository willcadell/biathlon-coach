import { useEffect, useState } from 'react'
import type { Bout, ClickAdjustment, MetalBout, Settings, Workout } from '../lib/types'
import { RACE_TYPE_LABEL, faceById } from '../lib/types'
import { DISCS_PER_METAL_BOUT, hitCount, hitsOf } from '../lib/metal'
import { boutImageUrl, boutThumbUrls, deleteBout, deleteMetalBout, deleteWorkout } from '../lib/db'
import { shareTargetImage } from '../lib/share'
import { errorMessage } from '../lib/errors'
import { ResultsView } from './ResultsView'
import { MiniTargets } from './MiniTargets'
import { ShareIcon, TrashIcon } from './icons'

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const WIND_LABEL: Record<Workout['wind'], string> = { none: 'No wind', light: 'Light wind', moderate: 'Moderate wind', strong: 'Strong wind' }

/** A one-line total of every zero adjustment logged this workout, for beside
 *  the wind — the click log below still lists each one with its note. */
function clickSummary(clickLog: ClickAdjustment[]): string {
  const up = clickLog.filter((c) => c.verticalDir === 'up').reduce((n, c) => n + c.vertical, 0)
  const down = clickLog.filter((c) => c.verticalDir === 'down').reduce((n, c) => n + c.vertical, 0)
  const left = clickLog.filter((c) => c.horizontalDir === 'left').reduce((n, c) => n + c.horizontal, 0)
  const right = clickLog.filter((c) => c.horizontalDir === 'right').reduce((n, c) => n + c.horizontal, 0)
  const clips = clickLog.reduce((n, c) => n + c.clips, 0)

  const moves = [up && `${up}↑`, down && `${down}↓`, left && `${left}←`, right && `${right}→`].filter(Boolean)
  const clipsPart = clips > 0 ? `${clips} clip${clips === 1 ? '' : 's'}` : ''
  if (moves.length === 0) return clipsPart || 'no movement'
  return clipsPart ? `${moves.join(' ')} · ${clipsPart}` : moves.join(' ')
}

/** Feedback a coach left on a workout, plus the form to add another — the
 *  one write a read-only coach view is allowed. Hidden entirely when there
 *  is nothing to show and no one who can add anything. */
function CoachNotesCard({
  workout,
  onAdd,
}: {
  workout: Workout
  onAdd?: (workoutId: string, note: string) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  if (workout.coachNotes.length === 0 && !onAdd) return null

  async function submit() {
    if (!onAdd || !note.trim()) return
    setSaving(true)
    try {
      await onAdd(workout.id, note.trim())
      setNote('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <h3>Coach notes</h3>
      {workout.coachNotes.length === 0 && <p className="meta" style={{ marginTop: 0 }}>Nothing left yet.</p>}
      {workout.coachNotes.map((n) => (
        <div key={n.id} style={{ marginBottom: 10 }}>
          <p style={{ margin: 0 }}>{n.note}</p>
          <p className="meta" style={{ margin: 0 }}>{n.coachName} · {fmt(n.createdAt)}</p>
        </div>
      ))}
      {onAdd && (
        <div style={{ marginTop: workout.coachNotes.length > 0 ? 14 : 0 }}>
          <label className="field" style={{ marginBottom: 8 }}>
            <span>Add a note<small>Visible to the athlete and any other coach on their club.</small></span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="secondary" onClick={() => void submit()} disabled={saving || !note.trim()}>
            {saving ? 'Saving…' : 'Add note'}
          </button>
        </div>
      )}
    </div>
  )
}

interface Props {
  workouts: Workout[]
  bouts: Bout[]
  metalBouts: MetalBout[]
  settings: Settings
  onChanged: () => void
  /** True when viewing someone else's history (a coach on their roster) —
   *  hides every delete and bulk-select action, since nothing here can be
   *  written by the viewer except a coach note. */
  readOnly?: boolean
  /** Present only for a coach viewing a linked athlete — lets them leave
   *  feedback on a specific workout, the one write allowed in read-only
   *  mode. Omitted entirely for an athlete looking at their own history. */
  onAddCoachNote?: (workoutId: string, note: string) => Promise<void>
}

export function HistoryView({ workouts, bouts, metalBouts, settings, onChanged, readOnly, onAddCoachNote }: Props) {
  const [openWorkoutId, setOpenWorkoutId] = useState<string | null>(null)
  const [openBoutId, setOpenBoutId] = useState<string | null>(null)
  const [openBoutImage, setOpenBoutImage] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sharingBoutId, setSharingBoutId] = useState<string | null>(null)
  const [shareError, setShareError] = useState('')

  async function shareBout(bout: Bout, workout: Workout | undefined) {
    if (!workout) return
    setSharingBoutId(bout.id)
    setShareError('')
    try {
      await shareTargetImage(bout, workout)
    } catch (e) {
      // The user closing the share sheet without picking anything throws an
      // AbortError — that is a cancel, not a failure worth reporting.
      if (e instanceof DOMException && e.name === 'AbortError') return
      setShareError(errorMessage(e, 'Could not create a shareable image.'))
    } finally {
      setSharingBoutId(null)
    }
  }

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
    const paths = bouts.map((b) => b.imagePath).filter((p): p is string => p !== null)
    void boutThumbUrls(paths).then((urlByPath) => {
      if (cancelled) return
      const byBoutId: Record<string, string> = {}
      for (const b of bouts) {
        if (b.imagePath && urlByPath[b.imagePath]) byBoutId[b.id] = urlByPath[b.imagePath]
      }
      setThumbs(byBoutId)
    })
    return () => {
      cancelled = true
    }
  }, [bouts])

  const openBout = bouts.find((b) => b.id === openBoutId)

  useEffect(() => {
    if (!openBout?.imagePath) {
      setOpenBoutImage(null)
      return
    }
    let cancelled = false
    void boutImageUrl(openBout.imagePath).then((url) => {
      if (!cancelled) setOpenBoutImage(url)
    })
    return () => {
      cancelled = true
    }
  }, [openBout?.imagePath])

  if (openBout) {
    const boutWorkout = workouts.find((w) => w.id === openBout.workoutId)
    return (
      <>
        <button className="link" onClick={() => setOpenBoutId(null)}>← Back to workout</button>
        <h1 style={{ marginTop: 10 }}>{openBout.position === 'prone' ? 'Prone' : 'Standing'}</h1>
        <p className="lede">{fmt(openBout.shotAt)}</p>
        <ResultsView bout={openBout} settings={settings} workout={boutWorkout} imageUrl={openBoutImage} />
        {shareError && <div className="notice error" style={{ marginTop: 16 }}>{shareError}</div>}
        {!readOnly && (
          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="secondary"
              disabled={sharingBoutId === openBout.id}
              onClick={() => void shareBout(openBout, boutWorkout)}
            >
              <ShareIcon /> Share
            </button>
            <button
              className="secondary danger"
              onClick={async () => {
                if (!confirm('Delete this bout and its photo? This cannot be undone.')) return
                await deleteBout(openBout.id)
                setOpenBoutId(null)
                onChanged()
              }}
            >
              Delete this bout
            </button>
          </div>
        )}
      </>
    )
  }

  const openWorkout = workouts.find((w) => w.id === openWorkoutId)
  if (openWorkout) {
    const ownBouts = bouts.filter((b) => b.workoutId === openWorkout.id)
    const ownMetal = metalBouts.filter((m) => m.workoutId === openWorkout.id)
    const entries = [...ownBouts, ...ownMetal].sort((a, b) => a.shotAt.localeCompare(b.shotAt))

    if (openWorkout.workoutType === 'dryfire') {
      return (
        <>
          <button className="link" onClick={() => setOpenWorkoutId(null)}>← All workouts</button>
          <h1 style={{ marginTop: 10 }}>
            {openWorkout.name || 'Dry-fire session'}
            <span className="pill">Dry-fire</span>
          </h1>
          <p className="lede">{fmt(openWorkout.startedAt)} · {openWorkout.dryfireMinutes} min</p>

          {openWorkout.notes && (
            <div className="card">
              <h3>Notes</h3>
              <p className="meta" style={{ marginBottom: 0 }}>{openWorkout.notes}</p>
            </div>
          )}

          <CoachNotesCard workout={openWorkout} onAdd={onAddCoachNote} />

          {!readOnly && (
            <button
              className="secondary danger" style={{ marginTop: 10 }}
              onClick={async () => {
                if (!confirm('Delete this dry-fire session?')) return
                await deleteWorkout(openWorkout.id)
                setOpenWorkoutId(null)
                onChanged()
              }}
            >
              Delete this session
            </button>
          )}
        </>
      )
    }

    return (
      <>
        <button className="link" onClick={() => setOpenWorkoutId(null)}>← All workouts</button>
        <h1 style={{ marginTop: 10 }}>
          {openWorkout.name || 'Workout'}
          {openWorkout.raceType && <span className="pill">{RACE_TYPE_LABEL[openWorkout.raceType]}</span>}
        </h1>
        <p className="lede">
          {fmt(openWorkout.startedAt)} · {WIND_LABEL[openWorkout.wind]}
          {openWorkout.wind !== 'none' && ` from ${openWorkout.windDirection} o'clock`}
          {openWorkout.clickLog.length > 0 && ` · ${clickSummary(openWorkout.clickLog)}`}
        </p>

        {openWorkout.notes && (
          <div className="card">
            <h3>Notes</h3>
            <p className="meta" style={{ marginBottom: 0 }}>{openWorkout.notes}</p>
          </div>
        )}

        {openWorkout.clickLog.length > 0 && (
          <div className="card">
            <h3>Zero clicks logged</h3>
            {openWorkout.clickLog.map((c) => (
              <p key={c.id} className="meta" style={{ marginBottom: 4 }}>
                {c.vertical > 0 && `${c.vertical} click${c.vertical === 1 ? '' : 's'} ${c.verticalDir}`}
                {c.vertical > 0 && c.horizontal > 0 && ', '}
                {c.horizontal > 0 && `${c.horizontal} click${c.horizontal === 1 ? '' : 's'} ${c.horizontalDir}`}
                {c.vertical === 0 && c.horizontal === 0 && 'No movement'}
                {c.clips > 0 && ` · ${c.clips} clip${c.clips === 1 ? '' : 's'} to confirm`}
                {c.note && ` — ${c.note}`}
              </p>
            ))}
          </div>
        )}

        <CoachNotesCard workout={openWorkout} onAdd={onAddCoachNote} />

        <h2>Entries</h2>
        {shareError && <div className="notice error" style={{ marginBottom: 8 }}>{shareError}</div>}
        {entries.length === 0 && <p className="meta">Nothing was added to this workout.</p>}
        {entries.map((e) =>
          e.kind === 'precision' ? (
            <div key={e.id} className="boutrow" style={{ cursor: 'default' }}>
              <button
                onClick={() => setOpenBoutId(e.id)}
                style={{
                  display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0,
                  background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit',
                  textAlign: 'left', cursor: 'pointer',
                }}
              >
                {thumbs[e.id] ? <img src={thumbs[e.id]} alt="" /> : <div style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--grid)', flex: 'none' }} />}
                <div className="grow">
                  <div className="title">{e.metrics.ringTotal}/{e.metrics.ringPossible} <span className="pill">{e.position}</span></div>
                  <div className="meta">{fmt(e.shotAt)} · {e.metrics.meanRadius.toFixed(0)} mm mean radius</div>
                </div>
                <span className="meta" aria-hidden="true">›</span>
              </button>
              {!readOnly && (
                <button
                  className="link"
                  aria-label="Share this target"
                  disabled={sharingBoutId === e.id}
                  onClick={() => void shareBout(e, openWorkout)}
                  style={{ flex: 'none' }}
                >
                  <ShareIcon />
                </button>
              )}
            </div>
          ) : (
            <div key={e.id} className="boutrow" style={{ cursor: 'default' }}>
              <div className="grow">
                <div className="title">{hitCount(hitsOf(e))}/{DISCS_PER_METAL_BOUT} hits <span className="pill">{e.position}</span></div>
                <div className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MiniTargets hits={hitsOf(e)} />
                  {fmt(e.shotAt)} · metal{e.heartRate > 0 && ` · ${e.heartRate} bpm on entry`}
                </div>
              </div>
              {!readOnly && (
                <button
                  className="link danger"
                  aria-label="Remove"
                  onClick={async () => {
                    if (!confirm('Delete this metal bout?')) return
                    await deleteMetalBout(e.id)
                    onChanged()
                  }}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ),
        )}

        {!readOnly && (
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
        )}
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
  const mixedFaces = new Set(bouts.map((b) => b.targetFaceId)).size > 1

  return (
    <>
      <h1>History</h1>
      <p className="lede">
        {workouts.length} workout{workouts.length === 1 ? '' : 's'}, {bouts.length} precision bout{bouts.length === 1 ? '' : 's'}
        {' '}({total} shot{total === 1 ? '' : 's'}), {metalBouts.length} metal bout{metalBouts.length === 1 ? '' : 's'}
        {' '}({metalShots} shot{metalShots === 1 ? '' : 's'}). The breakdown and trends are in Analysis.
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '24px 0 8px' }}>
        <h2 style={{ margin: 0 }}>Workouts</h2>
        {!readOnly && (
          <button className="link" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {selecting ? 'Cancel' : 'Select'}
          </button>
        )}
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
                {w.name || fmt(w.startedAt)}
                {w.workoutType === 'dryfire' && <span className="pill">Dry-fire</span>}
                {w.raceType && <span className="pill">{RACE_TYPE_LABEL[w.raceType]}</span>}
                {w.wind !== 'none' && <span className="pill">{w.wind} wind</span>}
              </div>
              <div className="meta">
                {w.name && `${fmt(w.startedAt)} · `}
                {w.workoutType === 'dryfire'
                  ? `${w.dryfireMinutes} min`
                  : <>{ownBouts.length} precision · {ownMetal.length} metal</>}
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
