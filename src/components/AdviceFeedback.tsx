import { useCallback, useEffect, useState } from 'react'
import {
  addAdviceFeedback, adviceFeedbackFor, drillVerdicts,
  type DrillVerdict, type FeedbackEvent, type FindingState, type FindingVerdict,
} from '../lib/adviceFeedback'
import { alternativesFor, checkFor } from '../lib/differentials'
import type { Finding } from '../lib/types'
import { errorMessage } from '../lib/errors'

/**
 * The athlete's answers to their advice: loaded once, added to as they answer. A coach
 * passes the athlete's id and only reads. If the table is not there yet (migration not
 * applied) or the read is refused, the advice simply carries on without answers.
 */
export function useAdviceFeedback({ athleteId, enabled = true }: { athleteId?: string; enabled?: boolean } = {}) {
  const [events, setEvents] = useState<FeedbackEvent[]>([])
  useEffect(() => {
    if (!enabled) return
    let live = true
    adviceFeedbackFor(athleteId)
      .then((e) => { if (live) setEvents(e) })
      .catch((e) => console.error('Could not load advice feedback', e))
    return () => { live = false }
  }, [athleteId, enabled])

  const add = useCallback(async (e: Omit<FeedbackEvent, 'id' | 'createdAt'>) => {
    const saved = await addAdviceFeedback(e)
    setEvents((es) => [...es, saved])
  }, [])
  return { events, add }
}

export type AnswerFinding = (verdict: FindingVerdict, detail: string | null) => Promise<void>

/**
 * Under a finding: the athlete's answer, and the coach's questions that follow it.
 * "Sounds like me" / "Not me"; "Not me" asks which cause sounds closer; "Don't know"
 * offers the check that tells them apart. A coach (no `onAnswer`) sees only what the
 * athlete said.
 */
