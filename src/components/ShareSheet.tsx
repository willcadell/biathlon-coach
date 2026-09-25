import { useState } from 'react'
import type { Bout, Workout } from '../lib/types'
import { errorMessage } from '../lib/errors'
import { postToFeed, useMemberships } from '../lib/feed'
import { shareTargetImage } from '../lib/share'
import { ShareIcon } from './icons'

/**
 * Everything "Share" can do, in one place. A target can go out as an image
 * (the trading card) or be posted to a club's feed; a workout can only be
 * posted, since the image is a target's. Posting is always a deliberate
 * choice made here — nothing reaches a feed on its own — and the sheet says
 * plainly who will see it before the athlete taps.
 */
export function ShareSheet({
  bout, workout, onClose, onPostedDone,
}: {
  bout?: Bout
  workout: Workout
  onClose: () => void
  /** Called after "Done" once something's been posted — the session-complete
   *  screen uses it to head back to the 545 home, since posting is the last
   *  thing left to do there. Other places just close the sheet. */
  onPostedDone?: () => void
}) {
  const memberships = useMemberships()
  const [busy, setBusy] = useState<string | null>(null)
  const [posted, setPosted] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function shareImage() {
    if (!bout) return
    setBusy('image')
    setError('')
    try {
      await shareTargetImage(bout, workout)
      onClose()
    } catch (e) {
      // Closing the share sheet without choosing anything is a cancel, not a failure.
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(errorMessage(e, 'Could not create a shareable image.'))
    } finally {
      setBusy(null)
    }
  }

  async function post(clubId: string, clubName: string) {
    setBusy(clubId)
    setError('')
    try {
      await postToFeed(clubId, bout ? { boutId: bout.id } : { workoutId: workout.id })
      setPosted(clubName)
    } catch (e) {
      setError(errorMessage(e, 'Could not post to the club feed. Check your connection and try again.'))
    } finally {
      setBusy(null)
    }
  }

  const noun = bout ? 'target' : 'workout'

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Share this ${noun}`}>
      <div className="modal-card">
        <h2 style={{ marginTop: 0 }}>Share this {noun}</h2>

        {posted ? (
          <>
            <p>Posted to the <strong>{posted}</strong> feed.</p>
            <p className="meta">You can take it down any time from the feed.</p>
            <button className="primary" onClick={() => { onClose(); onPostedDone?.() }}>Done</button>
          </>
        ) : (
          <>
            {error && <div className="notice error" style={{ marginBottom: 12 }}>{error}</div>}

            {bout && (
              <button className="secondary" style={{ marginBottom: 10 }} disabled={busy !== null} onClick={() => void shareImage()}>
                <ShareIcon /> {busy === 'image' ? 'Preparing…' : 'Share as image'}
              </button>
            )}

            {memberships !== null && memberships.length > 0 && (
              <>
                {memberships.map((m) => (
                  <button
                    key={m.clubId} className="primary" style={{ marginBottom: 10 }}
                    disabled={busy !== null} onClick={() => void post(m.clubId, m.clubName)}
                  >
                    {busy === m.clubId ? 'Posting…' : `Post to ${m.clubName}`}
                  </button>
                ))}
                <p className="meta" style={{ marginTop: 0 }}>
                  Everyone in the club — athletes and coaches — will see it, with your name. Your notes and
                  target photos are never shared.
                </p>
              </>
            )}
            {memberships !== null && memberships.length === 0 && !bout && (
              <p className="meta">Join a club from your Profile to post workouts to its feed.</p>
            )}

            <button className="secondary" onClick={onClose} disabled={busy !== null}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}
