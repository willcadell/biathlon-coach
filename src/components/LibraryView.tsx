import { useMemo, useState } from 'react'
import {
  ENTRIES, EVIDENCE_LABEL, FOCUS_LABEL, SOURCES, entriesForFinding, formatReference, shortCitation, sourceById,
  type Focus, type LibraryEntry,
} from '../lib/library'
import { SEASON_PHASE_LABEL, seasonPhase, type SeasonPhase } from '../lib/seasonPhase'
import { AppMark } from './icons'
import { IBU_LIBRARY_URL, type LibraryAbout } from './LibraryLink'

const PHASE_ORDER: SeasonPhase[] = ['transition', 'general', 'specific', 'early', 'competition']

const CHIP: React.CSSProperties = { padding: '4px 10px', fontSize: 11, borderRadius: 6, flex: 'none' }

function Chips<T extends string>({
  label, options, value, onChange,
}: {
  label: string
  options: { id: T; text: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="group" aria-label={label} style={{ flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)} style={CHIP}>
          {o.text}
        </button>
      ))}
    </div>
  )
}

function EntryCard({ e, onCite }: { e: LibraryEntry; onCite: (sourceId: string) => void }) {
  return (
    <article className="card" aria-labelledby={`lib-${e.id}`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        <span className="pill">{FOCUS_LABEL[e.focus]}</span>
        {e.position !== 'both' && <span className="pill" style={{ textTransform: 'capitalize' }}>{e.position}</span>}
        <span className="pill">{EVIDENCE_LABEL[e.evidence]}</span>
      </div>
      <h3 id={`lib-${e.id}`}>{e.title}</h3>
      <p>{e.summary}</p>
      {e.doThis && e.doThis.length > 0 && (
        <details>
          <summary>What to do</summary>
          <ol className="steps">
            {e.doThis.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </details>
      )}
      {e.safety && <p className="meta" style={{ marginTop: 8 }}><strong>Safety:</strong> {e.safety}</p>}
      {e.coachNote && <p className="meta" style={{ marginTop: 8 }}><strong>For coaches:</strong> {e.coachNote}</p>}
      <p className="meta" style={{ marginTop: 8, marginBottom: 0 }}>
        Season: {e.phases.map((p) => SEASON_PHASE_LABEL[p]).join(', ')}.
        {' '}Source:{' '}
        {e.sources.map((s, i) => {
          const src = sourceById(s.id)
          if (!src) return null
          return (
            <span key={s.id}>
              {i > 0 && '; '}
              {/* The citation stays in the app: it jumps to the full reference below.
                  Leaving for the IBU's page is a separate, deliberate step there. */}
              <a
                href={`#src-${src.id}`}
                onClick={(ev) => { ev.preventDefault(); onCite(src.id) }}
                style={{ color: 'var(--series-1)', textDecoration: 'underline' }}
              >
                {shortCitation(src)}
              </a>
              {s.where && `, ${s.where}`}
            </span>
          )
        })}.
      </p>
    </article>
  )
}

/**
 * The shooting library: advice drawn from the IBU's publications, in our words,
 * by the time of year and by what is being worked on. Every entry names its
 * sources, and the full references are listed at the end.
 */
export function LibraryView({
  onBack, about, onShowAll,
}: {
  onBack: () => void
  /** Opened from an advice finding: show the entries that answer it. */
  about?: LibraryAbout
  onShowAll?: () => void
}) {
  const [cited, setCited] = useState<string | null>(null)
  const cite = (sourceId: string) => {
    setCited(sourceId)
    document.getElementById(`src-${sourceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const related = about ? entriesForFinding(about.findingId) : []
  const now = seasonPhase(new Date())
  const [phase, setPhase] = useState<SeasonPhase | 'all'>(now)
  const [focus, setFocus] = useState<Focus | 'all'>('all')

  const presentFocus = useMemo(
    () => (Object.keys(FOCUS_LABEL) as Focus[]).filter((f) => ENTRIES.some((e) => e.focus === f)),
    [],
  )
  const shown = useMemo(
    () => ENTRIES.filter((e) => (phase === 'all' || e.phases.includes(phase)) && (focus === 'all' || e.focus === focus)),
    [phase, focus],
  )

  return (
    <>
      <button className="link" onClick={onBack}>← Back</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <AppMark size={26} />
        <h1 style={{ margin: 0 }}>Library</h1>
      </div>
      <p className="lede" style={{ marginTop: 8 }}>
        Shooting advice from the IBU’s own publications, set out by the time of year and by what you are working on.
        Each entry is a summary in our words and names its source; the full references are at the end.
      </p>

      <Chips
        label="Time of year"
        value={phase}
        onChange={setPhase}
        options={[
          ...PHASE_ORDER.map((p) => ({ id: p as SeasonPhase | 'all', text: p === now ? `${SEASON_PHASE_LABEL[p]} (now)` : SEASON_PHASE_LABEL[p] })),
          { id: 'all', text: 'All year' },
        ]}
      />
      <div style={{ height: 8 }} />
      <Chips
        label="Topic"
        value={focus}
        onChange={setFocus}
        options={[{ id: 'all' as Focus | 'all', text: 'All topics' }, ...presentFocus.map((f) => ({ id: f as Focus | 'all', text: FOCUS_LABEL[f] }))]}
      />

      {about && related.length > 0 ? (
        <>
          <div className="notice" style={{ margin: '14px 0 8px' }}>
            Showing what the library says about <strong>{about.title}</strong>.{' '}
            <button className="link" onClick={onShowAll}>Show the whole library</button>
          </div>
          {related.map((e) => <EntryCard key={e.id} e={e} onCite={cite} />)}
        </>
      ) : (
        <>
          <p className="meta" style={{ margin: '14px 0 8px' }}>
            {shown.length} {shown.length === 1 ? 'entry' : 'entries'}
            {phase !== 'all' && ` for ${SEASON_PHASE_LABEL[phase].toLowerCase()}`}
            {focus !== 'all' && `, ${FOCUS_LABEL[focus].toLowerCase()}`}.
          </p>
          {shown.length === 0 && (
            <div className="card"><p style={{ margin: 0 }}>Nothing here for that combination. Try another topic or all year.</p></div>
          )}
          {shown.map((e) => <EntryCard key={e.id} e={e} onCite={cite} />)}
        </>
      )}

      <h2>Sources</h2>
      <p className="meta">
        Every entry above is drawn from these. They are the IBU’s <em>Journal of Biathlon Coaching</em> and its exercise
        catalogue; open them to read the originals in full.
      </p>
      <ol style={{ paddingLeft: 20, margin: '0 0 12px' }}>
        {SOURCES.map((s) => (
          <li
            key={s.id} id={`src-${s.id}`}
            style={{
              marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)', scrollMarginTop: 80,
              ...(cited === s.id ? { background: 'var(--grid)', borderRadius: 6, padding: '4px 6px', marginLeft: -6 } : {}),
            }}
          >
            {formatReference(s)}{s.doi ? ` DOI 10.71006/${s.doi}.` : ''}{' '}
            <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--series-1)', textDecoration: 'underline' }}>
              Read the original at the IBU ↗
            </a>
          </li>
        ))}
      </ol>
      <p className="meta">
        This library is a summary prepared by 545 Coach, not the IBU’s text, and the IBU has not reviewed or endorsed it.
        It is general training advice, not a substitute for a coach watching you shoot.{' '}
        <a href={IBU_LIBRARY_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--series-1)', textDecoration: 'underline' }}>
          Browse the IBU’s Journal of Biathlon Coaching
        </a>.
      </p>
    </>
  )
}