export function FindingFeedback({ state, onAnswer }: { state: FindingState; onAnswer?: AnswerFinding }) {
  const f = state.finding
  const alternatives = alternativesFor(f.id, f.position)
  const check = checkFor(f.id, f.position)
  const [asking, setAsking] = useState<null | 'which' | 'check'>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (alternatives.length === 0 && !check) return null

  const answer = async (verdict: FindingVerdict, detail: string | null, next: null | 'check' = null) => {
    if (!onAnswer) return
    setSaving(true)
    setError('')
    try {
      await onAnswer(verdict, detail)
      setAsking(next)
    } catch (e) {
      setError(errorMessage(e, 'Could not save your answer. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  if (!onAnswer) return <CoachReadout state={state} />

  return (
    <div className="feedback">
      {state.status === 'reask' && (
        <div className="notice" style={{ margin: '8px 0' }}>
          <strong>Worth another look?</strong> You set this aside before. {state.reaskReason}
        </div>
      )}
      {state.status === 'confirmed' && <p className="meta feedback__said">✓ Your check confirmed this.</p>}
      {state.status === 'agreed' && <p className="meta feedback__said">You said this sounds like you.</p>}
      {state.checkNote && <div className="notice" style={{ margin: '8px 0' }}>{state.checkNote}</div>}

      {asking === null && (state.status === 'open' || state.status === 'reask') && (
        <div className="feedback__ask">
          <span className="feedback__q">{state.status === 'reask' ? 'Does it sound like you now?' : 'Does this sound like you?'}</span>
          <div className="feedback__buttons">
            <button type="button" disabled={saving} onClick={() => void answer('agree', null)}>Sounds like me</button>
            <button type="button" disabled={saving} onClick={() => setAsking('which')}>{state.status === 'reask' ? 'Still not me' : 'Not me'}</button>
          </div>
          {check && state.status === 'open' && (
            <button type="button" className="link feedback__check-link" onClick={() => setAsking('check')}>Not sure? Run a quick check</button>
          )}
        </div>
      )}

      {asking === null && (state.status === 'agreed' || state.status === 'confirmed') && (
        <button type="button" className="link feedback__change" onClick={() => setAsking('which')}>Not quite right?</button>
      )}

      {asking === 'which' && (
        <div className="feedback__which">
          <p className="feedback__q" style={{ margin: '0 0 6px' }}>Which sounds closer?</p>
          <div className="feedback__chips">
            {alternatives.map((a) => (
              <button key={a.id} type="button" disabled={saving} onClick={() => void answer('not-me', a.id)}>{a.chip}</button>
            ))}
            <button type="button" disabled={saving} onClick={() => void answer('not-me', 'unknown', check ? 'check' : null)}>Don’t know</button>
          </div>
          <button type="button" className="link" style={{ marginTop: 6 }} onClick={() => setAsking(null)}>Cancel</button>
        </div>
      )}

      {asking === 'check' && check && (
        <div className="feedback__checkcard">
          <p className="feedback__q" style={{ margin: 0 }}>Try this: {check.title.toLowerCase()}</p>
          <p style={{ margin: '4px 0' }}>{check.how}</p>
          {check.partner && <p className="meta" style={{ margin: '0 0 6px' }}>{check.partner}</p>}
          <p className="meta" style={{ margin: '0 0 6px' }}>Then tell us what happened:</p>
          <div className="feedback__chips">
            {check.answers.map((a) => (
              <button key={a.id} type="button" disabled={saving} onClick={() => void answer('check', a.id)}>{a.label}</button>
            ))}
          </div>
          <button type="button" className="link" style={{ marginTop: 6 }} onClick={() => setAsking(null)}>I’ll try it later</button>
        </div>
      )}

      {error && <div className="notice error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  )
}

/** A finding the athlete set aside: kept, but folded down to what they said instead. */
export function SetAsideFinding({ state, onAnswer }: { state: FindingState; onAnswer?: AnswerFinding }) {
  const f = state.finding
  const alt = state.alternative
  const check = checkFor(f.id, f.position)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const answer = async (verdict: FindingVerdict, detail: string | null) => {
    if (!onAnswer) return
    setSaving(true)
    setError('')
    try { await onAnswer(verdict, detail); setChecking(false) } catch (e) {
      setError(errorMessage(e, 'Could not save your answer. Check your connection and try again.'))
    } finally { setSaving(false) }
  }
  const who = onAnswer ? 'You' : 'The athlete'

  return (
    <div className="finding set-aside">
      <div className="badge"><i className="dot" />Set aside</div>
      <h3>{f.title}</h3>
      <p className="meta" style={{ marginTop: 0 }}>
        {who} said this doesn’t sound like {onAnswer ? 'you' : 'them'}
        {alt ? <>, and that it’s closer to <strong>{alt.chip.toLowerCase()}</strong>{state.altConfirmed ? ' (a check pointed there too)' : ''}.</> : '.'}
        {state.final && ' Said twice, so it stays set aside.'}
      </p>
      {alt && <p className="cause">{alt.cause}</p>}
      {alt?.note && <div className="notice" style={{ margin: '6px 0' }}>{alt.note}</div>}
      {state.checkNote && <div className="notice" style={{ margin: '6px 0' }}>{state.checkNote}</div>}
      {onAnswer && !checking && (
        <p className="meta" style={{ margin: '6px 0 0' }}>
          <button type="button" className="link" disabled={saving} onClick={() => void answer('agree', null)}>Actually, it does sound like me</button>
          {check && <>{' · '}<button type="button" className="link" onClick={() => setChecking(true)}>Run a check</button></>}
        </p>
      )}
      {onAnswer && checking && check && (
        <div className="feedback__checkcard">
          <p className="feedback__q" style={{ margin: 0 }}>Try this: {check.title.toLowerCase()}</p>
          <p style={{ margin: '4px 0' }}>{check.how}</p>
          {check.partner && <p className="meta" style={{ margin: '0 0 6px' }}>{check.partner}</p>}
          <div className="feedback__chips">
            {check.answers.map((a) => (
              <button key={a.id} type="button" disabled={saving} onClick={() => void answer('check', a.id)}>{a.label}</button>
            ))}
          </div>
          <button type="button" className="link" style={{ marginTop: 6 }} onClick={() => setChecking(false)}>Cancel</button>
        </div>
      )}
      {error && <div className="notice error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  )
}

/** What a coach sees under a finding the athlete has answered. */
function CoachReadout({ state }: { state: FindingState }) {
  if (state.status === 'agreed') return <p className="meta feedback__said">Athlete: sounds like them.</p>
  if (state.status === 'confirmed') return <p className="meta feedback__said">Athlete: confirmed by their check.</p>
  if (state.status === 'reask') return <p className="meta feedback__said">Athlete set this aside earlier; the app is asking them again. {state.reaskReason}</p>
  return null
}

/** Has this drill helped? Asked on the training week and the full drill list. */
export function DrillFeedback({ drillId, events, onAnswer }: {
  drillId: string
  events: FeedbackEvent[]
  onAnswer?: (verdict: DrillVerdict) => Promise<void>
}) {
  const said = drillVerdicts(events).get(drillId)?.verdict
  const [changing, setChanging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const label = said === 'helped' ? 'helped' : said === 'not-helped' ? 'didn’t help' : said === 'not-tried' ? 'not tried yet' : null

  if (!onAnswer) return label ? <p className="meta feedback__said">Athlete: {label}.</p> : null

  const answer = async (v: DrillVerdict) => {
    setSaving(true)
    setError('')
    try { await onAnswer(v); setChanging(false) } catch (e) {
      setError(errorMessage(e, 'Could not save your answer. Check your connection and try again.'))
    } finally { setSaving(false) }
  }

  if (label && !changing) {
    return (
      <p className="meta feedback__said">
        You said this {label === 'not tried yet' ? 'is not tried yet' : label}.{' '}
        <button type="button" className="link" onClick={() => setChanging(true)}>Change</button>
      </p>
    )
  }
  return (
    <div className="feedback__drill">
      <span className="meta">Tried it for a week or so?</span>
      <div className="feedback__chips">
        <button type="button" disabled={saving} onClick={() => void answer('helped')}>Helped</button>
        <button type="button" disabled={saving} onClick={() => void answer('not-helped')}>Didn’t help</button>
        <button type="button" disabled={saving} onClick={() => void answer('not-tried')}>Haven’t tried it</button>
      </div>
      {error && <div className="notice error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  )
}

/** The finding state for answering, ready for `useAdviceFeedback().add`. */
export const findingAnswer = (f: Finding, verdict: FindingVerdict, detail: string | null): Omit<FeedbackEvent, 'id' | 'createdAt'> => ({
  kind: 'finding', ref: f.id, position: f.position, verdict, detail, confidence: f.confidence,
})
