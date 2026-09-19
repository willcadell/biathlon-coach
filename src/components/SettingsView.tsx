import { useState } from 'react'
import type { Settings } from '../lib/types'
import { faceById, TARGET_FACES } from '../lib/types'
import { ringRadii } from '../lib/scoring'
import { COST_PER_IMAGE, testApiKey, type KeyCheck } from '../lib/vision'
import { clearImages, exportAll } from '../lib/db'
import { DRILLS } from '../lib/training'

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  boutCount: number
  onDataChanged: () => void
  onBack: () => void
}

export function SettingsView({ settings, onChange, boutCount, onDataChanged, onBack }: Props) {
  const [check, setCheck] = useState<KeyCheck | null>(null)
  const [checking, setChecking] = useState(false)

  async function runKeyTest() {
    setChecking(true)
    setCheck(null)
    try {
      setCheck(await testApiKey(settings))
    } finally {
      setChecking(false)
    }
  }
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value })

  async function download() {
    const json = await exportAll()
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `biathlon-coach-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const calibration = DRILLS.find((d) => d.id === 'click-calibration')
  const face = faceById(settings.targetFaceId)

  return (
    <>
      <button className="link" onClick={onBack}>← Profile</button>
      <h1 style={{ marginTop: 10 }}>Settings</h1>

      <h2>Your target</h2>
      <div className="card">
        <label className="field">
          <span>Face<small>Sets the scoring rings and the ruler everything is measured against.</small></span>
          <div className="seg">
            {TARGET_FACES.map((f) => (
              <button
                key={f.id}
                aria-pressed={settings.targetFaceId === f.id}
                onClick={() =>
                  // The black diameter is the ruler, so it moves with the face.
                  // Leaving a stale value here would rescale every measurement.
                  onChange({ ...settings, targetFaceId: f.id, aimingMarkMm: f.blackMm })
                }
              >
                {f.name}
              </button>
            ))}
          </div>
          <small style={{ display: 'block', marginTop: 6, color: 'var(--text-muted)' }}>
            {face.note} Ten ring {face.tenRingMm} mm, rings every {face.ringSpacingMm} mm,
            one ring {(ringRadii(face).at(-1) ?? 0) * 2} mm across.
          </small>
        </label>

        <label className="field">
          <span>
            Black diameter
            <small>
              The solid black on the paper, in millimetres. Change this only if you shoot the face
              printed at a reduced size for short range.
            </small>
          </span>
          <input
            type="number" step="0.1" min="5" inputMode="decimal"
            value={settings.aimingMarkMm}
            onChange={(e) => set('aimingMarkMm', Number(e.target.value) || face.blackMm)}
          />
          {Math.abs(settings.aimingMarkMm - face.blackMm) > 0.05 && (
            <small style={{ display: 'block', marginTop: 6, color: 'var(--warning)' }}>
              Scaled to {((settings.aimingMarkMm / face.blackMm) * 100).toFixed(0)}% of the standard
              {' '}{face.blackMm} mm face. Every distance is scaled to match.
            </small>
          )}
        </label>

        <label className="field" style={{ marginBottom: 0 }}>
          <span>
            Bullet diameter
            <small>
              How much of a ring line a hole can break. 5.6 mm for .22 Long Rifle, 4.5 mm for air.
            </small>
          </span>
          <input
            type="number" step="0.1" min="1" inputMode="decimal"
            value={settings.bulletDiameterMm}
            onChange={(e) => set('bulletDiameterMm', Number(e.target.value) || 5.6)}
          />
        </label>
      </div>

      <h2>Your rifle</h2>
      <div className="card">
        <label className="field">
          <span>
            Sight click value
            <small>Millimetres the impact moves at 50 m for one click. Every correction depends on this.</small>
          </span>
          <input
            type="number" step="0.1" min="0.1" inputMode="decimal"
            value={settings.mmPerClick}
            onChange={(e) => set('mmPerClick', Number(e.target.value) || 0.1)}
          />
        </label>
        <div className="notice">
          <strong>The default is a guess.</strong> Biathlon diopter sights differ, so measure yours
          once and the numbers this app gives you become exact.
          {calibration && (
            <details style={{ marginTop: 8 }}>
              <summary>How to measure it</summary>
              <ol className="steps">
                {calibration.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </details>
          )}
        </div>

        <label className="field" style={{ marginBottom: 0 }}>
          <span>Handedness<small>So a low-left group is read as the right fault.</small></span>
          <div className="seg">
            {(['right', 'left'] as const).map((h) => (
              <button key={h} aria-pressed={settings.handedness === h} onClick={() => set('handedness', h)}>
                {h === 'right' ? 'Right-handed' : 'Left-handed'}
              </button>
            ))}
          </div>
        </label>
      </div>

      <h2>Reading photos</h2>
      <div className="card">
        <label className="field">
          <span>
            Anthropic API key
            <small>Optional. Without it you mark shots by hand and everything else still works.</small>
          </span>
          <input
            type="password" placeholder="sk-ant-…" autoComplete="off" spellCheck={false}
            value={settings.apiKey}
            onChange={(e) => {
              setCheck(null)
              // Strip every space and line break, not just the ends. Copying a
              // key out of a terminal or a wrapped file brings them along.
              set('apiKey', e.target.value.replace(/\s+/g, ''))
            }}
          />
          {settings.apiKey && (
            <small style={{ display: 'block', marginTop: 6, color: 'var(--text-muted)' }}>
              {settings.apiKey.length} characters, ending {settings.apiKey.slice(-4)}
            </small>
          )}
        </label>

        <button className="secondary" onClick={runKeyTest} disabled={checking || !settings.apiKey}>
          {checking ? 'Testing…' : 'Test this key'}
        </button>

        {check && (
          <div className={`notice ${check.ok ? '' : 'error'}`} style={{ marginTop: 10 }}>
            <strong>{check.ok ? 'Working' : 'Not working'}</strong> — {check.message}
            {check.fix && <div style={{ marginTop: 6 }}>{check.fix}</div>}
          </div>
        )}

        <label className="field">
          <span>Model</span>
          <div className="seg">
            {(['claude-opus-5', 'claude-sonnet-5'] as const).map((m) => (
              <button key={m} aria-pressed={settings.model === m} onClick={() => set('model', m)}>
                {m === 'claude-opus-5' ? 'Opus 5' : 'Sonnet 5'}
              </button>
            ))}
          </div>
          <small style={{ display: 'block', marginTop: 6, color: 'var(--text-muted)' }}>
            {COST_PER_IMAGE[settings.model]} per photo. Opus reads awkward photos — glare, angle,
            overlapping holes — more reliably.
          </small>
        </label>

        <div className="notice">
          Your key is stored in this browser only and sent straight to Anthropic from this page.
          Nothing passes through a server of mine, because there isn't one. Use a key you are happy
          to keep on your phone, and revoke it if you lose the device.
        </div>

        <label className="check" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={settings.localHoleDetection}
            onChange={(e) => set('localHoleDetection', e.target.checked)}
          />
          Experimental: find shots without Claude
        </label>
        <small style={{ display: 'block', marginTop: 6, color: 'var(--text-muted)' }}>
          Free and instant, no API call at all — the ring is always found this way regardless, but
          this also skips Claude for the shots themselves. Rougher: it can miss a real hole, and marks
          a merged group with one flagged marker instead of splitting it. Check every marker closely.
        </small>
      </div>

      <h2>Your data</h2>
      <div className="card">
        <p>
          {boutCount} bout{boutCount === 1 ? '' : 's'} and their photos are stored in your account, not
          this device — sign in anywhere and they're there.
        </p>
        <button className="secondary" onClick={download} style={{ marginTop: 8 }}>
          Export everything as JSON
        </button>
        <button
          className="secondary danger"
          style={{ marginTop: 8 }}
          onClick={async () => {
            if (!confirm('Delete every stored photo? Scores, groups and training stay exactly as they are.')) return
            await clearImages()
            onDataChanged()
          }}
        >
          Delete all photos, keep the scores
        </button>
        <p className="meta" style={{ marginTop: 8, marginBottom: 0 }}>
          Photos are nearly all of the space used. Once a bout is scored the shot positions are the
          record, so deleting the pictures costs you nothing but the evidence. Delete individual
          bouts from History with the Select button.
        </p>
      </div>
    </>
  )
}
