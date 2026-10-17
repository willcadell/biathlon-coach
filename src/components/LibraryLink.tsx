import { createContext, useContext } from 'react'
import type { FindingId } from '../lib/types'
import { BookOpenIcon } from './icons'

/** The IBU's own journal of coaching articles, which the in-app library draws on. */
export const IBU_LIBRARY_URL = 'https://www.ibuacademy.com/science/journal'

/** What the library was opened about: an advice finding, to show its entries. */
export interface LibraryAbout { findingId: FindingId; title: string }

/** Set by the app to open the in-app library. Without it (outside the signed-in
 *  app) the links fall back to the IBU's own journal page. */
const OpenLibraryContext = createContext<((about?: LibraryAbout) => void) | null>(null)
export const OpenLibraryProvider = OpenLibraryContext.Provider
export const useOpenLibrary = () => useContext(OpenLibraryContext)

/** An open book that opens the shooting library. Sits beside a page title. */
export function LibraryLink() {
  const open = useOpenLibrary()
  return (
    <a
      href={open ? '#library' : IBU_LIBRARY_URL}
      {...(open ? { onClick: (e: React.MouseEvent) => { e.preventDefault(); open() } } : { target: '_blank', rel: 'noopener noreferrer' })}
      aria-label={open ? 'Shooting library' : 'IBU library of coaching articles (opens in a new tab)'}
      title={open ? 'Shooting library' : 'IBU library of coaching articles'}
      // Set up like the Profile cog's button (inline-block, inherited font), so the two
      // icons sit at exactly the same height beside their titles.
      style={{ color: 'var(--text-secondary)', display: 'inline-block', font: 'inherit', textDecoration: 'none', flex: 'none', padding: 0 }}
    >
      <BookOpenIcon size={22} />
    </a>
  )
}

/** A page title with the library link at its right. */
export function PageTitle({ children, marginBottom = 4 }: { children: React.ReactNode; marginBottom?: number }) {
  return (
    // Laid out like the Profile title and its cog: the h1 has no margin of its own
    // here, so the icon centres on the text; the 4px it normally has sits on the row.
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom }}>
      <h1 style={{ margin: 0 }}>{children}</h1>
      <LibraryLink />
    </div>
  )
}
