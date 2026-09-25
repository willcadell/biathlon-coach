import { useEffect, useMemo, useState } from 'react'
import type { Bout, ClickAdjustment, MetalBout, MetalTarget, Position, RaceType, Settings, Wind, WindDirection, Workout, WorkoutEntry } from '../lib/types'
import { RACE_STAGES, RACE_TYPE_LABEL } from '../lib/types'
import { DISCS_PER_METAL_BOUT, METAL_TARGETS, allMissed, hitCount, hitsOf, missCount } from '../lib/metal'
import { deleteBout, deleteMetalBout, putMetalBout } from '../lib/db'
import { analyse } from '../lib/diagnostics'
import { errorMessage } from '../lib/errors'
import { uuid } from '../lib/id'
import { CaptureView } from './CaptureView'
import { FeedView } from './FeedView'
import { ShareSheet } from './ShareSheet'
import { useMemberships } from '../lib/feed'
import { MiniTargets } from './MiniTargets'
import { GoArrow, ShareIcon, TrashIcon } from './icons'

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

/** The format is picked here once and then shown as a logged line with an
 *  Edit link, rather than leaving the whole picker on screen for the rest of
 *  the race. Chosen at the "Race" start button is only a default — nothing
 *  counts as chosen until it's tapped, so a fresh race opens the picker. */
