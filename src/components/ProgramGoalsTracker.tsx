import { useEffect, useState } from 'react'
import type { Club } from '../lib/coaching'
import { programsForClub } from '../lib/coaching'
import type { Goal, GoalProgress } from '../lib/goalProgress'
import { programGoalRows } from '../lib/goals'
import { GoalRow } from './GoalRow'

/**
 * The coach's tracker for the goals they've set, on their 545 Coach home: how
 * each program is getting on, across every club they coach. Read-only: goals
 * are set and managed in the Club tab. Shows nothing at all with no live goals.
 */
export function ProgramGoalsTracker({ clubs }: { clubs: Club[] }) {
  const [rows, setRows] = useState<{ g: Goal; p: GoalProgress; tag: string }[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const perClub = await Promise.all(clubs.map(async (club) => {
        const programs = await programsForClub(club.id)
        const perProgram = await Promise.all(programs.map(async (program) => {
          const goals = await programGoalRows(program.id)
          // Name the club too when there's more than one to tell apart.
          const tag = clubs.length > 1 ? `${club.name} · ${program.name}` : program.name
          return goals.map((r) => ({ ...r, tag }))
        }))
        return perProgram.flat()
      }))
      if (!cancelled) setRows(perClub.flat())
    })().catch(() => undefined) // an extra on the home screen: nothing breaks without it
    return () => { cancelled = true }
  }, [clubs.map((c) => c.id).join(',')])

  const live = rows.filter((r) => !r.g.archivedAt)
  if (live.length === 0) return null
  return (
    <>
      <h1 style={{ margin: '28px 0 8px' }}>Program goals</h1>
      {live.map(({ g, p, tag }) => <GoalRow key={g.id} goal={g} progress={p} tag={tag} />)}
    </>
  )
}
