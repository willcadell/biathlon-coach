import { useState } from 'react'
import type { Bout, ClickAdjustment, MetalBout, Position, Settings, Wind, WindDirection, Workout, WorkoutEntry } from '../lib/types'
import { DISCS_PER_METAL_BOUT } from '../lib/metal'
import { putMetalBout } from '../lib/db'
import { uuid } from '../lib/id'
import { CaptureView } from './CaptureView'

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

function ClickLog({ workout, onChange }: { workout: Workout; onChange: (w: Workout) => void }) {
  const [vertical, setVertical] = useState(0)
  const [verticalDir, setVerticalDir] = useState<'up' | 'down'>('up')
  const [horizontal, setHorizontal] = useState(0)
  const [horizontalDir, setHorizontalDir] = useState<'left' | 'right'>('left')
  const [note, setNote] = useState('')

  function add() {
    const entry: ClickAdjustment = {
      id: uuid(),
      loggedAt: new Date().toISOString(),
      vertical, verticalDir, horizontal, horizontalDir, note,
    }
    onChange({ ...workout, clickLog: [...workout.clickLog, entry] })
    setVertical(0)
    setHorizontal(0)
    setNote('')
  }

  const remove = (id: string) => onChange({ ...workout, clickLog: workout.clickLog.filter((c) => c.id !== id) })

  return (
    <div className="card">
      {workout.clickLog.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {workout.clickLog.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 14 }}>
                {c.vertical > 0 && `${c.vertical} click${c.vertical === 1 ? '' : 's'} ${c.verticalDir}`}
                {c.vertical > 0 && c.horizontal > 0 && ', '}
                {c.horizontal > 0 && `${c.horizontal} click${c.horizontal === 1 ? '' : 's'} ${c.horizontalDir}`}
                {c.vertical === 0 && c.horizontal === 0 && 'No movement'}
                {c.note && <span className="meta"> — {c.note}</span>}
              </span>
              <button className="link" onClick={() => remove(c.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <label className="field">
          <span>Vertical clicks</span>
          <input
            type="number" inputMode="numeric" min={0} value={vertical || ''}
            onChange={(e) => setVertical(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="field">
          <span>&nbsp;</span>
          <div className="seg">
            {(['up', 'down'] as const).map((d) => (
              <button key={d} aria-pressed={verticalDir === d} onClick={() => setVerticalDir(d)}>{d}</button>
            ))}
          </div>
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Horizontal clicks</span>
          <input
            type="number" inputMode="numeric" min={0} value={horizontal || ''}
            onChange={(e) => setHorizontal(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="field">
          <span>&nbsp;</span>
          <div className="seg">
            {(['left', 'right'] as const).map((d) => (
              <button key={d} aria-pressed={horizontalDir === d} onClick={() => setHorizontalDir(d)}>{d}</button>
            ))}
          </div>
        </label>
      </div>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Note<small>What prompted it, if it matters later.</small></span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        className="secondary" style={{ marginTop: 12 }}
        onClick={add} disabled={vertical === 0 && horizontal === 0}
      >
        Log this adjustment
      </button>
    </div>
  )
}

function MetalForm({ workoutId, onSaved, onCancel }: { workoutId: string; onSaved: () => void; onCancel: () => void }) {
  const [position, setPosition] = useState<Position>('prone')
  const [misses, setMisses] = useState(0)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const bout: MetalBout = {
      kind: 'metal', id: uuid(), workoutId,
      shotAt: new Date().toISOString(), position, misses,
    }
    await putMetalBout(bout)
    onSaved()
  }

  return (
    <>
      <h1>Metal bout</h1>
      <p className="lede">Five discs, prone or standing. Record how many stayed up.</p>
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
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Misses<small>Out of {DISCS_PER_METAL_BOUT} discs.</small></span>
          <div className="seg">
            {Array.from({ length: DISCS_PER_METAL_BOUT + 1 }, (_, n) => (
              <button key={n} aria-pressed={misses === n} onClick={() => setMisses(n)}>{n}</button>
            ))}
          </div>
        </label>
      </div>
      <div className="row">
        <button className="secondary" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={saving} onClick={() => void save()}>Save</button>
      </div>
    </>
  )
}

function PrecisionRow({ bout }: { bout: Bout }) {
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
    </div>
  )
}

function MetalRow({ bout }: { bout: MetalBout }) {
  return (
    <div className="boutrow" style={{ cursor: 'default' }}>
      <div className="grow">
        <div className="title">
          {DISCS_PER_METAL_BOUT - bout.misses}/{DISCS_PER_METAL_BOUT} hits <span className="pill">{bout.position}</span>
        </div>
        <div className="meta">metal</div>
      </div>
    </div>
  )
}

type Mode = 'entries' | 'addPrecision' | 'addMetal'

interface Props {
  settings: Settings
  workout: Workout | null
  /** This workout's own entries, oldest first. */
  entries: WorkoutEntry[]
  onStart: (wind: Wind, windDirection: WindDirection) => void
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
  const [startWind, setStartWind] = useState<Wind>('none')
  const [startWindDirection, setStartWindDirection] = useState<WindDirection>('12')

  if (!workout) {
    return (
      <>
        <h1>Start a workout</h1>
        <p className="lede">
          Add as many precision bouts and metal bouts as you shoot in one session. Wind is entered
          once here, not per bout.
        </p>
        <div className="card">
          <WindFields wind={startWind} windDirection={startWindDirection} onWind={setStartWind} onWindDirection={setStartWindDirection} />
        </div>
        <button className="primary" onClick={() => onStart(startWind, startWindDirection)}>Start workout</button>
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
        onSaved={() => { onDataChanged(); setMode('entries') }}
        onCancel={() => setMode('entries')}
      />
    )
  }

  return (
    <>
      <h1>Workout</h1>
      <p className="lede">Started {fmt(workout.startedAt)}.</p>

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

      <h2>This workout</h2>
      {entries.length === 0 && <p className="meta">Nothing added yet.</p>}
      {entries.map((e) => (e.kind === 'precision' ? <PrecisionRow key={e.id} bout={e} /> : <MetalRow key={e.id} bout={e} />))}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="secondary" onClick={() => setMode('addMetal')}>+ Metal bout</button>
        <button className="primary" onClick={() => setMode('addPrecision')}>+ Precision bout</button>
      </div>

      <button className="secondary" style={{ marginTop: 10 }} onClick={onFinish}>Finish workout</button>
    </>
  )
}
