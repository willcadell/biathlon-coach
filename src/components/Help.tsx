import { useRef, useState, type ReactNode } from 'react'

/**
 * A small "?" that reveals explanatory copy on tap, instead of it sitting on
 * the page permanently. Reuses the details.help pattern ResultsView already
 * used for one splitter-shot note (see styles.css) — this just makes it a
 * component so the same "?" doesn't get reinvented at every call site.
 *
 * The revealed text floats as an overlay (styles.css positions it absolutely,
 * card-styled like the rest of the app) rather than pushing the page's own
 * layout down. Since the "?" can sit anywhere — right after a short heading,
 * near the edge of a narrow phone — the popover measures itself after
 * opening and nudges back on screen if it would otherwise overflow either
 * edge, rather than assuming a fixed anchor is always safe.
 *
 * Only for text that's genuinely optional context — why a number is what it
 * is, what a setting does. Never for a warning, a consent notice, a legal
 * document, or an error: those stay visible, because hiding them behind a
 * tap would be reducing what someone was actually told, not decluttering.
 */
export function Help({ children }: { children: ReactNode }) {
  const popRef = useRef<HTMLParagraphElement>(null)
  const [shift, setShift] = useState(0)

  return (
    <details
      className="help"
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open) {
          setShift(0)
          return
        }
        // <details> has already applied `open` by the time this fires, so the
        // popover is already laid out at its natural (unshifted) position —
        // reading it here forces a synchronous reflow, no need to wait a frame.
        const pop = popRef.current
        if (!pop) return
        const rect = pop.getBoundingClientRect()
        const margin = 12
        let next = 0
        if (rect.right > window.innerWidth - margin) next = window.innerWidth - margin - rect.right
        if (rect.left + next < margin) next = margin - rect.left
        setShift(next)
      }}
    >
      <summary aria-label="What does this mean?">?</summary>
      <p ref={popRef} style={shift ? { transform: `translateX(${shift}px)` } : undefined}>{children}</p>
    </details>
  )
}
