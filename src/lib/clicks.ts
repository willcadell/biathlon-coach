import type { ClickAdjustment } from './types'

/** A one-line total of every zero adjustment logged in a workout: the clicks up, down, left and
 *  right, and the clips. The click log itself still lists each one with its note. */
export function clickSummary(clickLog: ClickAdjustment[]): string {
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
