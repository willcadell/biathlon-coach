import { useEffect, useRef, useState } from 'react'
import {
  canArchive, evaluateGoal, formatValue, goalTitle, goalsFor, needsCelebration, newlyAchieved,
  type Goal, type GoalData, type GoalFilter,
} from '../lib/goalProgress'
import { markGoalAchieved, markGoalsCelebrated, myGoals, setGoalArchived, sharedGoalsOf } from '../lib/goals'
import { Confetti } from './Confetti'
import { GoalRow } from './GoalRow'
import { ArchiveIcon, ChevronIcon, ShareIcon, TrophyIcon } from './icons'
import { ShareSheet } from './ShareSheet'

const OPEN_KEY = 'goals-open'
// Open or closed is a per-device convenience: fine to lose, so never let
// storage being blocked get in the way.
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== '0' } catch { return true } }
const writeOpen = (open: boolean) => { try { localStorage.setItem(OPEN_KEY, open ? '1' : '0') } catch { /* private window */ } }

/**
 * The athlete's goals on their home, between Start a session and the feed: how
 * each one is going, from the training logged so far. Goals are set in
 * Profile. Shows nothing at all when they have no goals — no empty card.
 *
 * When a goal is first met this records it, so it stays achieved even if an
 * average later drifts back below the target — and the first time the athlete
 * is on this screen after that, they get the confetti and a success message.
 * A finished goal can be archived; "Live" (the default) hides archived ones
 * and "All" brings them back.
 */
export function GoalsProgress({ data }: { data: GoalData }) {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [open, setOpen] = useState(readOpen)
  const [filter, setFilter] = useState<GoalFilter>('live')
  const [sharing, setSharing] = useState<Goal | null>(null)
  const [celebrating, setCelebrating] = useState<Goal[] | null>(null)
  const recorded = useRef(new Set<string>())
  const celebrated = useRef(new Set<string>())

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

  // The celebration: once per goal, the first time it's on screen after being
  // met. It's marked as seen straight away, so leaving mid-confetti doesn't
  // bring it back; a failed save just means one more showing, never a loop.
  useEffect(() => {
    if (!goals || celebrating) return
    const won = goals.filter((g) => !celebrated.current.has(g.id) && needsCelebration(g, evaluateGoal(g, data)))
    if (won.length === 0) return
    const ids = won.map((g) => g.id)
    ids.forEach((id) => celebrated.current.add(id))
    setCelebrating(won)
    void markGoalsCelebrated(ids).catch(() => undefined)
    setGoals((prev) => prev && prev.map((x) => (ids.includes(x.id) ? { ...x, celebratedAt: new Date().toISOString() } : x)))
  }, [goals, data, celebrating])

  async function archive(g: Goal, archived: boolean) {
    const at = archived ? new Date().toISOString() : null
    setGoals((prev) => prev && prev.map((x) => (x.id === g.id ? { ...x, archivedAt: at } : x)))
    try {
      await setGoalArchived(g.id, archived)
    } catch {
      setGoals((prev) => prev && prev.map((x) => (x.id === g.id ? { ...x, archivedAt: g.archivedAt } : x)))
    }
  }

  if (!goals || goals.length === 0) return null
  const rows = goals.map((g) => ({ g, p: evaluateGoal(g, data) }))
  const shown = goalsFor(rows, filter)
  const hiddenCount = rows.length - goalsFor(rows, 'live').length

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '28px 0 8px' }}>
        <h1 style={{ margin: 0 }}>Goals</h1>
        <button
          className="link"
          aria-label={open ? 'Collapse Goals' : 'Expand Goals'} aria-expanded={open}
          onClick={() => { setOpen(!open); writeOpen(!open) }}
        >
          <ChevronIcon direction={open ? 'up' : 'down'} />
        </button>
      </div>

      {open && (
        <>
          {(hiddenCount > 0 || filter === 'all') && (
            <div className="seg" style={{ marginBottom: 8 }} role="group" aria-label="Which goals to show">
              <button aria-pressed={filter === 'live'} onClick={() => setFilter('live')}>Live</button>
              <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All goals</button>
            </div>
          )}
          {shown.length === 0 ? (
            <p className="meta">No live goals. Set one in your Profile, or choose All goals to see the ones you've archived.</p>
          ) : (
            <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
              {shown.map(({ g, p }, i) => (
                <div key={g.id} style={{ ...(i > 0 ? { borderTop: '1px solid var(--border)' } : {}), ...(g.archivedAt ? { opacity: 0.7 } : {}) }}>
                  <GoalRow
                    goal={g} progress={p} archived={Boolean(g.archivedAt)}
                    action={
                      <span style={{ flex: 'none', display: 'inline-flex', gap: 4 }}>
                        {p.status === 'achieved' && !g.archivedAt && (
                          <button className="link" style={{ flex: 'none' }} aria-label={`Share the goal ${goalTitle(g)}`} title="Share this goal" onClick={() => setSharing(g)}>
                            <ShareIcon />
                          </button>
                        )}
                        {g.archivedAt ? (
                          <button className="link" style={{ flex: 'none' }} onClick={() => void archive(g, false)}>Restore</button>
                        ) : canArchive(p) && (
                          <button className="link" style={{ flex: 'none' }} aria-label={`Archive the goal ${goalTitle(g)}`} title="Archive this goal" onClick={() => void archive(g, true)}>
                            <ArchiveIcon />
                          </button>
                        )}
                      </span>
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {sharing && <ShareSheet goal={sharing} onClose={() => setSharing(null)} />}
      {celebrating && <Celebration goals={celebrating} data={data} onDone={() => setCelebrating(null)} />}
    </>
  )
}

/** The success message and confetti for goals just achieved. */
function Celebration({ goals, data, onDone }: { goals: Goal[]; data: GoalData; onDone: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  return (
    <>
      <Confetti />
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Goal achieved" onClick={onDone}>
        <div className="modal-card goal-celebration" onClick={(e) => e.stopPropagation()}>
          <div className="goal-medal"><TrophyIcon size={30} /></div>
          <h2 style={{ margin: '0 0 6px' }}>{goals.length === 1 ? 'Goal achieved!' : `${goals.length} goals achieved!`}</h2>
          {goals.map((g) => {
            const p = evaluateGoal(g, data)
            return (
              <p key={g.id} style={{ margin: '0 0 6px' }}>
                <strong>{goalTitle(g)}</strong>
                <br />
                <span className="meta">You got there at {formatValue(g.metric, p.value)}. Well done.</span>
              </p>
            )
          })}
          <button className="primary" style={{ marginTop: 10 }} autoFocus onClick={onDone}>Nice</button>
        </div>
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