function RaceTypeFields({
  raceType, open, onPick, onEdit,
}: { raceType: RaceType; open: boolean; onPick: (r: RaceType) => void; onEdit: () => void }) {
  if (!open) {
    return (
      <div className="row" style={{ alignItems: 'center' }}>
        <span style={{ flex: 1, fontSize: 14 }}>
          <span className="meta">Format · </span><strong>{RACE_TYPE_LABEL[raceType]}</strong>
        </span>
        <button className="link" style={{ flex: 'none' }} onClick={onEdit}>Edit</button>
      </div>
    )
  }
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <span>Format</span>
      <div className="seg" style={{ flexWrap: 'wrap' }}>
        {(Object.keys(RACE_TYPE_LABEL) as RaceType[]).map((r) => (
          <button key={r} aria-pressed={raceType === r} onClick={() => onPick(r)} style={{ minWidth: '45%' }}>
            {RACE_TYPE_LABEL[r]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The race's shooting stages, in the format's fixed order — replaces the
 *  free-form "+ metal bout" flow for a race workout, since a race's stages
 *  aren't something you add arbitrarily, they're fixed by what you picked. */
function RaceStages({
  raceType, metalBouts, onAddStage, onEditStage,
}: {
  raceType: RaceType
  metalBouts: MetalBout[]
  onAddStage: (position: Position, stageIndex: number) => void
  onEditStage: (bout: MetalBout) => void
}) {
  const sorted = [...metalBouts].sort((a, b) => a.shotAt.localeCompare(b.shotAt))
  const stages = RACE_STAGES[raceType]

  return (
    <>
      <h2>Stages</h2>
      {stages.map((position, i) => {
        const bout = sorted[i]
        const label = `Stage ${i + 1} — ${position === 'prone' ? 'Prone' : 'Standing'}`
        if (!bout) {
          return (
            <button key={i} className="boutrow" onClick={() => onAddStage(position, i)}>
              <div className="grow">
                <div className="title">{label}<GoArrow /></div>
                <div className="meta">Not shot yet</div>
              </div>
            </button>
          )
        }
        const hits = hitsOf(bout)
        return (
          <button key={i} className="boutrow" onClick={() => onEditStage(bout)}>
            <div className="grow">
              <div className="title">{label} · {hitCount(hits)}/{DISCS_PER_METAL_BOUT} hits<GoArrow /></div>
              <div className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MiniTargets hits={hits} />
                {bout.heartRate > 0 && `${bout.heartRate} bpm on entry`}
              </div>
            </div>
          </button>
        )
      })}
    </>
  )
}

/** A counter driven purely by two tap targets: no typing numbers. The active
 *  arrow (the direction the running total currently points) is highlighted. */
function Tally({
  label, sub, value, decLabel, decIcon, decActive, incLabel, incIcon, incActive, onDec, onInc,
}: {
  label: string; sub?: string; value: number
  decLabel: string; decIcon: string; decActive?: boolean
  incLabel: string; incIcon: string; incActive?: boolean
  onDec: () => void; onInc: () => void
}) {
  return (
    <div style={{ flex: 'none' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
        {label}{sub && <small style={{ display: 'block', fontWeight: 400, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</small>}
      </div>
      <div className="seg" style={{ alignItems: 'center', gap: 4 }}>
        <span aria-live="polite" style={{ minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{value}</span>
        <button type="button" aria-label={decLabel} title={decLabel} aria-pressed={decActive || undefined} onClick={onDec} style={{ width: 40, flex: 'none' }}>{decIcon}</button>
        <button type="button" aria-label={incLabel} title={incLabel} aria-pressed={incActive || undefined} onClick={onInc} style={{ width: 40, flex: 'none' }}>{incIcon}</button>
      </div>
    </div>
  )
}

function ClickLog({ workout, onChange }: { workout: Workout; onChange: (w: Workout) => void }) {
  // Once at least one adjustment exists, the entry form collapses behind a
  // button — filling it back in for every future correction is more
  // clutter than the log itself is worth once it is no longer empty.
  const [open, setOpen] = useState(workout.clickLog.length === 0)
  // Signed running totals: up / right count positive, down / left negative,
  // so tapping the opposite arrow takes a click back off rather than logging
  // both directions at once.
  const [vNet, setVNet] = useState(0)
  const [hNet, setHNet] = useState(0)
  const [clips, setClips] = useState(0)
  const vertical = Math.abs(vNet)
  const verticalDir: 'up' | 'down' = vNet < 0 ? 'down' : 'up'
  const horizontal = Math.abs(hNet)
  const horizontalDir: 'left' | 'right' = hNet > 0 ? 'right' : 'left'
  const [note, setNote] = useState('')

  function add() {
    const entry: ClickAdjustment = {
      id: uuid(),
      loggedAt: new Date().toISOString(),
      vertical, verticalDir, horizontal, horizontalDir, clips, note,
    }
    onChange({ ...workout, clickLog: [...workout.clickLog, entry] })
    setVNet(0)
    setHNet(0)
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
              <button className="link danger" aria-label="Remove" style={{ flex: 'none' }} onClick={() => remove(c.id)}><TrashIcon /></button>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button className="secondary" onClick={() => setOpen(true)}>+ Log another adjustment</button>
      ) : (
        <>
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
            <Tally
              label="Vert" value={vertical}
              decLabel="Down" decIcon="↓" decActive={vNet < 0}
              incLabel="Up" incIcon="↑" incActive={vNet > 0}
              onDec={() => setVNet((n) => Math.max(-99, n - 1))}
              onInc={() => setVNet((n) => Math.min(99, n + 1))}
            />
            <Tally
              label="Horiz" value={horizontal}
              decLabel="Left" decIcon="←" decActive={hNet < 0}
              incLabel="Right" incIcon="→" incActive={hNet > 0}
              onDec={() => setHNet((n) => Math.max(-99, n - 1))}
              onInc={() => setHNet((n) => Math.min(99, n + 1))}
            />
            <Tally
              label="Clips" value={clips}
              decLabel="Fewer clips" decIcon="−"
              incLabel="More clips" incIcon="+"
              onDec={() => setClips((n) => Math.max(0, n - 1))}
              onInc={() => setClips((n) => Math.min(9, n + 1))}
            />

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
  workoutId, initial, comboId, presetPosition, stageLabel, onSaved, onCancel,
}: {
  workoutId: string
  /** Present when editing an existing metal bout rather than adding a new one. */
  initial?: MetalBout
  /** The active combo to attach a NEW bout to, if any. Ignored when editing —
   *  an existing bout keeps whatever combo it was already part of. */
  comboId?: string | null
  /** For a race stage, fixed by the format rather than chosen — the position
   *  toggle is hidden in favour of stageLabel. Ignored when editing. */
  presetPosition?: Position
  stageLabel?: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [position, setPosition] = useState<Position>(initial?.position ?? presetPosition ?? 'prone')
  const [hits, setHits] = useState<Record<MetalTarget, boolean>>(initial ? hitsOf(initial) : allMissed())
  const [heartRate, setHeartRate] = useState(initial?.heartRate ?? 0)
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
      position, hits, heartRate,
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
      <h1>{stageLabel ?? (initial ? 'Edit metal bout' : comboId ? 'Combo round' : 'Metal bout')}</h1>
      <p className="lede">Five targets, prone or standing. Tap the ones that fell.</p>
      <div className="card">
        {!initial && presetPosition ? (
          <p className="meta" style={{ marginTop: 0 }}>{presetPosition === 'prone' ? 'Prone' : 'Standing'}, set by the race format.</p>
        ) : (
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
        )}
        <label className="field">
          <span>Targets<small>{hitCount(hits)}/{DISCS_PER_METAL_BOUT} down. Tap a target to mark it hit.</small></span>
          <TargetDial hits={hits} onChange={setHits} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Heart rate on entry<small>Coming off the ski or straight from the start.</small></span>
          <input
            type="number" inputMode="numeric" placeholder="—" min={0} max={230}
            value={heartRate || ''}
            onChange={(e) => setHeartRate(Number(e.target.value) || 0)}
          />
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

/** The best of this session's precision bouts by ring percentage — the one
 *  worth putting on the completion screen and offering to share. Null for a
 *  dry-fire session or a range session with no precision bouts logged. */
function bestBout(bouts: Bout[]): Bout | null {
  if (bouts.length === 0) return null
  return bouts.reduce((best, b) => {
    const pct = b.metrics.ringPossible > 0 ? b.metrics.ringTotal / b.metrics.ringPossible : 0
    const bestPct = best.metrics.ringPossible > 0 ? best.metrics.ringTotal / best.metrics.ringPossible : 0
    return pct > bestPct ? b : best
  })
}

/** Counts up to `target` once, starting `delayMs` after mount — timed to
 *  land just as the checkmark settles. Jumps straight to the final value
 *  for anyone who's asked for less motion. */
function useCountUp(target: number, delayMs: number, durationMs: number): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    function tick(now: number) {
      const t = Math.max(0, now - start - delayMs)
      const p = Math.min(1, t / durationMs)
      setValue(Math.round(p * target))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, delayMs, durationMs])
  return value
}

/** Replaces the workout form once Finish is tapped — a brief acknowledgment
 *  before dropping back to "Start a session", with a one-tap route into
 *  sharing the session's best target right when it's most relevant. */
function SessionComplete({ workout, precisionBouts, onDone }: { workout: Workout; precisionBouts: Bout[]; onDone: () => void }) {
  const [choosing, setChoosing] = useState(false)
  // Which thing the share sheet is open for: one of this session's targets,
  // or the whole workout.
  const [sheet, setSheet] = useState<{ bout?: Bout } | null>(null)
  const memberships = useMemberships()
  const best = bestBout(precisionBouts)
  const shownScore = useCountUp(best?.metrics.ringTotal ?? 0, 450, 600)
  const inOrder = [...precisionBouts].sort((a, b) => a.shotAt.localeCompare(b.shotAt))
  const inClub = memberships !== null && memberships.length > 0

  // One target has nothing to choose between, so it opens straight away;
  // with several, the button opens a list to pick from instead.
  function onShareClick() {
    if (inOrder.length === 1) setSheet({ bout: inOrder[0] })
    else setChoosing((c) => !c)
  }

  return (
    <div className="session-complete">
      <div className="check-circle">
        <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
      </div>
      <h1>Session logged</h1>
      {best && (
        <p className="lede">
          Best bout: <span className="num">{shownScore}</span>/{best.metrics.ringPossible}
        </p>
      )}
      {choosing && (
        <div style={{ width: '100%', maxWidth: 320, marginBottom: 12, textAlign: 'left' }}>
          <p className="meta" style={{ margin: '0 0 8px' }}>Choose a target to share</p>
          {inOrder.map((b, i) => (
            <button key={b.id} className="boutrow" onClick={() => { setSheet({ bout: b }); setChoosing(false) }}>
              <div className="grow">
                <div className="title">
                  {b.metrics.ringTotal}/{b.metrics.ringPossible} <span className="pill">{b.position}</span>
                  {b.id === best?.id && <span className="pill">best</span>}
                </div>
                <div className="meta">Bout {i + 1} · {fmt(b.shotAt)}</div>
              </div>
              <ShareIcon />
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <button className="secondary" onClick={onDone}>Back to start</button>
        {inOrder.length > 0 && (
          <button className="primary" onClick={onShareClick}>
            {inOrder.length === 1 ? 'Share this target' : choosing ? 'Cancel' : 'Share a target…'}
          </button>
        )}
      </div>
      {inClub && (
        <button className="link" style={{ marginTop: 14 }} onClick={() => setSheet({})}>
          Post this workout to the club feed
        </button>
      )}
      {sheet && <ShareSheet bout={sheet.bout} workout={workout} onClose={() => setSheet(null)} />}
    </div>
  )
}

function PrecisionRow({ bout, workout, onDeleted }: { bout: Bout; workout: Workout; onDeleted: () => void }) {
  const [sharing, setSharing] = useState(false)

  return (
    <div className="boutrow" style={{ cursor: 'default' }}>
      <div className="grow">
        <div className="title">
          {bout.metrics.ringTotal}/{bout.metrics.ringPossible} <span className="pill">{bout.position}</span>
        </div>
        <div className="meta">
          {bout.shots.length} shot{bout.shots.length === 1 ? '' : 's'} · {bout.metrics.meanRadius.toFixed(0)} mm mean radius
        </div>
        {sharing && <ShareSheet bout={bout} workout={workout} onClose={() => setSharing(false)} />}
      </div>
      <div style={{ display: 'flex', gap: 12, flex: 'none', alignItems: 'center' }}>
        <button className="link" aria-label="Share this target" onClick={() => setSharing(true)}>
          <ShareIcon />
        </button>
        <button
          className="link danger"
          aria-label="Remove"
          onClick={async () => {
            if (!confirm('Delete this precision bout and its photo? This cannot be undone.')) return
            await deleteBout(bout.id)
            onDeleted()
          }}
        >
          <TrashIcon />
        </button>
      </div>
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
        </div>
        <div className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MiniTargets hits={hits} />
          metal{bout.heartRate > 0 && ` · ${bout.heartRate} bpm on entry`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flex: 'none' }}>
        <button className="link" onClick={onEdit}>Edit</button>
        <button
          className="link danger"
          aria-label="Remove"
          onClick={async () => {
            if (!confirm('Delete this metal bout?')) return
            await deleteMetalBout(bout.id)
            onDeleted()
          }}
        >
          <TrashIcon />
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
  return (
    <div className="card">
      <div className="title" style={{ marginBottom: 8 }}>
        Combo · {rounds.length} round{rounds.length === 1 ? '' : 's'} · {shots - misses}/{shots} hits
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
              className="link danger"
              aria-label="Remove"
              onClick={async () => {
                if (!confirm('Delete this round?')) return
                await deleteMetalBout(r.id)
                onDeleted()
              }}
            >
              <TrashIcon />
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

type StartKind = 'range' | 'dryfire' | 'race'

interface Props {
  settings: Settings
  workout: Workout | null
  /** This workout's own entries, oldest first. */
  entries: WorkoutEntry[]
  onStart: (kind: StartKind) => Promise<void>
  onFinish: () => void
  /** Deletes the workout entirely (and anything already logged in it) and
   *  returns to "Start a session" — distinct from Finish, which just stops
   *  adding to a workout that's kept as-is. */
  onCancel: () => void
  onWorkoutChanged: (workout: Workout) => void
  onDataChanged: () => void
}

/**
 * The Shoot tab: one workout at a time. A range session is built up out of
 * any number of precision bouts and metal bouts, with wind and the clicks
 * actually dialed in logged once at the workout level; a dryfire session is
 * just time spent and how it went, no range required.
 */
export function WorkoutView({ settings, workout, entries, onStart, onFinish, onCancel, onWorkoutChanged, onDataChanged }: Props) {
  const [mode, setMode] = useState<Mode>('entries')
  const [editingMetal, setEditingMetal] = useState<MetalBout | null>(null)
  const [activeComboId, setActiveComboId] = useState<string | null>(null)
  const [pendingStage, setPendingStage] = useState<{ index: number; position: Position } | null>(null)
  const [starting, setStarting] = useState<StartKind | null>(null)
  const [startError, setStartError] = useState('')
  const [complete, setComplete] = useState(false)
  // Which workout's race format has been confirmed (or is being re-edited).
  const [formatConfirmedId, setFormatConfirmedId] = useState<string | null>(null)
  const [editingFormat, setEditingFormat] = useState(false)

  const comboRounds = activeComboId
    ? entries.filter((e) => e.kind === 'metal' && e.comboId === activeComboId).length
    : 0

  const precisionBouts = entries.filter((e): e is Bout => e.kind === 'precision')
  const metalBouts = entries.filter((e): e is MetalBout => e.kind === 'metal')

  async function handleStart(kind: StartKind) {
    setStarting(kind)
    setStartError('')
    try {
      await onStart(kind)
    } catch (e) {
      setStartError(errorMessage(e, 'Could not start the session. Check your connection and try again.'))
    } finally {
      setStarting(null)
    }
  }

  function handleCancel() {
    if (!confirm('Cancel this session? Everything logged in it — bouts, photos, notes — will be deleted. This cannot be undone.')) return
    onCancel()
  }

  // Reset here rather than on Finish, so the next session started doesn't
  // land straight back on this one's completion screen.
  function handleDone() {
    setComplete(false)
    onFinish()
  }

  if (!workout) {
    return (
      <>
        <h1>Start a session</h1>
        <p className="lede">
          A range session holds any number of precision and metal bouts, with wind and clicks
          logged once for the whole session. A dry-fire session just tracks time and notes.
        </p>
        {startError && <div className="notice error">{startError}</div>}
        <div className="row">
          <button className="secondary" onClick={() => void handleStart('range')} disabled={starting !== null}>
            {starting === 'range' ? 'Starting…' : 'Range'}
          </button>
          <button className="secondary" onClick={() => void handleStart('dryfire')} disabled={starting !== null}>
            {starting === 'dryfire' ? 'Starting…' : 'Dryfire'}
          </button>
          <button className="secondary" onClick={() => void handleStart('race')} disabled={starting !== null}>
            {starting === 'race' ? 'Starting…' : 'Race'}
          </button>
        </div>
        <FeedView role="athlete" />
      </>
    )
  }

  if (complete) {
    return <SessionComplete workout={workout} precisionBouts={precisionBouts} onDone={handleDone} />
  }

  if (workout.workoutType === 'dryfire') {
    return (
      <>
        <h1>{workout.name || 'Dry-fire session'}</h1>
        <p className="lede">Started {fmt(workout.startedAt)}.</p>

        <label className="field">
          <span>Name<small>Optional — shown instead of the date in History.</small></span>
          <input
            type="text" placeholder={fmt(workout.startedAt)}
            value={workout.name ?? ''}
            onChange={(e) => onWorkoutChanged({ ...workout, name: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Minutes</span>
          <input
            type="number" inputMode="numeric" min={0}
            value={workout.dryfireMinutes || ''}
            onChange={(e) => onWorkoutChanged({ ...workout, dryfireMinutes: Number(e.target.value) || 0 })}
          />
        </label>

        <h2>Notes</h2>
        <textarea
          value={workout.notes ?? ''}
          placeholder="How it went, what to try next time…"
          onChange={(e) => onWorkoutChanged({ ...workout, notes: e.target.value })}
        />

        <div className="row" style={{ marginTop: 10 }}>
          <button className="secondary danger" style={{ flex: 1 }} onClick={handleCancel}>Cancel session</button>
          <button className="primary" style={{ flex: 2 }} onClick={() => setComplete(true)}>Finish session</button>
        </div>
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
        presetPosition={pendingStage?.position}
        stageLabel={pendingStage ? `Stage ${pendingStage.index + 1} — ${pendingStage.position === 'prone' ? 'Prone' : 'Standing'}` : undefined}
        onSaved={() => { onDataChanged(); setEditingMetal(null); setPendingStage(null); setMode('entries') }}
        onCancel={() => { setEditingMetal(null); setPendingStage(null); setMode('entries') }}
      />
    )
  }

  return (
    <>
      <h1>{workout.name || 'Workout'} {workout.raceType && <span className="pill">{RACE_TYPE_LABEL[workout.raceType]}</span>}</h1>
      <p className="lede">Started {fmt(workout.startedAt)}.</p>

      <label className="field">
        <span>Name<small>Optional — shown instead of the date in History.</small></span>
        <input
          type="text" placeholder={fmt(workout.startedAt)}
          value={workout.name ?? ''}
          onChange={(e) => onWorkoutChanged({ ...workout, name: e.target.value })}
        />
      </label>

      {workout.raceType && (
        <div className="card">
          <RaceTypeFields
            raceType={workout.raceType}
            open={editingFormat || (formatConfirmedId !== workout.id && metalBouts.length === 0)}
            onPick={(r) => {
              onWorkoutChanged({ ...workout, raceType: r })
              setFormatConfirmedId(workout.id)
              setEditingFormat(false)
            }}
            onEdit={() => setEditingFormat(true)}
          />
        </div>
      )}

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

      {workout.raceType ? (
        <RaceStages
          raceType={workout.raceType}
          metalBouts={metalBouts}
          onAddStage={(position, index) => { setPendingStage({ index, position }); setMode('addMetal') }}
          onEditStage={(bout) => { setEditingMetal(bout); setMode('addMetal') }}
        />
      ) : (
        <>
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
              <PrecisionRow key={item.id} bout={item} workout={workout} onDeleted={onDataChanged} />
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
        </>
      )}

      <h2>Notes</h2>
      <textarea
        value={workout.notes ?? ''}
        placeholder="How the whole session went, what to try next time…"
        onChange={(e) => onWorkoutChanged({ ...workout, notes: e.target.value })}
      />

      <div className="row" style={{ marginTop: 10 }}>
        <button className="secondary danger" style={{ flex: 1 }} onClick={handleCancel}>Cancel session</button>
        <button className="primary" style={{ flex: 2 }} onClick={() => setComplete(true)}>Finish session</button>
      </div>
    </>
  )
}
