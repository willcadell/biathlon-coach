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
      style={{ color: 'var(--text-secondary)', display: 'inline-flex', flex: 'none', padding: 4 }}
    >
      <BookOpenIcon size={24} />
    </a>
  )
}

/** A page title with the library link at its right. */
export function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <h1>{children}</h1>
      <LibraryLink />
    </div>
  )
}
