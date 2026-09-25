import { useState, type ReactNode } from 'react'
import { ChevronIcon } from './icons'

/** A Profile section opened and closed by the same arrow the Analysis
 *  sections use. On Profile, what identifies you or shows where you belong
 *  (your name, your clubs, your personal coaches) stays visible, and every
 *  form that does something (create, join, follow, invite, switch, sign out)
 *  sits in one of these, closed, so the page stays short and every section
 *  heading is the same size. */
export function Dropdown({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '24px 0 0' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button
          className="link"
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronIcon direction={open ? 'up' : 'down'} />
        </button>
      </div>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </>
  )
}
