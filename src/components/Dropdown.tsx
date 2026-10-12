import { useState, type ReactNode } from 'react'
import { ChevronIcon } from './icons'

/** A Profile section opened and closed by the same arrow the Analysis
 *  sections use. On Profile, what identifies you or shows where you belong
 *  (your name, your clubs, your personal coaches) stays visible, and every
 *  form that does something (create, join, follow, invite, switch, sign out)
 *  sits in one of these, closed, so the page stays short and every section
 *  heading is the same size. `help` is a Help popover for the heading.
 *
 *  Closed by default and looks after its own state, unless `open` and
 *  `onOpenChange` are given: then the parent decides, so it can close one
 *  section and open another (the goal dialogue does this when a goal is set). */
export function Dropdown({
  title, help, open: controlledOpen, onOpenChange, children,
}: {
  title: string
  help?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  const [ownOpen, setOwnOpen] = useState(false)
  const open = controlledOpen ?? ownOpen
  const setOpen = (next: boolean) => { if (controlledOpen === undefined) setOwnOpen(next); onOpenChange?.(next) }
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '24px 0 0' }}>
        <h2 style={{ margin: 0 }}>{title}{help}</h2>
        <button
          className="link"
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronIcon direction={open ? 'up' : 'down'} />
        </button>
      </div>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </>
  )
}
