import { useEffect, useState } from 'react'
import { localDate } from '../lib/coachContext'
import { errorMessage } from '../lib/errors'
import { GOAL_METRICS, createGoal, deleteGoal, goalAchievedText, goalDeadline, goalTitle, myGoals, setGoalShared } from '../lib/goals'
import type { Goal, GoalMetric } from '../lib/goals'
import type { Position } from '../lib/types'
import { Dropdown } from './Dropdown'
import { Help } from './Help'
import { TrashIcon } from './icons'

/** The last day of this month, as a sensible default end date to start from. */
const endOfThisMonth = () => {
  const now = new Date()
  return localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0, 12).toISOString())
}

const POSITIONS: { id: Position | null; label: string }[] = [
  { id: null, label: 'Both' },
  { id: 'prone', label: 'Prone' },
  { id: 'standing', label: 'Standing' },
]

/**
 * Where an athlete sets and manages their goals. Progress is on their home,
 * next to the training it's measured from — this is just for choosing what to
 * aim at. A goal is private unless they share it, and then only the coaches
 * who already see their training can see it.
 */
export function GoalsCard() {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [error, setError] = useState('')

  const [metric, setMetric] = useState<GoalMetric>('metal_hit_rate')
  const [position, setPosition] = useState<Position | null>(null)
  const [target, setTarget] = useState('')
  const [endsOn, setEndsOn] = useState(endOfThisMonth)
  const [shared, setShared] = useState(false)
  const [saving, setSaving] = useState(false)

  const refresh = () =>
    void myGoals().then(setGoals).catch((e) => setError(errorMessage(e, 'Could not load your goals. Check your connection and try again.')))
  useEffect(refresh, [])

  // Newest first, whatever their end dates.
  const newestFirst = [...(goals ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const isRate = metric !== 'dryfire_minutes'
  const targetNumber = Number(target)
  const today = localDate(new Date().toISOString())
  const problem =
    !target.trim() || !(targetNumber > 0) ? 'Enter a target above zero.'
    : isRate && targetNumber > 100 ? 'A percentage can be at most 100.'
    : !endsOn || endsOn < today ? 'Pick an end date from today on.'
    : ''

  async function add() {
    if (problem) return
    setSaving(true)
    setError('')
    try {
      await createGoal({ metric, position: isRate ? position : null, target: targetNumber, endsOn, shared })
      setTarget('')
      setShared(false)
      refresh()
    } catch (e) {
      setError(errorMessage(e, 'Could not set that goal. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleShared(g: Goal) {
    setError('')
    try {
      await setGoalShared(g.id, !g.shared)
      setGoals((prev) => prev && prev.map((x) => (x.id === g.id ? { ...x, shared: !g.shared } : x)))
    } catch (e) {
      setError(errorMessage(e, 'Could not change that. Check your connection and try again.'))
    }
  }

  async function remove(g: Goal) {
    if (!confirm(`Delete the goal "${goalTitle(g)}"?`)) return
    setError('')
    try {
      await deleteGoal(g.id)
      setGoals((prev) => prev && prev.filter((x) => x.id !== g.id))
    } catch (e) {
      setError(errorMessage(e, 'Could not delete that goal. Check your connection and try again.'))
    }
  }

  return (
    <>
      <h2>
        Goals
        <Help>
          Pick something to aim at and a date to reach it by. Your progress shows on your home screen,
          worked out from the training you log. A goal is private unless you share it with your coaches.
        </Help>
      </h2>
      {error && <div className="notice error">{error}</div>}

      {goals && goals.length > 0 && (
        <Dropdown title="Your goals">
          <div className="card">
            {newestFirst.map((g, i) => (
              <div key={g.id} style={{ paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0, borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>{goalTitle(g)}</span>
                  <span className="meta" style={{ flex: 'none', margin: 0 }}>{goalDeadline(g)}{g.archivedAt ? ' · archived' : ''}</span>
                  <button
                    className="link danger" style={{ flex: 'none' }}
                    aria-label={`Delete the goal ${goalTitle(g)}`} title="Delete this goal"
                    onClick={() => void remove(g)}
                  >
                    <TrashIcon />
                  </button>
                </div>
                {goalAchievedText(g) && (
                  <div className="meta" style={{ margin: '2px 0 0', color: 'var(--good)' }}>{goalAchievedText(g)}</div>
                )}
                <label className="check" style={{ marginTop: 4, marginBottom: 0 }}>
                  <input type="checkbox" checked={g.shared} onChange={() => void toggleShared(g)} />
                  Share with my coaches
                </label>
              </div>
            ))}
          </div>
        </Dropdown>
      )}

      <Dropdown title="Set a goal">
        <div className="card">
          <div className="field" style={{ marginBottom: 12 }}>
            <span>Measure</span>
            <div className="seg" style={{ flexWrap: 'wrap' }}>
              {GOAL_METRICS.map((m) => (
                <button key={m.id} aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>{m.label}</button>
              ))}
            </div>
          </div>

          {isRate && (
            <div className="field" style={{ marginBottom: 12 }}>
              <span>Position</span>
              <div className="seg">
                {POSITIONS.map((p) => (
                  <button key={p.label} aria-pressed={position === p.id} onClick={() => setPosition(p.id)}>{p.label}</button>
                ))}
              </div>
            </div>
          )}

          <label className="field" style={{ marginBottom: 12 }}>
            <span>Target {isRate ? '(%)' : '(minutes)'}</span>
            <input
              type="number" inputMode="decimal" min="1" max={isRate ? 100 : undefined} step="any"
              placeholder={metric === 'metal_hit_rate' ? 'e.g. 80' : metric === 'precision_score' ? 'e.g. 85' : 'e.g. 300'}
              value={target} onChange={(e) => setTarget(e.target.value)}
            />
          </label>

          <label className="field" style={{ marginBottom: 12 }}>
            <span>By</span>
            <input type="date" min={today} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>

          <label className="check" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Share with my coaches
          </label>

          {target.trim() !== '' && problem && <div className="notice error" style={{ marginBottom: 12 }}>{problem}</div>}
          <button className="primary" disabled={saving || Boolean(problem)} onClick={() => void add()}>
            {saving ? 'Setting…' : 'Set goal'}
          </button>
        </div>
      </Dropdown>
    </>
  )
}
