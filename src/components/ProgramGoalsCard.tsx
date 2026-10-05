import { useEffect, useState } from 'react'
import { localDate } from '../lib/coachContext'
import { errorMessage } from '../lib/errors'
import {
  MIN_PROGRAM_CONTRIBUTORS, PROGRAM_GOAL_METRICS, canArchive, evaluateProgramGoal, goalTitle,
  type Goal, type GoalMetric, type GoalProgress,
} from '../lib/goalProgress'
import { createProgramGoal, deleteGoal, programGoalProgress, programGoalsOf, setGoalArchived } from '../lib/goals'
import { Dropdown } from './Dropdown'
import { GoalRow } from './GoalRow'
import { Help } from './Help'
import { ArchiveIcon, TrashIcon } from './icons'

const endOfThisMonth = () => {
  const now = new Date()
  return localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0, 12).toISOString())
}

/**
 * A program's goals, for the coaches who manage it. They're about process, not
 * outcome: how much the program trains, as a total across its athletes (dry-fire
 * minutes, sessions), never how well it shoots. The athletes in the program see
 * the goals on their home screen, and the total once enough of them have
 * contributed.
 */
export function ProgramGoalsCard({ programId, programName, readOnly = false }: { programId: string; programName: string; readOnly?: boolean }) {
  const [rows, setRows] = useState<{ g: Goal; p: GoalProgress }[] | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState('')

  const [metric, setMetric] = useState<GoalMetric>('dryfire_minutes')
  const [target, setTarget] = useState('')
  const [endsOn, setEndsOn] = useState(endOfThisMonth)
  const [saving, setSaving] = useState(false)

  const load = () => {
    void (async () => {
      const goals = await programGoalsOf(programId)
      return Promise.all(goals.map(async (goal) => {
        const r = await programGoalProgress(goal.id)
        const g = { ...goal, achievedAt: r.achievedAt, achievedValue: r.achievedValue }
        return { g, p: evaluateProgramGoal(g, r.aggregate) }
      }))
    })().then(setRows).catch((e) => setError(errorMessage(e, 'Could not load the program goals. Check your connection and try again.')))
  }
  useEffect(load, [programId])

  const today = localDate(new Date().toISOString())
  const targetNumber = Number(target)
  const problem =
    !target.trim() || !(targetNumber > 0) ? 'Enter a target above zero.'
    : !Number.isInteger(targetNumber) ? 'Use a whole number.'
    : !endsOn || endsOn < today ? 'Pick an end date from today on.'
    : ''

  async function add() {
    if (problem) return
    setSaving(true)
    setError('')
    try {
      await createProgramGoal(programId, { metric, target: targetNumber, endsOn })
      setTarget('')
      load()
    } catch (e) {
      setError(errorMessage(e, 'Could not set that goal. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  async function archive(g: Goal, archived: boolean) {
    setError('')
    try {
      await setGoalArchived(g.id, archived)
      setRows((prev) => prev && prev.map((r) => (r.g.id === g.id ? { ...r, g: { ...r.g, archivedAt: archived ? new Date().toISOString() : null } } : r)))
    } catch (e) {
      setError(errorMessage(e, 'Could not change that goal. Check your connection and try again.'))
    }
  }

  async function remove(g: Goal) {
    if (!confirm(`Delete the goal "${goalTitle(g)}" for ${programName}?\n\nThe program's athletes will no longer see it.`)) return
    setError('')
    try {
      await deleteGoal(g.id)
      setRows((prev) => prev && prev.filter((r) => r.g.id !== g.id))
    } catch (e) {
      setError(errorMessage(e, 'Could not delete that goal. Check your connection and try again.'))
    }
  }

  const live = (rows ?? []).filter((r) => !r.g.archivedAt)
  const archivedCount = (rows ?? []).length - live.length
  const shown = showArchived ? rows ?? [] : live

  return (
    <>
      <h3 style={{ margin: '20px 0 6px' }}>
        Program goals
        <Help>
          Goals for the whole program, about how much it trains rather than how well it shoots: total dry-fire
          minutes or sessions across its athletes. The athletes see them on their home screen. They see the
          total once at least {MIN_PROGRAM_CONTRIBUTORS} athletes have contributed, so one person's effort
          can't be picked out.
        </Help>
      </h3>
      {error && <div className="notice error">{error}</div>}
      {shown.map(({ g, p }) => (
        <GoalRow
          key={g.id} goal={g} progress={p} archived={Boolean(g.archivedAt)}
          action={readOnly ? undefined : (
            <span style={{ flex: 'none', display: 'inline-flex', gap: 4 }}>
              {g.archivedAt ? (
                <button className="link" style={{ flex: 'none' }} onClick={() => void archive(g, false)}>Restore</button>
              ) : canArchive(p) && (
                <button className="link" style={{ flex: 'none' }} aria-label={`Archive the goal ${goalTitle(g)}`} title="Archive this goal" onClick={() => void archive(g, true)}>
                  <ArchiveIcon />
                </button>
              )}
              <button className="link" style={{ flex: 'none' }} aria-label={`Delete the goal ${goalTitle(g)}`} title="Delete this goal" onClick={() => void remove(g)}>
                <TrashIcon />
              </button>
            </span>
          )}
        />
      ))}
      {rows !== null && shown.length === 0 && <p className="meta">No program goals yet.</p>}
      {archivedCount > 0 && (
        <button className="link" style={{ marginBottom: 8 }} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide archived goals' : `Show ${archivedCount} archived goal${archivedCount === 1 ? '' : 's'}`}
        </button>
      )}

      {!readOnly && (
        <Dropdown title="Set a program goal">
          <div className="card">
            <div className="field" style={{ marginBottom: 12 }}>
              <span>Measure</span>
              <div className="seg">
                {PROGRAM_GOAL_METRICS.map((m) => (
                  <button key={m.id} aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>{m.label}</button>
                ))}
              </div>
            </div>
            <label className="field" style={{ marginBottom: 12 }}>
              <span>Target {metric === 'dryfire_minutes' ? '(minutes)' : '(sessions)'}<small>A total across everyone in {programName}.</small></span>
              <input
                type="number" inputMode="numeric" min="1" step="1"
                placeholder={metric === 'dryfire_minutes' ? 'e.g. 600' : 'e.g. 40'}
                value={target} onChange={(e) => setTarget(e.target.value)}
              />
            </label>
            <label className="field" style={{ marginBottom: 12 }}>
              <span>By</span>
              <input type="date" min={today} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </label>
            {target.trim() !== '' && problem && <div className="notice error" style={{ marginBottom: 12 }}>{problem}</div>}
            <button className="primary" disabled={saving || Boolean(problem)} onClick={() => void add()}>
              {saving ? 'Setting…' : 'Set goal'}
            </button>
          </div>
        </Dropdown>
      )}
    </>
  )
}
