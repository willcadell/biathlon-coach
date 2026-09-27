import { useState } from 'react'
import { setContribution, type Contribution } from '../lib/contribute'
import { errorMessage } from '../lib/errors'

/** What contributing means, in the same words wherever it's offered. */
function Explanation() {
  return (
    <>
      <p className="meta">
        Help improve automatic hole detection by contributing the targets you score, anonymously. We
        receive a smaller copy of the photo, with camera and location details removed, and the hole
        positions you confirmed. Nothing that says whose it is: no name, account, club or date.
      </p>
      <p className="meta">
        It applies to targets you score from now on. Because it can't be traced back to you, anything
        already contributed can't be withdrawn, though you can stop any time in Settings. Your own
        photos stay private. If you're under 18, check with a parent first.{' '}
        <a href="/privacy" className="link">Privacy Policy</a>
      </p>
    </>
  )
}

/**
 * Asked once, before anything is contributed — the first time an athlete signs
 * in, and once for athletes who were already here. Neither answer is preselected,
 * and "No thanks" is as easy as "Yes".
 */
export function ContributePrompt({ onChosen }: { onChosen: (next: Contribution) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function choose(yes: boolean) {
    setSaving(true)
    setError('')
    try {
      onChosen(await setContribution(yes))
    } catch (e) {
      setError(errorMessage(e, 'Could not save your choice. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2 style={{ marginTop: 0 }}>Help improve hole detection?</h2>
        <Explanation />
        {error && <div className="notice error">{error}</div>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="secondary" disabled={saving} onClick={() => void choose(false)}>No thanks</button>
          <button className="secondary" disabled={saving} onClick={() => void choose(true)}>Yes, contribute</button>
        </div>
      </div>
    </div>
  )
}

/** The same choice, changeable at any time, in Settings. */
export function ContributeCard({
  value, onChange,
}: { value: Contribution | undefined; onChange: (next: Contribution) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function toggle(yes: boolean) {
    setSaving(true)
    setError('')
    try {
      onChange(await setContribution(yes))
    } catch (e) {
      setError(errorMessage(e, 'Could not save your choice. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h2>Help improve hole detection</h2>
      <div className="card">
        <label className="check">
          <input
            type="checkbox"
            checked={value?.choice === true}
            disabled={saving || value === undefined}
            onChange={(e) => void toggle(e.target.checked)}
          />
          Contribute my scored targets, anonymously
        </label>
        <Explanation />
        {error && <div className="notice error">{error}</div>}
      </div>
    </>
  )
}
