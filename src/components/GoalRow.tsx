import type { ReactNode } from 'react'
import { goalDeadline, goalStatusText, goalTitle, type Goal, type GoalProgress } from '../lib/goalProgress'
import { CheckIcon } from './icons'

/** One goal and how it's going: its name, deadline, a progress bar and a line
 *  of status. `action` is whatever sits at the end of the status line — Share
 *  on the athlete's own home, nothing on a coach's read-only view. */
export function GoalRow({ goal, progress, action, archived }: { goal: Goal; progress: GoalProgress; action?: ReactNode; archived?: boolean }) {
  const done = progress.status === 'achieved'
  const missed = progress.status === 'missed'
  return (
    <div style={{ padding: '8px 0' }}>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>
          {done && (
            <span style={{ color: 'var(--good)', display: 'inline-flex', marginRight: 6, verticalAlign: 'text-bottom' }}>
              <CheckIcon />
            </span>
          )}
          {goalTitle(goal)}
        </span>
        <span className="meta" style={{ flex: 'none', margin: 0 }}>{goalDeadline(goal)}</span>
      </div>
      <div className={`goal-bar${done ? ' done' : missed ? ' missed' : ''}`} role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.fraction * 100)}>
        <i style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
      </div>
      <div className="row" style={{ alignItems: 'center' }}>
        <span className="meta" style={{ flex: 1, margin: 0 }}>{goalStatusText(goal, progress)}{archived ? ' · Archived' : ''}</span>
        {action}
      </div>
    </div>
  )
}
