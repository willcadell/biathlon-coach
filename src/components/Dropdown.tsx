import { useState, type ReactNode } from 'react'
import { ChevronIcon } from './icons'

/** A sub-heading opened and closed by the same arrow the Analysis sections
 *  use. Starts closed: these hold rarely-used forms (create, join, follow)
 *  that shouldn't crowd a Profile page most visits. `level` 2 makes it a
 *  top-level Profile section (Session, Account) instead of a sub-heading. */
export function Dropdown({ title, level = 3, children }: { title: string; level?: 2 | 3; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: level === 2 ? '24px 0 0' : '16px 0 0' }}>
        <Heading style={{ margin: 0 }}>{title}</Heading>
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
