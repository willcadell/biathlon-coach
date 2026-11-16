import { alternativesFor, checkFor, type Alternative } from './differentials'
import { SEVERITY_WEIGHT, recommend, type Recommendation } from './training'
import type { Finding, Position } from './types'

/**
 * How the athlete's own answers shape the advice, the way a coach's questions would.
 * The targets stay primary: feedback re-ranks and re-words, and never silently hides
 * a finding. Design: docs/athlete-feedback/DESIGN.md (items 4 to 6).
 */

export type FindingVerdict = 'agree' | 'not-me' | 'check'
export type DrillVerdict = 'helped' | 'not-helped' | 'not-tried'

/** One answer the athlete gave. Kept as a log; the latest answers win. */
export interface FeedbackEvent {
  id: string
  kind: 'finding' | 'drill'
  /** The finding id or drill id. */
  ref: string
  /** The finding's position. Null for a drill. */
  position: Position | 'both' | null
  verdict: FindingVerdict | DrillVerdict
  /** For "not-me": the alternative picked, or 'unknown'. For "check": the answer id. */
  detail: string | null
  /** The finding's confidence when this was said, so "the data got stronger" can be judged. */
  confidence: number | null
  createdAt: string
}

export type FindingStatus = 'open' | 'agreed' | 'confirmed' | 'dismissed' | 'reask'

export interface FindingState {
  finding: Finding
  status: FindingStatus
  /** The cause the athlete picked instead, or the one their check pointed at. */
  alternative?: Alternative
  /** The alternative came from a check, not just a hunch. */
  altConfirmed?: boolean
  /** What to do next, from the last check answer. */
  checkNote?: string
  /** Why the app is asking about a dismissed finding again. */
  reaskReason?: string
  /** Said "not me" twice: it stays set aside. */
  final?: boolean
  /** The finding's confidence after the athlete's answers. */
  confidence: number
}

const DAY = 86400_000
/** Never re-ask about a dismissed finding sooner than this, unless a check overturned the athlete's pick. */
const REASK_AFTER_DAYS = 30
/** How much stronger the data must get before a dismissed finding is raised again. */
const REASK_CONFIDENCE_RISE = 0.2

export const findingKey = (id: string, position: Position | 'both' | null) => `${id}:${position ?? 'both'}`

/** The latest thing said about each drill, with when. */
export function drillVerdicts(events: FeedbackEvent[]): Map<string, { verdict: DrillVerdict; at: string }> {
  const out = new Map<string, { verdict: DrillVerdict; at: string }>()
  for (const e of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (e.kind === 'drill') out.set(e.ref, { verdict: e.verdict as DrillVerdict, at: e.createdAt })
  }
  return out
}

export function assessFinding(finding: Finding, events: FeedbackEvent[], now = Date.now()): FindingState {
  const key = findingKey(finding.id, finding.position)
  const mine = events
    .filter((e) => e.kind === 'finding' && findingKey(e.ref, e.position) === key)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const alternatives = alternativesFor(finding.id, finding.position)
  const check = checkFor(finding.id, finding.position)

  let status: FindingStatus = 'open'
  let alternative: Alternative | undefined
  let altConfirmed = false
  let checkNote: string | undefined
  let notMeCount = 0
  let dismissedAt = ''
  let dismissedConfidence = finding.confidence
  let overturnedAt = ''

  for (const e of mine) {
    if (e.verdict === 'agree') {
      status = 'agreed'
      alternative = undefined
      altConfirmed = false
    } else if (e.verdict === 'not-me') {
      notMeCount += 1
      status = 'dismissed'
      alternative = alternatives.find((a) => a.id === e.detail)
      altConfirmed = false
      dismissedAt = e.createdAt
      dismissedConfidence = e.confidence ?? finding.confidence
      overturnedAt = ''
    } else if (e.verdict === 'check') {
      const answer = check?.answers.find((a) => a.id === e.detail)
      if (!answer) continue
      checkNote = answer.note
      if (answer.points === 'first') {
        // The check points back at the app's first read: if the athlete had set it
        // aside, that is worth raising again straight away.
        if (status === 'dismissed') overturnedAt = e.createdAt
        else status = answer.weak ? 'agreed' : 'confirmed'
      } else if (answer.points) {
        const alt = alternatives.find((a) => a.id === answer.points)
        if (!alt) continue
        status = 'dismissed'
        alternative = alt
        altConfirmed = !answer.weak
        dismissedAt = e.createdAt
        dismissedConfidence = e.confidence ?? finding.confidence
        overturnedAt = ''
      }
    }
  }

  let reaskReason: string | undefined
  const final = notMeCount >= 2
  if (status === 'dismissed' && !final) {
    const waited = now - Date.parse(dismissedAt) >= REASK_AFTER_DAYS * DAY
    const drills = drillVerdicts(events)
    const altDidNotHelp = !!alternative && alternative.drills.length > 0 &&
      alternative.drills.every((d) => { const v = drills.get(d); return !!v && v.verdict === 'not-helped' && v.at > dismissedAt })
    if (overturnedAt) reaskReason = 'Your check pointed back at this one.'
    else if (waited && altDidNotHelp) reaskReason = `The drills for “${alternative!.chip.toLowerCase()}” didn’t help.`
    else if (waited && finding.confidence >= dismissedConfidence + REASK_CONFIDENCE_RISE) reaskReason = 'The evidence for this has grown since you set it aside.'
    if (reaskReason) status = 'reask'
  }

  const factor = status === 'confirmed' ? 1.3 : status === 'agreed' ? 1.15 : status === 'dismissed' ? 2 / 3 : 1
  return {
    finding,
    status,
    alternative: status === 'dismissed' || status === 'reask' ? alternative : undefined,
    altConfirmed: alternative ? altConfirmed : undefined,
    checkNote,
    reaskReason,
    final: status === 'dismissed' ? final : undefined,
    confidence: Math.min(0.99, finding.confidence * factor),
  }
}

/** The drills for the week, ranked with the athlete's answers taken into account. */
export function planWithFeedback(states: FindingState[], events: FeedbackEvent[], limit?: number): Recommendation[] {
  const findings: Finding[] = []
  const extra: { drillId: string; score: number; reason: string }[] = []
  for (const s of states) {
    if (s.status === 'dismissed' && s.alternative) {
      // The athlete's pick replaces the first read's drills.
      const weight = SEVERITY_WEIGHT[s.finding.severity] * s.finding.confidence * (s.altConfirmed ? 1 : 0.8)
      s.alternative.drills.forEach((drillId, i) => extra.push({
        drillId, score: weight * (i === 0 ? 1 : 0.85), reason: `you said “${s.alternative!.chip.toLowerCase()}”`,
      }))
    } else {
      findings.push({ ...s.finding, confidence: s.confidence })
    }
  }
  const drills = drillVerdicts(events)
  const factor = (id: string) => {
    const v = drills.get(id)?.verdict
    return v === 'helped' ? 1.25 : v === 'not-helped' ? 0.35 : 1
  }
  return recommend(findings, limit, { extra, factor })
}
