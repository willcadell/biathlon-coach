export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M12 15V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M4 7h16" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

const SHIELD = 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z'

/** Admin rights: a shield, plus to grant them, minus to take them back. */
export function ShieldPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d={SHIELD} />
      <path d="M12 9v5M9.5 11.5h5" />
    </svg>
  )
}

export function ShieldMinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d={SHIELD} />
      <path d="M9.5 11.5h5" />
    </svg>
  )
}

/** Solid shield with a person cut out of it — a filled glyph stays legible at
 *  tag size where an outline shield doesn't. */
function AdminShield({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" width={size} height={size} aria-hidden="true">
      <path d="M12 2.5l8 3.2v5.6c0 4.8-3.3 8.6-8 10.2-4.7-1.6-8-5.4-8-10.2V5.7z M12 6.9a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z M7.3 17.2c.6-2.4 2.5-3.6 4.7-3.6s4.1 1.2 4.7 3.6z" />
    </svg>
  )
}

/** The "Admin" tag: the shield in front of the word, tinted so it stands
 *  apart from the plain grey pills. */
export function AdminPill({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      className="pill"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'color-mix(in srgb, var(--series-1) 14%, transparent)', color: 'var(--series-1)',
        ...style,
      }}
    >
      <AdminShield size={13} />
      Admin
    </span>
  )
}

/** The "this opens something" cue in a list row: a blue right arrow straight
 *  after the words, in the same style as the back arrow, rather than a small
 *  grey chevron at the far edge. */
export function GoArrow() {
  return <span aria-hidden="true" style={{ color: 'var(--series-1)', marginLeft: 6 }}>→</span>
}

/** A cowbell: handle, flared body, the rim, and the clapper. Filled once
 *  you've rung it. */
export function CowbellIcon({ filled = false, size = 20 }: { filled?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M10 6.5V5a2 2 0 0 1 4 0v1.5" />
      <path d="M8.6 6.5h6.8l3.1 11H5.5z" fill={filled ? 'currentColor' : 'none'} />
      <path d="M5 17.5h14" />
      <circle cx="12" cy="20.4" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Announce to the club: a megaphone. */
export function MegaphoneIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M3 11v2a1 1 0 0 0 1 1h2l8 4V6L6 10H4a1 1 0 0 0-1 1z" />
      <path d="M6.5 14l1.2 4.5h2.2L9 15.5" />
      <path d="M17.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  )
}

/** The 545 Coach mark — the two rings and centre dot used for the coach tab —
 *  standing for "this came from a coach". */
export function CoachMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  )
}
