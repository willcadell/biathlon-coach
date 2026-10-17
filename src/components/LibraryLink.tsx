import { BookOpenIcon } from './icons'

/** The IBU's own journal of coaching articles (shooting among them), which the
 *  advice in this app draws on. */
export const IBU_LIBRARY_URL = 'https://www.ibuacademy.com/science/journal'

/** An open book that opens the IBU library in a new tab. Sits beside a page title. */
export function LibraryLink() {
  return (
    <a
      href={IBU_LIBRARY_URL} target="_blank" rel="noopener noreferrer"
      aria-label="IBU library of coaching articles (opens in a new tab)"
      title="IBU library of coaching articles"
      // Set up like the Profile cog's button (inline-block, inherited font), so the two
      // icons sit at exactly the same height beside their titles.
      style={{ color: 'var(--text-secondary)', display: 'inline-block', font: 'inherit', textDecoration: 'none', flex: 'none', padding: 0 }}
    >
      <BookOpenIcon size={22} />
    </a>
  )
}

/** A page title with the library link at its right. */
export function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    // Laid out like the Profile title and its cog: the h1 has no margin of its own
    // here, so the icon centres on the text; the 4px it normally has sits on the row.
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
      <h1 style={{ margin: 0 }}>{children}</h1>
      <LibraryLink />
    </div>
  )
}
