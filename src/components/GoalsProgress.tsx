import { useEffect, useRef, useState } from 'react'
import {
  evaluateGoal, newlyAchieved, showOnHome, type Goal, type GoalData,
} from '../lib/goalProgress'
import { markGoalAchieved, myGoals, sharedGoalsOf } from '../lib/goals'
import { GoalRow } from './GoalRow'

/**
 * The athlete's goals on their home, between Start a session and the feed: how
 * each one is going, from the training logged so far. Goals are set in
 * Profile. Shows nothing at all with no goals to show — no empty card.
 *
 * When a goal is first met this records it, so it stays achieved even if an
 * average later drifts back below the target.
 */
export function GoalsProgress({ data }: { data: GoalData }) {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const recorded = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    void myGoals().then((g) => { if (!cancelled) setGoals(g) }).catch(() => { if (!cancelled) setGoals([]) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!goals) return
    for (const g of goals) {
      const p = evaluateGoal(g, data)
      if (!newlyAchieved(g, p) || p.value === null || recorded.current.has(g.id)) continue
      recorded.current.add(g.id)
      const value = p.value
      void markGoalAchieved(g.id, value)
        .then(() => setGoals((prev) => prev && prev.map((x) => (x.id === g.id ? { ...x, achievedAt: new Date().toISOString(), achievedValue: value } : x))))
        .catch(() => recorded.current.delete(g.id)) // try again next time rather than lose it
    }
  }, [goals, data])

  if (!goals) return null
  const shown = goals.map((g) => ({ g, p: evaluateGoal(g, data) })).filter(({ g, p }) => showOnHome(g, p))
  if (shown.length === 0) return null

  return (
    <>
      <h2>Goals</h2>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {shown.map(({ g, p }, i) => (
          <div key={g.id} style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}>
            <GoalRow goal={g} progress={p} />
          </div>
        ))}
      </div>
    </>
  )
}

/** The goals an athlete has chosen to share, on the page a coach reads about
 *  them. Read-only, and nothing at all when they haven't shared any — the
 *  database only hands over shared goals to coaches who already see the athlete. */
export function SharedGoals({ athleteId, data }: { athleteId: string; data: GoalData }) {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  useEffect(() => {
    let cancelled = false
    setGoals(null)
    void sharedGoalsOf(athleteId).then((g) => { if (!cancelled) setGoals(g) }).catch(() => { if (!cancelled) setGoals([]) })
    return () => { cancelled = true }
  }, [athleteId])

  if (!goals || goals.length === 0) return null
  return (
    <>
      <h2>Goals</h2>
      <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {goals.map((g, i) => (
          <div key={g.id} style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}>
            <GoalRow goal={g} progress={evaluateGoal(g, data)} />
          </div>
        ))}
      </div>
    </>
  )
}
