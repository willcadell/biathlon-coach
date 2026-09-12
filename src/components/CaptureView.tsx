import { useEffect, useRef, useState } from 'react'
import type { Bout, Bull, Context, Position, Settings, Workout } from '../lib/types'
import { PRECISION_SHOTS, settingsContext } from '../lib/types'
import { bullsToShots, computeMetrics, mmPerUnitFor } from '../lib/geometry'
import { detectShots, VisionError, COST_PER_IMAGE } from '../lib/vision'
import { aspectOf, forStorage, forThumb } from '../lib/imaging'
import { putBout, putImage } from '../lib/db'
import { uuid } from '../lib/id'
import { MarkupView } from './MarkupView'
import { ResultsView } from './ResultsView'

type Stage = 'setup' | 'reading' | 'markup' | 'done'

const EMPTY_CONTEXT: Context = { skiedIn: false, notes: '' }

/**
 * A blank aiming mark to drag into place when there is nothing to correct.
 *
 * Coordinates are fractions of the image width on both axes, so the vertical
 * middle of the photo sits at half the reciprocal of its aspect ratio.
 */
const seedBull = (aspect: number): Bull => ({
  id: 'bull-1',
  centre: { x: 0.5, y: 0.5 / aspect },
  semiMajor: 0.2,
  semiMinor: 0.2,
  rotationDeg: 0,
  holes: [],
})

interface Props {
  settings: Settings
  workout: Workout
  onSaved: () => void
  /** Shown as a "Back to workout" button once a bout is saved, so the athlete
   *  can return to add another entry without shooting again first. */
  onExit?: () => void
}

