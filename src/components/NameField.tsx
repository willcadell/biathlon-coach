import { useState } from 'react'
import { errorMessage } from '../lib/errors'
import { CloseIcon, PencilIcon } from './icons'

/**
 * A name that's set once and then sits locked — "Name · Will" with an edit
 * pencil — the way the race format does, instead of an always-open text box
 * that looks unsaved. Edit opens the field with Save and a cancel X; a name that
 * hasn't been set yet opens straight into the field.
 */
export function NameField({
  hint, value, loaded, onSave,
}: {
  hint: string
  value: string
  loaded: boolean
  onSave: (name: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch (e) {
      setError(errorMessage(e, 'Could not save your name. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  if (loaded && value && !editing) {
    return (
      <>
        <div className="row" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
            <span className="meta">Name · </span><strong>{value}</strong>
          </span>
          <button
            className="link" style={{ flex: 'none' }} aria-label="Edit name" title="Edit name"
            onClick={() => { setDraft(value); setError(''); setEditing(true) }}
          >
            <PencilIcon />
          </button>
        </div>
        <div className="meta" style={{ fontSize: 12, marginTop: 4 }}>{hint}</div>
      </>
    )
  }

  const canCancel = Boolean(value)
  return (
    <>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Name<small>{hint}</small></span>
        <div className="row">
          <input
            type="text" style={{ flex: 1 }} value={draft} disabled={!loaded} autoFocus={editing}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim() && !saving) void save() }}
          />
          {canCancel && (
            <button
              className="link" style={{ flex: 'none' }} disabled={saving} aria-label="Cancel" title="Cancel"
              onClick={() => setEditing(false)}
            >
              <CloseIcon />
            </button>
          )}
          <button
            className="secondary" style={{ flex: 'none', width: 'auto' }}
            onClick={() => void save()} disabled={!loaded || saving || draft.trim().length === 0}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </label>
      {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}
    </>
  )
}
