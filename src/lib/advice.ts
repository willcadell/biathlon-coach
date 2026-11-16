import { analyse } from './diagnostics'
import { analyseMetal } from './metalAdvice'
import type { Recommendation } from './training'
import { assessFinding, planWithFeedback, type FeedbackEvent } from './feedbackRules'
import type { Bout, Finding, MetalBout, Settings, ShootingDirection, Workout } from './types'

/** Precision bouts older than this stop counting toward the coaching read. */
export const WINDOW_DAYS = 60
export const MAX_BOUTS = 20

/** The precision bouts the coaching read is built from: the last 60 days. After a
 *  longer break (the off-season) nothing falls in that window, so it falls back to
 *  the most recent bouts there are, and says how long ago the last one was. */
export function precisionWindow(bouts: Bout[], now = Date.now()): { recent: Bout[]; stale: boolean; daysSince: number } {
  const cutoff = now - WINDOW_DAYS * 86400_000
  const inWindow = bouts.filter((b) => new Date(b.shotAt).getTime() >= cutoff).slice(0, MAX_BOUTS)
  if (inWindow.length > 0 || bouts.length === 0) return { recent: inWindow, stale: false, daysSince: 0 }
  const latest = Math.max(...bouts.map((b) => new Date(b.shotAt).getTime()))
  return { recent: bouts.slice(0, MAX_BOUTS), stale: true, daysSince: Math.max(1, Math.round((now - latest) / 86400_000)) }
}

/** Everything the advice says, from the athlete's own shooting: what the precision
 *  groups and the metal bouts show, and the drills that answer it, best first. */
export function adviceFor({ bouts, metalBouts, workouts, settings, direction, limit, events = [] }: {
  bouts: Bout[]
  metalBouts: MetalBout[]
  workouts: Workout[]
  settings: Settings
  direction?: ShootingDirection
  /** How many drills to rank (Analysis shows six). */
  limit?: number
  /** The athlete's answers to their advice, which re-rank the drills. */
  events?: FeedbackEvent[]
}): { findings: Finding[]; metalFindings: Finding[]; plan: Recommendation[] } {
  const findings = analyse(precisionWindow(bouts).recent, settings, workouts)
  const metalFindings = analyseMetal({ bouts: metalBouts, workouts, direction })
  return { findings, metalFindings, plan: planWithFeedback([...findings, ...metalFindings].map((f) => assessFinding(f, events)), events, limit) }
}