export function CaptureView({ settings, workout, onSaved, onExit }: Props) {
  const [stage, setStage] = useState<Stage>('setup')
  const [position, setPosition] = useState<Position>('prone')
  const [context, setContext] = useState<Context>(EMPTY_CONTEXT)
  const [file, setFile] = useState<Blob | null>(null)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [aspect, setAspect] = useState(1)
  const [bulls, setBulls] = useState<Bull[]>([])
  /** Whether the ring's position came from a real detection rather than a
   *  guessed placeholder — only a guess needs the athlete to be able to drag
   *  it, so a correct detection is left alone and out of the way. */
  const [ringDetected, setRingDetected] = useState(false)
  const [notes, setNotes] = useState('')
  /** How many shots the model found, or null when it never ran. */
  const [detected, setDetected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Bout | null>(null)
  const urlRef = useRef<string>('')

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  async function onFile(picked: File) {
    setError('')
    const stored = await forStorage(picked)
    const ratio = await aspectOf(stored)
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = URL.createObjectURL(stored)
    setFile(stored)
    setImageUrl(urlRef.current)
    setAspect(ratio)

    if (!settings.apiKey) {
      setDetected(null)
      setBulls([seedBull(ratio)])
      setRingDetected(false)
      setNotes('No API key set, so nothing was read automatically. Place the ring and tap in your shots.')
      setStage('markup')
      return
    }

    setStage('reading')
    try {
      // The raw camera file, not `stored`, so the crop pass has real pixels to
      // zoom into — `stored` is already capped at 1400px for on-disk size.
      const detection = await detectShots(picked, position, settings, ratio, PRECISION_SHOTS)
      setDetected(detection.bulls.reduce((n, b) => n + b.holes.length, 0))
      setBulls(detection.bulls.length ? detection.bulls : [seedBull(ratio)])
      setRingDetected(detection.bulls.length > 0)
      setNotes(
        detection.bulls.length
          ? detection.notes
          : 'Nothing recognisable was found in the photo. Place the ring and tap in your shots.',
      )
    } catch (e) {
      setDetected(null)
      setBulls([seedBull(ratio)])
      setRingDetected(false)
      setError(e instanceof VisionError ? e.message : 'Something went wrong reading the photo.')
      setNotes('')
    }
    setStage('markup')
  }

  async function save() {
    if (!file) return
    const shots = bullsToShots(bulls, settings.aimingMarkMm)
    if (shots.length === 0) {
      setError('Mark at least one shot before scoring.')
      return
    }
    const imageId = uuid()
    const bout: Bout = {
      kind: 'precision',
      id: uuid(),
      workoutId: workout.id,
      shotAt: new Date().toISOString(),
      position,
      targetFaceId: settings.targetFaceId,
      bulletDiameterMm: settings.bulletDiameterMm,
      expectedShots: PRECISION_SHOTS,
      imageId,
      shots,
      context,
      mmPerUnit: mmPerUnitFor(bulls, settings.aimingMarkMm),
      metrics: computeMetrics(shots, position, settingsContext(settings)),
    }
    await putImage({ id: imageId, blob: file, thumb: await forThumb(file) })
    await putBout(bout)
    setSaved(bout)
    setStage('done')
    onSaved()
  }

  function reset() {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = ''
    setFile(null)
    setImageUrl('')
    setBulls([])
    setRingDetected(false)
    setSaved(null)
    setNotes('')
    setDetected(null)
    setError('')
    setContext(EMPTY_CONTEXT)
    setStage('setup')
  }

  if (stage === 'done' && saved) {
    return (
      <>
        <h1>Bout scored</h1>
        <p className="lede">Saved to your history.</p>
        <ResultsView bout={saved} settings={settings} workout={workout} />
        <div className="row" style={{ marginTop: 16 }}>
          {onExit && <button className="secondary" onClick={onExit}>Back to workout</button>}
          <button className="primary" onClick={reset}>Score another</button>
        </div>
      </>
    )
  }

  if (stage === 'reading') {
    return (
      <div className="empty" style={{ paddingTop: 80 }}>
        <div className="spinner" style={{ margin: '0 auto 16px', borderColor: 'var(--grid)', borderTopColor: 'var(--series-1)' }} />
        <p>Reading the target…</p>
        <p className="meta">Finding the aiming marks and every hole. A few seconds.</p>
      </div>
    )
  }

  if (stage === 'markup') {
    const found = detected !== null
    const mismatch = found && detected !== PRECISION_SHOTS
    return (
      <>
        <h1>{found ? `Found ${detected} shot${detected === 1 ? '' : 's'}` : 'Mark your shots'}</h1>
        <p className="lede">
          {found
            ? 'Check every marker before scoring, and drag anything that sits off its hole. A shot marked 5 mm out is a 5 mm error in every number that follows.'
            : 'Place the green ring on the black, then tap in each shot. A shot marked 5 mm out is a 5 mm error in every number that follows.'}
        </p>
        {error && <div className="notice error">{error}</div>}
        {mismatch && (
          <div className="notice">
            Expected {PRECISION_SHOTS}, found {detected}. {detected! < PRECISION_SHOTS
              ? 'Look for a hole the model may have missed — a torn or overlapping shot is the usual cause.'
              : 'Check for a double-count on one ragged or touching hole.'}
          </div>
        )}
        {notes && <div className="notice">{notes}</div>}
        <MarkupView imageUrl={imageUrl} bulls={bulls} aspect={aspect} onChange={setBulls} ringLocked={ringDetected} />
        <div className="row" style={{ marginTop: 14 }}>
          <button className="secondary" onClick={reset}>Start over</button>
          <button className="primary" onClick={save}>
            {found ? 'Confirm and score' : 'Score it'}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <h1>New bout</h1>
      <p className="lede">
        Ten shots. Photograph the target square-on, filling the frame, with the aiming mark clearly lit.
      </p>

      <div className="card">
        <label className="field">
          <span>Position</span>
          <div className="seg">
            {(['prone', 'standing'] as Position[]).map((p) => (
              <button key={p} aria-pressed={position === p} onClick={() => setPosition(p)}>
                {p === 'prone' ? 'Prone · 45 mm' : 'Standing · 115 mm'}
              </button>
            ))}
          </div>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={context.skiedIn}
            onChange={(e) => setContext({ ...context, skiedIn: e.target.checked })}
          />
          I skied in before this bout
        </label>

        <label className="field">
          <span>Notes<small>Ammunition, rifle, how the position felt.</small></span>
          <textarea
            value={context.notes}
            onChange={(e) => setContext({ ...context, notes: e.target.value })}
          />
        </label>
      </div>

      <label className="filelabel">
        Photograph or choose a photo
        <input
          type="file" accept="image/*"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }}
        />
      </label>

      <p className="meta" style={{ marginTop: 10, textAlign: 'center' }}>
        {settings.apiKey
          ? `Read automatically, ${COST_PER_IMAGE[settings.model]} per photo. You correct it before scoring.`
          : 'No API key set — you will mark the shots by hand. Add a key in Settings to have them found for you.'}
      </p>

      {onExit && (
        <button className="secondary" style={{ marginTop: 14 }} onClick={onExit}>
          Cancel, back to workout
        </button>
      )}
    </>
  )
}
