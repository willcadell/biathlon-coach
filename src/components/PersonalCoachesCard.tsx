import { useEffect, useState } from 'react'
import {
  cancelPersonalInvite, createPersonalInvite, currentPersonalInvite, myPersonalCoaches, removePersonalCoach,
  type PersonalCoach, type PersonalInvite,
} from '../lib/personalCoach'
import { errorMessage } from '../lib/errors'
import { TrashIcon } from './icons'

const mono = { fontFamily: 'var(--mono, monospace)', letterSpacing: '0.08em' } as const

const daysLeft = (iso: string) => Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))

/**
 * The athlete's side of personal coaching. A personal coach is one person who
 * follows one athlete — a parent, or a coach outside their club — and it
 * always starts here: the athlete makes an invite and hands the code over.
 */
export function PersonalCoachesCard() {
  const [coaches, setCoaches] = useState<PersonalCoach[] | null>(null)
  const [invite, setInvite] = useState<PersonalInvite | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void Promise.all([myPersonalCoaches(), currentPersonalInvite()])
      .then(([c, i]) => { if (!cancelled) { setCoaches(c); setInvite(i) } })
      .catch((e) => { if (!cancelled) setError(errorMessage(e, 'Could not load your personal coaches. Check your connection and try again.')) })
    return () => { cancelled = true }
  }, [])

  async function makeInvite() {
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      setInvite(await createPersonalInvite())
    } catch (e) {
      setError(errorMessage(e, 'Could not create an invite. Check your connection and try again.'))
    } finally {
      setBusy(false)
    }
  }

  async function cancelInvite() {
    setError('')
    try {
      await cancelPersonalInvite()
      setInvite(null)
    } catch (e) {
      setError(errorMessage(e, 'Could not cancel the invite. Check your connection and try again.'))
    }
  }

  async function remove(c: PersonalCoach) {
    const who = c.displayName || 'this coach'
    if (!confirm(
      `Remove ${who} as a personal coach?\n\nThey'll stop seeing your sessions, analysis and posts straight away. ` +
      `You can invite them again later.`,
    )) return
    setError('')
    try {
      await removePersonalCoach(c.coachId)
      setCoaches((prev) => (prev ?? []).filter((x) => x.coachId !== c.coachId))
    } catch (e) {
      setError(errorMessage(e, 'Could not remove that coach. Check your connection and try again.'))
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Selecting the code by hand still works.
    }
  }

  return (
    <>
      <h2>Personal coaches</h2>
      <div className="card">
        <p className="meta" style={{ marginTop: 0 }}>
          A personal coach is one person who follows you — a parent, or a coach outside your club. They
          can see your sessions, analysis and posts, and announcements from your club's coaches. They
          can't see the rest of your club's feed, or your target photos. You choose who, and you can
          remove them at any time.
        </p>

        {error && <div className="notice error">{error}</div>}

        {(coaches ?? []).map((c) => (
          <div key={c.coachId} className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
            <span style={{ flex: 1, minWidth: 0 }}>{c.displayName || 'Unnamed coach'}</span>
            <button
              className="link danger" style={{ flex: 'none' }}
              aria-label={`Remove ${c.displayName || 'this coach'} as a personal coach`} title="Remove personal coach"
              onClick={() => void remove(c)}
            >
              <TrashIcon />
            </button>
          </div>
        ))}

        {invite ? (
          <div style={{ marginTop: coaches && coaches.length > 0 ? 12 : 0 }}>
            <p style={{ margin: '0 0 6px' }}>Give this code to your personal coach:</p>
            <div className="row" style={{ alignItems: 'center', gap: 10 }}>
              <strong style={{ ...mono, fontSize: 22, flex: 'none' }}>{invite.code}</strong>
              <button className="link" style={{ flex: 'none' }} onClick={() => void copy(invite.code)}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <span style={{ flex: 1 }} />
              <button
                className="link danger" style={{ flex: 'none' }}
                aria-label="Cancel this invite" title="Cancel this invite" onClick={() => void cancelInvite()}
              >
                <TrashIcon />
              </button>
            </div>
            <p className="meta" style={{ margin: '6px 0 0' }}>
              They enter it in the Coach tab of their own account. It works once, and expires in{' '}
              {daysLeft(invite.expiresAt)} day{daysLeft(invite.expiresAt) === 1 ? '' : 's'}.{' '}
              <button className="link" disabled={busy} onClick={() => void makeInvite()}>Make a new code</button>
            </p>
          </div>
        ) : (
          <button
            className="secondary" style={{ marginTop: coaches && coaches.length > 0 ? 12 : 0 }}
            disabled={busy || coaches === null} onClick={() => void makeInvite()}
          >
            {busy ? 'Creating…' : 'Invite a personal coach'}
          </button>
        )}
      </div>
    </>
  )
}
