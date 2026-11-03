import type { PendingTarget, Position, TemplateStep } from './types'

/** The most steps a template can hold. */
export const MAX_TEMPLATE_STEPS = 40

/** Anything that was shot: a bout, or a precision bout still waiting for its photo. */
export interface ShotLike {
  kind: 'precision' | 'metal'
  position: Position
  shotAt: string
}

/** A pending target is a precision bout that happened, so it counts as a shot. */
export const pendingAsShot = (p: PendingTarget): ShotLike => ({ kind: 'precision', position: p.position, shotAt: p.shotAt })

const byTime = (a: ShotLike, b: ShotLike) => a.shotAt.localeCompare(b.shotAt)

/** The steps a finished workout would make as a template: its bouts, in the
 *  order they were shot. Wind, clicks and notes belong to the day, not the template. */
export function stepsFromEntries(entries: ShotLike[]): TemplateStep[] {
  return [...entries].sort(byTime).slice(0, MAX_TEMPLATE_STEPS).map((e) => ({ kind: e.kind, position: e.position }))
}

/** How many steps are done: the bouts shot so far are matched to the steps in
 *  order, and a bout that is not the next step (an extra, or a different position)
 *  is left out rather than ending the run. */
export function stepsDone(steps: TemplateStep[], entries: ShotLike[]): number {
  let done = 0
  for (const e of [...entries].sort(byTime)) {
    const next = steps[done]
    if (next && next.kind === e.kind && next.position === e.position) done += 1
  }
  return done
}

const POSITION: Record<Position, string> = { prone: 'Prone', standing: 'Standing' }

export const stepLabel = (step: TemplateStep) => `${POSITION[step.position]} ${step.kind === 'precision' ? 'precision' : 'metal'}`

/** "Prone precision, standing precision, 2 × prone metal" — a template at a glance. */
export function summariseSteps(steps: TemplateStep[]): string {
  const runs: { label: string; n: number }[] = []
  for (const s of steps) {
    const label = stepLabel(s).toLowerCase()
    const last = runs[runs.length - 1]
    if (last && last.label === label) last.n += 1
    else runs.push({ label, n: 1 })
  }
  const text = runs.map((r) => (r.n > 1 ? `${r.n} × ${r.label}` : r.label)).join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
