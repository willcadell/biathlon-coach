import type { ReactNode } from 'react'
import { goalDeadline, goalStatusText, goalTitle, type Goal, type GoalProgress } from '../lib/goalProgress'
import { CheckIcon } from './icons'

/** One goal and how it's going, as its own box: its name, deadline, a progress
 *  bar and a line of status. A dry-fire goal's box is the Dryfire green. `action` is whatever sits at the end of the status line — Share
 *  on the athlete's own home, nothing on a coach's read-only view. */
export function GoalRow({ goal, progress, action, archived, tag }: { goal: Goal; progress: GoalProgress; action?: ReactNode; archived?: boolean; tag?: string }) {
  const done = progress.status === 'achieved'
  const missed = progress.status === 'missed'
  return (
    <div
      className={`card goal-box ${goal.metric === 'dryfire_minutes' ? 'dryfire' : 'range'}`}
      style={archived ? { opacity: 0.7 } : undefined}
    >
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>
          {done && (
            <span className="goal-check" style={{ display: 'inline-flex', marginRight: 6, verticalAlign: 'text-bottom' }}>
              <CheckIcon />
            </span>
          )}
          {goalTitle(goal)}
          {tag && <span className="goal-tag">{tag}</span>}
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
