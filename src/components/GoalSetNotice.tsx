import { useEffect } from 'react'

/**
 * The confirmation after a goal is set: the same drawn check as "Posted" in the
 * share sheet, the goal in words, and two choices. "Set another goal" goes
 * straight back to a fresh form; "Done" closes the form and shows the list.
 * Because there's a choice to make it doesn't close itself; a tap outside it
 * or Escape counts as Done.
 */
export function GoalSetNotice({
  title, deadline, hint, doneLabel = 'Done', onAnother, onDone,
}: {
  /** The goal as it reads elsewhere, e.g. "Metal hit rate 80% · prone". */
  title: string
  /** "by Oct 31". */
  deadline: string
  /** Where they'll see it. */
  hint: string
  doneLabel?: string
  onAnother: () => void
  onDone: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Goal set" onClick={onDone}>
      <div className="modal-card" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div className="posted-check" role="status">
          <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 style={{ margin: '0 0 6px' }}>Goal set</h2>
        <p style={{ margin: '0 0 4px' }}><strong>{title}</strong></p>
        <p className="meta" style={{ margin: '0 0 4px' }}>{deadline}</p>
        <p className="meta" style={{ margin: '0 0 14px' }}>{hint}</p>
        <div className="row">
          <button className="secondary" onClick={onAnother}>Set another goal</button>
          <button className="primary" autoFocus onClick={onDone}>{doneLabel}</button>
        </div>
      </div>
    </div>
  )
}
