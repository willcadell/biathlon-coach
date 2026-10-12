import { useEffect } from 'react'

/**
 * The confirmation after a goal is set: the same drawn check as "Posted" in the
 * share sheet, the goal in words, and where to follow it. It closes itself
 * after a moment (there's nothing left to decide) and can be dismissed sooner
 * with Done, a tap outside it, or Escape.
 */
export function GoalSetNotice({
  title, deadline, hint, onClose,
}: {
  /** The goal as it reads elsewhere, e.g. "Metal hit rate 80% · prone". */
  title: string
  /** "by Oct 31". */
  deadline: string
  /** Where they'll see it. */
  hint: string
  onClose: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [onClose])

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Goal set" onClick={onClose}>
      <div className="modal-card" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div className="posted-check" role="status">
          <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 style={{ margin: '0 0 6px' }}>Goal set</h2>
        <p style={{ margin: '0 0 4px' }}><strong>{title}</strong></p>
        <p className="meta" style={{ margin: '0 0 4px' }}>{deadline}</p>
        <p className="meta" style={{ margin: '0 0 14px' }}>{hint}</p>
        <button className="secondary" autoFocus onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
