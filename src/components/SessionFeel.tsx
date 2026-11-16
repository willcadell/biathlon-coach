import { useState } from 'react'
import { BOUT_TAGS, CHECKIN_ROWS } from '../lib/sessionFeel'
import type { BoutTag, Checkin, FeelRating } from '../lib/types'

/**
 * "How did that feel?" on the Session logged screen: energy, head and hold, one tap
 * each on a three-point scale, any row skippable, and one Skip for the lot. Each tap
 * saves straight away, so leaving the screen half-way keeps what was answered.
 */
export function CheckinCard({ value, onChange }: { value: Checkin | null | undefined; onChange: (next: Checkin) => void }) {
  const [skipped, setSkipped] = useState(false)
  if (skipped) return null
  const current = value ?? {}
  const done = CHECKIN_ROWS.every((r) => current[r.id])

  return (
    <section className="card checkin" aria-labelledby="checkin-title">
      <div className="checkin__head">
        <h3 id="checkin-title" style={{ margin: 0 }}>How did that feel?</h3>
        <button type="button" className="link" onClick={() => setSkipped(true)}>{done ? 'Done' : 'Skip'}</button>
      </div>
      {CHECKIN_ROWS.map((row) => (
        <div key={row.id} className="checkin__row">
          <span className="checkin__label">{row.label}</span>
          <div className="seg checkin__seg" role="group" aria-label={row.label}>
            {row.options.map((text, i) => {
              const rating = (i + 1) as FeelRating
              return (
                <button
                  key={text} type="button" aria-pressed={current[row.id] === rating}
                  onClick={() => onChange({ ...current, [row.id]: current[row.id] === rating ? undefined : rating })}
                >
                  {text}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <p className="meta" style={{ margin: '8px 0 0' }}>
        Over time this helps tell a tired-day pattern from a technique one.
      </p>
    </section>
  )
}

/** Optional chips for what the athlete noticed on a bout. Any number, or none. */
export function BoutTagPicker({ value, onChange }: { value: BoutTag[]; onChange: (next: BoutTag[]) => void }) {
  const toggle = (id: BoutTag) => onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id])
  return (
    <div className="field">
      <span>Anything you noticed?<small>Optional. Tap any that fit this bout.</small></span>
      <div className="bout-tags" role="group" aria-label="What you noticed on this bout">
        {BOUT_TAGS.map((t) => (
          <button key={t.id} type="button" aria-pressed={value.includes(t.id)} onClick={() => toggle(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
