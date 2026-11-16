import { supabase } from './supabase'
import { currentUserId } from './auth'
import type { FeedbackEvent } from './feedbackRules'

export * from './feedbackRules'

interface FeedbackRow {
  id: string
  kind: FeedbackEvent['kind']
  ref: string
  position: FeedbackEvent['position']
  verdict: FeedbackEvent['verdict']
  detail: string | null
  confidence: number | null
  created_at: string
}

const COLUMNS = 'id, kind, ref, position, verdict, detail, confidence, created_at'

const toEvent = (r: FeedbackRow): FeedbackEvent => ({
  id: r.id, kind: r.kind, ref: r.ref, position: r.position, verdict: r.verdict,
  detail: r.detail, confidence: r.confidence, createdAt: r.created_at,
})

/** Every answer this athlete has given about their advice, oldest first. A coach
 *  passes the athlete's id; the database only hands over rows they may read. */
export async function adviceFeedbackFor(athleteId?: string): Promise<FeedbackEvent[]> {
  const id = athleteId ?? await currentUserId()
  const { data, error } = await supabase.from('advice_feedback').select(COLUMNS).eq('athlete_id', id).order('created_at')
  if (error) throw error
  return (data as FeedbackRow[] ?? []).map(toEvent)
}

/** Records one answer from the signed-in athlete, and returns it as saved. */
export async function addAdviceFeedback(e: Omit<FeedbackEvent, 'id' | 'createdAt'>): Promise<FeedbackEvent> {
  const { data, error } = await supabase.from('advice_feedback').insert({
    kind: e.kind, ref: e.ref, position: e.position, verdict: e.verdict, detail: e.detail, confidence: e.confidence,
  }).select(COLUMNS).single()
  if (error) throw error
  return toEvent(data as FeedbackRow)
}
