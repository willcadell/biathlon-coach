import { useMemo, useState } from 'react'
import type { Bout, ClickAdjustment, MetalBout, MetalTarget, Position, Settings, Wind, WindDirection, Workout, WorkoutEntry } from '../lib/types'
import { DISCS_PER_METAL_BOUT, METAL_TARGETS, allMissed, hitCount, hitsOf, missCount } from '../lib/metal'
import { deleteBout, deleteMetalBout, putMetalBout } from '../lib/db'
import { analyse } from '../lib/diagnostics'
import { errorMessage } from '../lib/errors'
import { uuid } from '../lib/id'
import { CaptureView } from './CaptureView'
import { MiniTargets } from './MiniTargets'

const WIND_CLOCK_LABEL: Record<WindDirection, string> = {
  '12': '12 · headwind',
  '1': '1', '2': '2',
  '3': '3 · from the right',
  '4': '4', '5': '5',
  '6': '6 · tailwind',
  '7': '7', '8': '8',
  '9': '9 · from the left',
  '10': '10', '11': '11',
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function WindFields({
  wind, windDirection, onWind, onWindDirection,
}: {
  wind: Wind
  windDirection: WindDirection
  onWind: (w: Wind) => void
  onWindDirection: (d: WindDirection) => void
}) {
  return (
    <>
      <label className="field" style={{ marginBottom: wind === 'none' ? 0 : 12 }}>
        <span>Wind</span>
        <select value={wind} onChange={(e) => onWind(e.target.value as Wind)}>
          <option value="none">None</option>
          <option value="light">Light</option>
          <option value="moderate">Moderate</option>
          <option value="strong">Strong</option>
        </select>
      </label>
      {wind !== 'none' && (
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Wind direction<small>Clock face, facing the target.</small></span>
          <select value={windDirection} onChange={(e) => onWindDirection(e.target.value as WindDirection)}>
            {(Object.keys(WIND_CLOCK_LABEL) as WindDirection[]).map((d) => (
              <option key={d} value={d}>{WIND_CLOCK_LABEL[d]}</option>
            ))}
          </select>
        </label>
      )}
    </>
  )
}

const clampToDigits = (n: number, max: number) => Math.max(0, Math.min(max, Math.trunc(n) || 0))

function ClickLog({ workout, onChange }: { workout: Workout; onChange: (w: Workout) => void }) {
  // Once at least one adjustment exists, the entry form collapses behind a
  // button — filling it back in for every future correction is more
  // clutter than the log itself is worth once it is no longer empty.
  const [open, setOpen] = useState(workout.clickLog.length === 0)
  const [vertical, setVertical] = useState(0)
  const [verticalDir, setVerticalDir] = useState<'up' | 'down'>('up')
  const [horizontal, setHorizontal] = useState(0)
  const [horizontalDir, setHorizontalDir] = useState<'left' | 'right'>('left')
  const [clips, setClips] = useState(0)
  const [note, setNote] = useState('')

  function add() {
    const entry: ClickAdjustment = {
      id: uuid(),
      loggedAt: new Date().toISOString(),
      vertical, verticalDir, horizontal, horizontalDir, clips, note,
    }
    onChange({ ...workout, clickLog: [...workout.clickLog, entry] })
    setVertical(0)
    setHorizontal(0)
    setClips(0)
    setNote('')
    setOpen(false)
  }

  const remove = (id: string) => onChange({ ...workout, clickLog: workout.clickLog.filter((c) => c.id !== id) })

  return (
    <div className="card">
      {workout.clickLog.length > 0 && (
        <div style={{ marginBottom: open ? 14 : 0 }}>
          {workout.clickLog.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 14 }}>
                {c.vertical > 0 && `${c.vertical} click${c.vertical === 1 ? '' : 's'} ${c.verticalDir}`}
                {c.vertical > 0 && c.horizontal > 0 && ', '}
                {c.horizontal > 0 && `${c.horizontal} click${c.horizontal === 1 ? '' : 's'} ${c.horizontalDir}`}
                {c.vertical === 0 && c.horizontal === 0 && 'No movement'}
                {c.clips > 0 && ` · ${c.clips} clip${c.clips === 1 ? '' : 's'} to confirm`}
                {c.note && <span className="meta"> — {c.note}</span>}
              </span>
              <button className="link" onClick={() => remove(c.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button className="secondary" onClick={() => setOpen(true)}>+ Log another adjustment</button>
      ) : (
        <>
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
            <label className="field" style={{ flex: 'none', width: 52, marginBottom: 0 }}>
              <span>Vert</span>
              <input
                type="number" inputMode="numeric" min={0} max={99} value={vertical || ''}
                onChange={(e) => setVertical(clampToDigits(Number(e.target.value), 99))}
              />
            </label>
            <div className="seg" style={{ flex: 'none' }}>
              <button
                type="button" aria-pressed={verticalDir === 'up'} aria-label="Up" title="Up"
                onClick={() => setVerticalDir('up')} style={{ width: 40 }}
              >↑</button>
              <button
                type="button" aria-pressed={verticalDir === 'down'} aria-label="Down" title="Down"
                onClick={() => setVerticalDir('down')} style={{ width: 40 }}
              >↓</button>
            </div>

            <label className="field" style={{ flex: 'none', width: 52, marginBottom: 0 }}>
              <span>Horiz</span>
              <input
                type="number" inputMode="numeric" min={0} max={99} value={horizontal || ''}
                onChange={(e) => setHorizontal(clampToDigits(Number(e.target.value), 99))}
              />
            </label>
            <div className="seg" style={{ flex: 'none' }}>
              <button
                type="button" aria-pressed={horizontalDir === 'left'} aria-label="Left" title="Left"
                onClick={() => setHorizontalDir('left')} style={{ width: 40 }}
              >←</button>
              <button
                type="button" aria-pressed={horizontalDir === 'right'} aria-label="Right" title="Right"
                onClick={() => setHorizontalDir('right')} style={{ width: 40 }}
              >→</button>
            </div>

            <label className="field" style={{ flex: 'none', width: 52, marginBottom: 0 }}>
              <span>Clips<small>To confirm</small></span>
              <input
                type="number" inputMode="numeric" min={0} max={9} value={clips || ''}
                onChange={(e) => setClips(clampToDigits(Number(e.target.value), 9))}
              />
            </label>

            <label className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <span>Note</span>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {workout.clickLog.length > 0 && (
              <button className="secondary" onClick={() => setOpen(false)}>Cancel</button>
            )}
            {/* No disabled condition: 0 and 0 is a real result — "checked
                the zero, nothing needed" is worth logging too. */}
            <button className="secondary" onClick={add}>Log this adjustment</button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Five targets, left to right, exactly as they sit downrange. Each starts
 * black — a target that hasn't fallen — and a tap turns it white, the same
 * way it looks the moment a hit actually lands. Recording it this way,
 * rather than just a count, is what lets a pattern in WHICH target keeps
 * getting missed show up later.
 */
function TargetDial({ hits, onChange }: { hits: Record<MetalTarget, boolean>; onChange: (hits: Record<MetalTarget, boolean>) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
      {METAL_TARGETS.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={hits[t]}
          onClick={() => onChange({ ...hits, [t]: !hits[t] })}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            background: 'none', border: 0, cursor: 'pointer', padding: '4px 0',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: hits[t] ? 'var(--raised)' : 'var(--series-1)',
              border: '2.5px solid var(--series-1)',
              boxSizing: 'border-box',
            }}
          />
          <span className="meta" style={{ textTransform: 'capitalize' }}>{t}</span>
        </button>
      ))}
    </div>
  )
}

function MetalForm({
  workoutId, initial, comboId, defaultIsRace, onSaved, onCancel,
}: {
  workoutId: string
  /** Present when editing an existing metal bout rather than adding a new one. */
  initial?: MetalBout
  /** The active combo to attach a NEW bout to, if any. Ignored when editing —
   *  an existing bout keeps whatever combo it was already part of. */
  comboId?: string | null
  /** Whether the other rounds already in this combo are flagged as a race —
   *  a new round defaults to matching them, so one set doesn't end up mixed. */
  defaultIsRace?: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const [position, setPosition] = useState<Position>(initial?.position ?? 'prone')
  const [hits, setHits] = useState<Record<MetalTarget, boolean>>(initial ? hitsOf(initial) : allMissed())
  const [heartRate, setHeartRate] = useState(initial?.heartRate ?? 0)
  const [isRace, setIsRace] = useState(initial?.isRace ?? defaultIsRace ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    const bout: MetalBout = {
      kind: 'metal',
      id: initial?.id ?? uuid(),
      workoutId,
      shotAt: initial?.shotAt ?? new Date().toISOString(),
      position, hits, heartRate, isRace,
      comboId: initial ? initial.comboId : (comboId ?? null),
    }
    try {
      await putMetalBout(bout)
      onSaved()
    } catch (e) {
      setError(errorMessage(e, 'Could not save this bout. Check your connection and try again.'))
      setSaving(false)
    }
  }

  return (
    <>
      <h1>{initial ? 'Edit metal bout' : comboId ? 'Combo round' : 'Metal bout'}</h1>
      <p className="lede">Five targets, prone or standing. Tap the ones that fell.</p>
      <div className="card">
        <label className="field">
          <span>Position</span>
          <div className="seg">
            {(['prone', 'standing'] as Position[]).map((p) => (
              <button key={p} aria-pressed={position === p} onClick={() => setPosition(p)}>
                {p === 'prone' ? 'Prone' : 'Standing'}
              </button>
            ))}
          </div>
        </label>
        <label className="field">
          <span>Targets<small>{hitCount(hits)}/{DISCS_PER_METAL_BOUT} down. Tap a target to mark it hit.</small></span>
          <TargetDial hits={hits} onChange={setHits} />
        </label>
        <label className="field">
          <span>Heart rate on entry<small>Coming off the ski or straight from the start.</small></span>
          <input
            type="number" inputMode="numeric" placeholder="—" min={0} max={230}
            value={heartRate || ''}
            onChange={(e) => setHeartRate(Number(e.target.value) || 0)}
          />
        </label>
        <label className="check" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={isRace} onChange={(e) => setIsRace(e.target.checked)} />
          This was a race, not training
        </label>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="row">
        <button className="secondary" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  )
}

function PrecisionRow({ bout, onDeleted }: { bout: Bout; onDeleted: () => void }) {
  return (
    <div className="boutrow" style={{ cursor: 'default' }}>
      <div className="grow">
        <div className="title">
          {bout.metrics.ringTotal}/{bout.metrics.ringPossible} <span className="pill">{bout.position}</span>
        </div>
        <div className="meta">
          {bout.shots.length} shot{bout.shots.length === 1 ? '' : 's'} · {bout.metrics.meanRadius.toFixed(0)} mm mean radius
        </div>
      </div>
      <button
        className="link"
        style={{ flex: 'none' }}
        onClick={async () => {
          if (!confirm('Delete this precision bout and its photo? This cannot be undone.')) return
          await deleteBout(bout.id)
          onDeleted()
        }}
      >
        Remove
      </button>
    </div>
  )
}

function MetalRow({ bout, onEdit, onDeleted }: { bout: MetalBout; onEdit: () => void; onDeleted: () => void }) {
  const hits = hitsOf(bout)
  return (
    <div className="boutrow" style={{ cursor: 'default' }}>
      <div className="grow">
        <div className="title">
          {hitCount(hits)}/{DISCS_PER_METAL_BOUT} hits <span className="pill">{bout.position}</span>
          {bout.isRace && <span className="pill">Race</span>}
        </div>
        <div className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MiniTargets hits={hits} />
          metal{bout.heartRate > 0 && ` · ${bout.heartRate} bpm on entry`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flex: 'none' }}>
        <button className="link" onClick={onEdit}>Edit</button>
        <button
          className="link"
          onClick={async () => {
            if (!confirm('Delete this metal bout?')) return
            await deleteMetalBout(bout.id)
            onDeleted()
          }}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function ComboRow({
  rounds, onEditRound, onDeleted,
}: {
  rounds: MetalBout[]
  onEditRound: (bout: MetalBout) => void
  onDeleted: () => void
}) {
  const shots = rounds.length * DISCS_PER_METAL_BOUT
  const misses = rounds.reduce((n, b) => n + missCount(hitsOf(b)), 0)
  const isRace = rounds.some((r) => r.isRace)
  return (
    <div className="card">
      <div className="title" style={{ marginBottom: 8 }}>
        Combo · {rounds.length} round{rounds.length === 1 ? '' : 's'} · {shots - misses}/{shots} hits
        {isRace && <span className="pill">Race</span>}
      </div>
      {rounds.map((r, i) => (
        <div key={r.id} className="row" style={{ alignItems: 'center', marginBottom: 4 }}>
          <span className="meta" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MiniTargets hits={hitsOf(r)} />
            Round {i + 1} · {r.position} · {hitCount(hitsOf(r))}/{DISCS_PER_METAL_BOUT}
            {r.heartRate > 0 && ` · ${r.heartRate} bpm`}
          </span>
          <div style={{ display: 'flex', gap: 12, flex: 'none' }}>
            <button className="link" onClick={() => onEditRound(r)}>Edit</button>
            <button
              className="link"
              onClick={async () => {
                if (!confirm('Delete this round?')) return
                await deleteMetalBout(r.id)
                onDeleted()
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** A precision bout, a standalone metal bout, or every metal bout sharing one
 *  combo — grouped so a ski-shoot interval session reads as one set of
 *  rounds instead of loose entries, while everything else stays chronological. */
type EntryGroup = Bout | MetalBout | { comboId: string; rounds: MetalBout[] }

function groupEntries(entries: WorkoutEntry[]): EntryGroup[] {
  const seen = new Set<string>()
  const out: EntryGroup[] = []
  for (const e of entries) {
    if (e.kind === 'metal' && e.comboId) {
      if (seen.has(e.comboId)) continue
      seen.add(e.comboId)
      out.push({ comboId: e.comboId, rounds: entries.filter((x): x is MetalBout => x.kind === 'metal' && x.comboId === e.comboId) })
    } else {
      out.push(e)
    }
  }
  return out
}

/**
 * The precision-bout suggestions collected across one workout, in one place,
 * rather than repeated after every single bout — a few bouts in, a pattern
 * across the session is worth more than any one group's read.
 */
function WorkoutAnalysis({ bouts, workout, settings }: { bouts: Bout[]; workout: Workout; settings: Settings }) {
  const findings = useMemo(() => analyse(bouts, settings, [workout]), [bouts, settings, workout])
  if (bouts.length === 0) return null

  return (
    <>
      <h2>Workout analysis</h2>
      <p className="meta" style={{ marginTop: -6 }}>
        From the {bouts.length} precision bout{bouts.length === 1 ? '' : 's'} logged this session — a
        running read, not a verdict. It sharpens as you log more.
      </p>
      {findings.length === 0 ? (
        <p className="meta">Nothing stands out yet.</p>
      ) : (
        findings.map((f, i) => (
          <div key={`${f.id}-${i}`} className={`finding ${f.severity}`}>
            <h3>{f.title}</h3>
            <p style={{ marginBottom: 0 }}>{f.cause}</p>
          </div>
        ))
      )}
    </>
  )
}

type Mode = 'entries' | 'addPrecision' | 'addMetal'

interface Props {
  settings: Settings
  workout: Workout | null
  /** This workout's own entries, oldest first. */
  entries: WorkoutEntry[]
  onStart: (wind: Wind, windDirection: WindDirection) => Promise<void>
  onFinish: () => void
  onWorkoutChanged: (workout: Workout) => void
  onDataChanged: () => void
}

/**
 * The Shoot tab: one workout at a time, built up out of any number of
 * precision bouts and metal bouts. Wind and the clicks actually dialed in are
 * logged once here, at the workout level, rather than retyped for every bout.
 */
export function WorkoutView({ settings, workout, entries, onStart, onFinish, onWorkoutChanged, onDataChanged }: Props) {
  const [mode, setMode] = useState<Mode>('entries')
  const [editingMetal, setEditingMetal] = useState<MetalBout | null>(null)
  const [activeComboId, setActiveComboId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  const activeComboRounds = activeComboId
    ? entries.filter((e): e is MetalBout => e.kind === 'metal' && e.comboId === activeComboId)
    : []
  const comboRounds = activeComboRounds.length
  const activeComboIsRace = activeComboRounds[0]?.isRace ?? false

  const precisionBouts = entries.filter((e): e is Bout => e.kind === 'precision')

  async function handleStart() {
    setStarting(true)
    setStartError('')
    try {
      await onStart('none', '12')
    } catch (e) {
      setStartError(errorMessage(e, 'Could not start the workout. Check your connection and try again.'))
    } finally {
      setStarting(false)
    }
  }

  if (!workout) {
    return (
      <>
        <h1>Start a workout</h1>
        <p className="lede">
          Add as many precision bouts and metal bouts as you shoot in one session. Wind and
          conditions are entered in the workout itself, once it's started.
        </p>
        {startError && <div className="notice error">{startError}</div>}
        <button className="primary" onClick={() => void handleStart()} disabled={starting}>
          {starting ? 'Starting…' : 'Start workout'}
        </button>
      </>
    )
  }

  if (mode === 'addPrecision') {
    return (
      <CaptureView
        settings={settings}
        workout={workout}
        onSaved={onDataChanged}
        onExit={() => setMode('entries')}
      />
    )
  }

  if (mode === 'addMetal') {
    return (
      <MetalForm
        workoutId={workout.id}
        initial={editingMetal ?? undefined}
        comboId={activeComboId}
        defaultIsRace={activeComboIsRace}
        onSaved={() => { onDataChanged(); setEditingMetal(null); setMode('entries') }}
        onCancel={() => { setEditingMetal(null); setMode('entries') }}
      />
    )
  }

  return (
    <>
      <h1>{workout.name || 'Workout'}</h1>
      <p className="lede">Started {fmt(workout.startedAt)}.</p>

      <label className="field">
        <span>Name<small>Optional — shown instead of the date in History.</small></span>
        <input
          type="text" placeholder={fmt(workout.startedAt)}
          value={workout.name ?? ''}
          onChange={(e) => onWorkoutChanged({ ...workout, name: e.target.value })}
        />
      </label>

      <h2>Conditions</h2>
      <div className="card">
        <WindFields
          wind={workout.wind} windDirection={workout.windDirection}
          onWind={(w) => onWorkoutChanged({ ...workout, wind: w })}
          onWindDirection={(d) => onWorkoutChanged({ ...workout, windDirection: d })}
        />
      </div>

      <h2>Zero clicks logged</h2>
      <ClickLog workout={workout} onChange={onWorkoutChanged} />

      <WorkoutAnalysis bouts={precisionBouts} workout={workout} settings={settings} />

      <h2>This workout</h2>
      {entries.length === 0 && <p className="meta">Nothing added yet.</p>}
      {groupEntries(entries).map((item) =>
        'rounds' in item ? (
          <ComboRow
            key={item.comboId}
            rounds={item.rounds}
            onEditRound={(r) => { setEditingMetal(r); setMode('addMetal') }}
            onDeleted={onDataChanged}
          />
        ) : item.kind === 'precision' ? (
          <PrecisionRow key={item.id} bout={item} onDeleted={onDataChanged} />
        ) : (
          <MetalRow
            key={item.id}
            bout={item}
            onEdit={() => { setEditingMetal(item); setMode('addMetal') }}
            onDeleted={onDataChanged}
          />
        ),
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="secondary" onClick={() => { setEditingMetal(null); setMode('addMetal') }}>+ Metal bout</button>
        <button className="primary" onClick={() => setMode('addPrecision')}>+ Precision bout</button>
      </div>

      {activeComboId ? (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="row" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1, fontSize: 14 }}>
              Combo in progress · {comboRounds} round{comboRounds === 1 ? '' : 's'} logged
            </span>
            <button className="link" onClick={() => setActiveComboId(null)}>End combo</button>
          </div>
          <p className="meta" style={{ marginTop: 4, marginBottom: 0 }}>
            Every metal bout you add now joins this combo, until you end it.
          </p>
        </div>
      ) : (
        <button
          className="link" style={{ marginTop: 10 }}
          onClick={() => setActiveComboId(uuid())}
        >
          + Start a combo (repeated ski-and-shoot rounds)
        </button>
      )}

      <h2>Notes</h2>
      <textarea
        value={workout.notes ?? ''}
        placeholder="How the whole session went, what to try next time…"
        onChange={(e) => onWorkoutChanged({ ...workout, notes: e.target.value })}
      />

      <button className="secondary" style={{ marginTop: 10 }} onClick={onFinish}>Finish workout</button>
    </>
  )
}
