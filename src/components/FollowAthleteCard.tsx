import { useState } from 'react'
import { findPersonalInvite, redeemPersonalInvite, type PersonalAthlete } from '../lib/personalCoach'
import { errorMessage } from '../lib/errors'

/**
 * The coach's side of personal coaching, shaped like joining a club: enter the
 * code, Find it, confirm who it is. The athlete then appears on the Coach tab
 * under "Coach your individual athletes". Sits in Profile's coach section, in the
 * "Follow an athlete" dropdown after "Join an existing club".
 */
export function FollowAthleteCard() {
  const [code, setCode] = useState('')
  const [match, setMatch] = useState<PersonalAthlete | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [following, setFollowing] = useState(false)
  const [followed, setFollowed] = useState('')

  async function checkCode() {
    setError('')
    setFollowed('')
    setMatch(null)
    if (!code.trim()) return
    setChecking(true)
    try {
      const found = await findPersonalInvite(code)
      if (found) setMatch(found)
      else setError("That code isn't valid, or it has expired or been used. Ask the athlete for a new one.")
    } catch (e) {
      setError(errorMessage(e, 'Could not check that code. Check your connection and try again.'))
    } finally {
      setChecking(false)
    }
  }

  async function confirmFollow() {
    if (!match) return
    setFollowing(true)
    try {
      const athlete = await redeemPersonalInvite(code)
      setFollowed(athlete.displayName || 'this athlete')
      setMatch(null)
      setCode('')
    } catch (e) {
      setError(errorMessage(e, 'Could not follow that athlete. Check your connection and try again.'))
    } finally {
      setFollowing(false)
    }
  }

  return (
    <>
      <div className="card">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>
            Athlete's invite code
            <small>
              For a parent, or a coach outside the athlete's club. The athlete makes it in their own
              Profile and gives it to you; it works once.
            </small>
          </span>
          <div className="row">
            <input
              type="text" style={{ flex: 1 }} placeholder="e.g. 7K4RXP" value={code} autoCapitalize="characters"
              onChange={(e) => { setCode(e.target.value); setMatch(null); setError(''); setFollowed('') }}
            />
            <button
              className="secondary" style={{ flex: 'none', width: 'auto' }}
              onClick={() => void checkCode()} disabled={checking || !code.trim()}
            >
              {checking ? 'Checking…' : 'Find'}
            </button>
          </div>
        </label>
        {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}
        {followed && (
          <div className="notice" style={{ marginTop: 10 }}>
            You're now coaching <strong>{followed}</strong>. Find them on the Coach tab, under Coach your
            individual athletes.
          </div>
        )}
        {match && (
          <>
            <p className="meta">
              Follow <strong>{match.displayName || 'this athlete'}</strong>? You'll see their sessions,
              analysis and posts, and announcements from their club's coaches.
            </p>
            <div className="row">
              <button className="secondary" onClick={() => { setMatch(null); setCode('') }} disabled={following}>
                Cancel
              </button>
              <button className="primary" onClick={() => void confirmFollow()} disabled={following}>
                {following ? 'Following…' : 'Follow'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
