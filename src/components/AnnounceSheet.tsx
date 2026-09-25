import { useState } from 'react'
import { ANNOUNCEMENT_MAX, postAnnouncement } from '../lib/feed'
import { errorMessage } from '../lib/errors'

/**
 * A coach's text announcement to one club's feed. It appears there like any
 * other post — the club's athletes and coaches see it and can ring a cowbell
 * for it — and any coach at the club can take it down again.
 */
export function AnnounceSheet({
  club, onClose, onPosted,
}: {
  club: { id: string; name: string }
  onClose: () => void
  /** Called as the sheet closes after a successful post, so the page behind
   *  can acknowledge it too. */
  onPosted?: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const trimmed = text.trim()

  async function post() {
    setBusy(true)
    setError('')
    try {
      await postAnnouncement(club.id, trimmed)
      // No second "posted" screen: closing is the confirmation, and the
      // page behind shakes its megaphone in acknowledgement.
      onClose()
      onPosted?.()
    } catch (e) {
      setError(errorMessage(e, 'Could not post the announcement. Check your connection and try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Announce to ${club.name}`}>
      <div className="modal-card">
        <h2 style={{ marginTop: 0 }}>Announce to {club.name}</h2>
        {error && <div className="notice error" style={{ marginBottom: 12 }}>{error}</div>}
        <label className="field" style={{ marginBottom: 6 }}>
          <span>Announcement<small>Shown to every athlete and coach in the club.</small></span>
          <textarea
            autoFocus rows={5} maxLength={ANNOUNCEMENT_MAX} value={text}
            placeholder="e.g. Range closed Saturday — bring your own targets."
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="meta" style={{ textAlign: 'right', margin: '0 0 12px', fontVariantNumeric: 'tabular-nums' }}>
          {text.length}/{ANNOUNCEMENT_MAX}
        </p>
        <div className="row">
          <button className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={() => void post()} disabled={busy || trimmed.length === 0}>
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
