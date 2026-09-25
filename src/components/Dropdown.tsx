import { useState, type ReactNode } from 'react'
import { ChevronIcon } from './icons'

/** A sub-heading opened and closed by the same arrow the Analysis sections
 *  use. Starts closed: these hold rarely-used forms (create, join, follow)
 *  that shouldn't crowd a Profile page most visits. */
export function Dropdown({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
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
