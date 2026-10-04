import { useEffect, useState } from 'react'
import { myPersonalCoachRequests, respondToPersonalCoachRequest, type PersonalCoachRequest } from '../lib/personalCoach'
import { errorMessage } from '../lib/errors'

/**
 * Coaches who've used the athlete's invite code and are waiting for a yes.
 * Nothing is shared with them until the athlete approves, and declining
 * throws the request away. Shows nothing when no one is waiting, so it can sit
 * on the home screen as well as in Profile. `onChanged` lets Profile refresh
 * its list of current coaches after an approval.
 */
export function PersonalCoachRequests({ onChanged }: { onChanged?: () => void }) {
  const [requests, setRequests] = useState<PersonalCoachRequest[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void myPersonalCoachRequests().then((r) => { if (!cancelled) setRequests(r) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  async function respond(r: PersonalCoachRequest, approve: boolean) {
    setBusy(r.coachId)
    setError('')
    try {
      await respondToPersonalCoachRequest(r.coachId, approve)
      setRequests((prev) => prev.filter((x) => x.coachId !== r.coachId))
      onChanged?.()
    } catch (e) {
      setError(errorMessage(e, 'Could not do that. Check your connection and try again.'))
    } finally {
      setBusy(null)
    }
  }

  if (requests.length === 0) return null
  return (
    <div className="card" style={{ borderColor: 'var(--series-1)', borderWidth: 2, marginBottom: 14 }}>
      {requests.map((r, i) => (
        <div key={r.coachId} style={i > 0 ? { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' } : undefined}>
          <p style={{ margin: '0 0 4px' }}>
            <strong>{r.coachName || 'Someone'}</strong> used your invite code and wants to follow your training.
          </p>
          <p className="meta" style={{ margin: '0 0 10px' }}>
            If you approve, they'll see your sessions, analysis and posts, and announcements from your
            club's coaches — never your target photos. Only approve someone you know. You can remove them
            any time.
          </p>
          <div className="row">
            <button className="secondary" disabled={busy !== null} onClick={() => void respond(r, false)}>Decline</button>
            <button className="primary" disabled={busy !== null} onClick={() => void respond(r, true)}>Approve</button>
          </div>
        </div>
      ))}
      {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  )
}
