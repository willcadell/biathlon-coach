import { useState } from 'react'
import type { TemplateRun, TemplateStep, WorkoutTemplate } from '../lib/types'
import { MAX_TEMPLATE_STEPS, stepLabel, stepsDone, stepsFromEntries, summariseSteps, type ShotLike } from '../lib/templates'
import { errorMessage } from '../lib/errors'
import { GoArrow, TrashIcon, TrophyIcon } from './icons'

/**
 * What an empty range session offers first: start from a blank page, or follow
 * a template. The National Team test is the built-in template; the rest are the
 * athlete's own, saved from sessions they have shot.
 */
export function WorkoutChooser({
  templates, onNew, onNationalTest, onTemplate, onDelete, error,
}: {
  templates: WorkoutTemplate[]
  onNew: () => void
  /** Absent when the National Team test cannot be started from here. */
  onNationalTest?: () => void
  onTemplate: (template: WorkoutTemplate) => void
  onDelete?: (template: WorkoutTemplate) => void
  error?: string
}) {
  const [picking, setPicking] = useState(false)

  if (!picking) {
    return (
      <div className="card">
        <p className="meta" style={{ marginTop: 0 }}>How do you want to shoot this session?</p>
        <div className="row">
          <button className="primary" onClick={onNew}>Start a new workout</button>
          <button className="primary" onClick={() => setPicking(true)}>Start from a template</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ flex: 1 }}>Choose a template</strong>
        <button className="link" style={{ flex: 'none' }} onClick={() => setPicking(false)}>Back</button>
      </div>
      {error && <div className="notice error">{error}</div>}
      {onNationalTest && (
        <button className="boutrow" onClick={onNationalTest}>
          <div className="grow">
            <div className="title"><TrophyIcon size={18} /> National Team test<GoArrow /></div>
            <div className="meta">Guided and scored out of 600: two precision groups, then the timed 4x5 and 10x1 drills.</div>
          </div>
        </button>
      )}
      {templates.map((t) => (
        <div key={t.id} className="boutrow" style={{ cursor: 'default' }}>
          <button className="grow link" style={{ textAlign: 'left' }} onClick={() => onTemplate(t)}>
            <div className="title">{t.name}<GoArrow /></div>
            <div className="meta">{t.steps.length} step{t.steps.length === 1 ? '' : 's'} · {summariseSteps(t.steps)}</div>
          </button>
          {onDelete && (
            <button
              className="link danger" style={{ flex: 'none' }} aria-label={`Delete ${t.name}`} title="Delete this template"
              onClick={() => { if (confirm(`Delete the template "${t.name}"? Sessions already shot from it are not changed.`)) onDelete(t) }}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      ))}
      {templates.length === 0 && (
        <p className="meta" style={{ marginBottom: 0 }}>
          Your own templates will be here. Finish a session and you can save it as one.
        </p>
      )}
    </div>
  )
}

/** The steps of the template a session is following: done ones ticked, the next
 *  one a button that opens that bout with its position already set. */
export function TemplateRunSteps({
  run, entries, onShoot,
}: {
  run: TemplateRun
  entries: ShotLike[]
  onShoot: (step: TemplateStep, index: number) => void
}) {
  const done = stepsDone(run.steps, entries)
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <strong>{run.name}</strong>
      <p className="meta" style={{ margin: '2px 0 8px' }}>
        {done >= run.steps.length ? 'Every step shot.' : `Step ${done + 1} of ${run.steps.length}`}
      </p>
      {run.steps.map((step, i) => {
        const label = `${i + 1}. ${stepLabel(step)}`
        if (i < done) {
          return <div key={i} className="meta" style={{ padding: '4px 0' }}>✓ {label}</div>
        }
        if (i === done) {
          return (
            <button key={i} className="primary" style={{ width: '100%', margin: '4px 0' }} onClick={() => onShoot(step, i)}>
              {label} — shoot it
            </button>
          )
        }
        return <div key={i} className="meta" style={{ padding: '4px 0', opacity: 0.6 }}>{label}</div>
      })}
    </div>
  )
}

/** Offered when a free-form session is finished: keep its shape as a template. */
export function SaveTemplateCard({
  entries, defaultName, onSave,
}: {
  entries: ShotLike[]
  defaultName: string
  onSave: (name: string, steps: TemplateStep[]) => Promise<void>
}) {
  const [name, setName] = useState(defaultName)
  const [state, setState] = useState<'ask' | 'saving' | 'saved'>('ask')
  const [error, setError] = useState('')
  const steps = stepsFromEntries(entries)

  if (state === 'saved') {
    return <p className="meta">Saved as a template. Find it under “Start from a template”.</p>
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Give the template a name.'); return }
    setError('')
    setState('saving')
    try {
      await onSave(trimmed.slice(0, 80), steps)
      setState('saved')
    } catch (e) {
      setError(errorMessage(e, 'Could not save the template. Check your connection and try again.'))
      setState('ask')
    }
  }

  return (
    <div className="card" style={{ width: '100%', maxWidth: 320, textAlign: 'left', marginBottom: 12 }}>
      <strong>Save this workout as a template?</strong>
      <p className="meta" style={{ margin: '4px 0 8px' }}>
        {summariseSteps(steps)}
        {entries.length > MAX_TEMPLATE_STEPS && ` (the first ${MAX_TEMPLATE_STEPS} bouts)`}
      </p>
      {error && <div className="notice error">{error}</div>}
      <input
        type="text" maxLength={80} placeholder="Name, e.g. Tuesday prone and standing"
        value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name"
      />
      <button className="secondary" style={{ width: '100%', marginTop: 8 }} disabled={state === 'saving'} onClick={() => void save()}>
        {state === 'saving' ? 'Saving…' : 'Save as template'}
      </button>
    </div>
  )
}
