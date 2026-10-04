import { useEffect, useState, type ReactNode } from 'react'
import {
  RCM_URL, UCCMS_URL, acknowledgeResponsibilities, hasAcknowledgedResponsibilities,
} from '../lib/coachResponsibilities'
import { errorMessage } from '../lib/errors'
import { CheckIcon } from './icons'

/**
 * What a coach agrees to before they have any authority over anyone. Leads with
 * the Canadian Safe Sport Program, whose Universal Code of Conduct (UCCMS) is
 * the standard; the rest is what 545 Coach itself asks and enforces.
 */
export function CoachResponsibilities({ onAgreed }: { onAgreed: () => void }) {
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await acknowledgeResponsibilities()
      onAgreed()
    } catch (e) {
      setError(errorMessage(e, 'Could not save that. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h1>Your responsibilities as a coach</h1>
      <p className="lede">
        A coach is in a position of trust and authority, and many athletes are young. Read this and agree
        before you create a club, ask to join one, follow an athlete, or write on an athlete's training.
      </p>

      <div className="card" style={{ borderColor: 'var(--series-1)', borderWidth: 2 }}>
        <h2 style={{ margin: '0 0 6px' }}>Canadian Safe Sport</h2>
        <p style={{ marginBottom: 8 }}>
          Coaching here means following the <strong>Canadian Safe Sport Program</strong> and its{' '}
          <strong>Universal Code of Conduct to Prevent and Address Maltreatment in Sport (UCCMS)</strong>.
          The code prohibits maltreatment in every form, including grooming, neglect, and physical, sexual
          and psychological maltreatment, as well as misuse of power, retaliation, and failing to report.
        </p>
        <p style={{ marginBottom: 8 }}>
          <a href={UCCMS_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--series-1)' }}>Read the UCCMS</a>
        </p>
        <p style={{ marginBottom: 8 }}>
          It also means taking the <strong>Responsible Coaching Movement (RCM) Pledge</strong>, which
          rests on three pillars: the <strong>Rule of Two</strong>, <strong>background screening</strong> and{' '}
          <strong>ethics training</strong>.
        </p>
        <p style={{ margin: 0 }}>
          <a href={RCM_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--series-1)' }}>Take the RCM Pledge</a>
        </p>
      </div>

      <h2>You agree to</h2>
      <ul style={{ margin: '0 0 14px', paddingLeft: 20, color: 'var(--text-secondary)' }}>
        <Item>
          <strong>Meet your organisation's requirements.</strong> Complete the ethics and safe sport training,
          screening and background checks your club, sport organisation or province requires, as the RCM
          Pledge asks. 545 Coach doesn't check these, or who you are.
        </Item>
        <Item>
          <strong>Use what you see only to coach.</strong> Athletes and parents choose to share their
          training with you. Don't copy it, pass it on, or post it elsewhere.
        </Item>
        <Item>
          <strong>Follow the Rule of Two.</strong> Keep every interaction and communication with an athlete open,
          observable and justifiable. Notes and announcements are about training, and other coaches and the
          athlete can read them. Don't use the app to start private, one-to-one contact with an athlete,
          especially a minor.
        </Item>
        <Item>
          <strong>Speak up.</strong> If you see or suspect maltreatment, report it through your
          organisation's process and to the Canadian Safe Sport Program. Don't handle it alone.
        </Item>
        <Item>
          <strong>Accept that access isn't automatic.</strong> Athletes approve personal coaches, club
          admins approve coaches, and either can withdraw your access at any time.
        </Item>
      </ul>

      <label className="check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        I've read this, and I took the RCM Pledge, and I agree to follow the Canadian Safe Sport Program's code of conduct.
      </label>
      {error && <div className="notice error">{error}</div>}
      <button className="primary" disabled={!agreed || saving} onClick={() => void submit()}>
        {saving ? 'Saving…' : 'Agree and continue'}
      </button>
    </>
  )
}

const Item = ({ children }: { children: ReactNode }) => <li style={{ marginBottom: 8 }}>{children}</li>

/**
 * Shows the responsibilities in place of its children until this coach has
 * agreed. `enabled` is false for anyone who hasn't set up a coaching identity,
 * so nothing is asked of an athlete who never coaches.
 */
export function ResponsibilitiesGate({ coachId, enabled, children }: { coachId: string; enabled: boolean; children: ReactNode }) {
  const [agreed, setAgreed] = useState<boolean | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void hasAcknowledgedResponsibilities(coachId)
      .then((a) => { if (!cancelled) setAgreed(a) })
      .catch((e) => { if (!cancelled) setLoadError(errorMessage(e, 'Could not check that. Check your connection and try again.')) })
    return () => { cancelled = true }
  }, [coachId, enabled])

  if (!enabled) return <>{children}</>
  if (loadError) return <div className="notice error">{loadError}</div>
  if (agreed === null) return null
  if (!agreed) return <CoachResponsibilities onAgreed={() => setAgreed(true)} />
  return <>{children}</>
}

/**
 * The line under a coach's name saying they've taken the RCM Pledge, with a
 * link to it. It appears only once they've agreed to the responsibilities,
 * since that agreement is where they confirm it. Says nothing before then.
 */
export function RcmPledgeStatus({ coachId }: { coachId: string }) {
  const [agreed, setAgreed] = useState(false)
  useEffect(() => {
    let cancelled = false
    void hasAcknowledgedResponsibilities(coachId).then((a) => { if (!cancelled) setAgreed(a) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [coachId])

  if (!agreed) return null
  return (
    <p className="meta" style={{ margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--good)', display: 'inline-flex' }}><CheckIcon /></span>
      <span>
        I took the RCM Pledge.{' '}
        <a href={RCM_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--series-1)' }}>RCM Pledge</a>
      </span>
    </p>
  )
}
