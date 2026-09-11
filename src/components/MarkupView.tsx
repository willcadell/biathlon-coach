import { useRef, useState } from 'react'
import type { Bull, ImagePoint } from '../lib/types'

interface Props {
  imageUrl: string
  bulls: Bull[]
  /** Image width divided by height. */
  aspect: number
  onChange: (bulls: Bull[]) => void
  /** True once the ring's position came from a real detection rather than a
   *  guessed placeholder. A correct ring is left alone — not draggable, no
   *  resize handle — so it stops competing with the shots for every tap and
   *  drag right where a good group is thickest. A guess still needs both. */
  ringLocked: boolean
}

type Drag =
  | { kind: 'hole'; bull: number; hole: number }
  | { kind: 'move'; bull: number; offset: ImagePoint }
  | { kind: 'radius'; bull: number }
  | null

const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * Keep the pointer on this element for the rest of the gesture.
 *
 * A refused capture is not a reason to lose the drag, so the failure is
 * swallowed and the move handler carries on from the wrapper's own events.
 */
function capture(e: React.PointerEvent) {
  try {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  } catch {
    // Some pointers cannot be captured. Dragging still works without it.
  }
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 1.6

/**
 * The correction step: the model's reading of the photo, laid over the photo,
 * with every mark draggable.
 *
 * The vision pass is good but not perfect, and a shot in the wrong place
 * poisons every statistic downstream. Fixing it by hand takes a few seconds and
 * makes the whole thing trustworthy, so this screen is not skippable.
 */
export function MarkupView({ imageUrl, bulls, aspect, onChange, ringLocked }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag>(null)
  const [selected, setSelected] = useState<{ bull: number; hole: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const [zoom, setZoom] = useState(1)

  // Pinch-to-zoom, done by hand rather than left to the browser. The browser's
  // own pinch gesture is suppressed by touch-action: none wherever a marker
  // needs reliable dragging — which includes the ring's own centre, exactly
  // where a good group clusters — so native pinch would never engage right
  // where zooming in matters most. Pointer events fire regardless of
  // touch-action, so tracking the two fingers ourselves works everywhere.
  const touches = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinch = useRef<{ startDist: number; startZoom: number } | null>(null)
  // True for exactly the one pointerdown that brings a second finger down —
  // every single-finger handler below checks this and bails, so that finger
  // starts a pinch instead of a drag or a tap wherever it happens to land.
  const pinchStarting = useRef(false)

  const holeCount = bulls.reduce((n, b) => n + b.holes.length, 0)

  /**
   * Pointer position in image-width units on both axes.
   *
   * Dividing y by the height instead would make a vertical millimetre a
   * different size from a horizontal one, which quietly stretches every group
   * on a photo that is not square.
   */
  const pointAt = (e: React.PointerEvent): ImagePoint | null => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box || box.width === 0) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1 / aspect, Math.max(0, (e.clientY - box.top) / box.width)),
    }
  }

  const nearestBull = (p: ImagePoint) => {
    let best = 0
    let bestD = Infinity
    bulls.forEach((b, i) => {
      const d = Math.hypot(p.x - b.centre.x, p.y - b.centre.y)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }

  /** Runs before every other pointerdown handler, for every finger, no
   *  matter what it lands on — the only way to notice a second finger has
   *  joined even when the first is already captured by a marker. */
  const onWrapperPointerDownCapture = (e: React.PointerEvent) => {
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()]
      pinch.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startZoom: zoom }
      setDrag(null)
      pinchStarting.current = true
      // Only meant to suppress this one pointerdown; clear it once the
      // event has finished propagating to every handler below.
      setTimeout(() => { pinchStarting.current = false }, 0)
    }
  }

  const onSurfacePointerDown = (e: React.PointerEvent) => {
    if (pinchStarting.current || !adding) return
    const p = pointAt(e)
    if (!p || bulls.length === 0) return
    const i = nearestBull(p)
    const next = bulls.map((b, bi) => (bi === i ? { ...b, holes: [...b.holes, p] } : b))
    onChange(next)
    setSelected({ bull: i, hole: next[i].holes.length - 1 })
    setAdding(false)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    if (pinch.current && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current.startDist > 0) {
        setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.current.startZoom * (dist / pinch.current.startDist))))
      }
      e.preventDefault()
      return
    }

    if (!drag) return
    const p = pointAt(e)
    if (!p) return
    e.preventDefault()

    onChange(
      bulls.map((b, bi) => {
        if (bi !== drag.bull) return b
        if (drag.kind === 'hole') {
          return { ...b, holes: b.holes.map((h, hi) => (hi === drag.hole ? p : h)) }
        }
        if (drag.kind === 'move') {
          // Only the ring moves. The holes are already in the right place on
          // the photograph; the ring is the origin every shot is measured
          // from, so sliding it is exactly how the athlete re-scores the bout.
          // The offset keeps the ring under wherever it was grabbed, rather
          // than snapping its centre onto the pointer.
          return { ...b, centre: { x: p.x + drag.offset.x, y: p.y + drag.offset.y } }
        }
        const r = Math.max(0.02, Math.hypot(p.x - b.centre.x, p.y - b.centre.y))
        const squash = b.semiMinor / b.semiMajor
        return { ...b, semiMajor: r, semiMinor: r * squash }
      }),
    )
  }

  const onWrapperPointerEnd = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId)
    if (touches.current.size < 2) pinch.current = null
    setDrag(null)
  }

  const removeSelected = () => {
    if (!selected) return
    onChange(
      bulls.map((b, bi) =>
        bi === selected.bull ? { ...b, holes: b.holes.filter((_, hi) => hi !== selected.hole) } : b,
      ),
    )
    setSelected(null)
  }

  let orderCounter = 0

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button
          className="secondary"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_STEP))}
          disabled={zoom <= MIN_ZOOM}
        >
          − Zoom out
        </button>
        <button
          className="secondary"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
        >
          + Zoom in
        </button>
      </div>
      <div
        style={
          zoom > 1
            ? { overflow: 'auto', touchAction: 'pan-x pan-y', maxHeight: '70vh', borderRadius: 'var(--radius)' }
            : undefined
        }
      >
      <div
        className="markup"
        ref={wrap}
        onPointerDownCapture={onWrapperPointerDownCapture}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onWrapperPointerEnd}
        onPointerCancel={onWrapperPointerEnd}
        style={{ cursor: adding ? 'crosshair' : 'default', transform: `scale(${zoom})`, transformOrigin: '0 0' }}
      >
        <img src={imageUrl} alt="Your target" draggable={false} />
        <svg viewBox={`0 0 100 ${100 / aspect}`}>
          {bulls.map((b, bi) => (
            <g key={b.id}>
              {/* The aiming mark as the model read it. */}
              <ellipse
                cx={b.centre.x * 100} cy={b.centre.y * 100}
                rx={b.semiMajor * 100} ry={b.semiMinor * 100}
                transform={`rotate(${b.rotationDeg} ${b.centre.x * 100} ${b.centre.y * 100})`}
                fill="none" stroke="#1baf7a" strokeWidth={2}
                strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }}
              />
              {!ringLocked && (
                <>
                  {/*
                    A wide, invisible companion on the same path — grab and
                    drag ANYWHERE on the ring's edge to move it. A shooter's
                    shots cluster right around the ring's own centre, so a
                    solid drag handle sitting there would forever be buried
                    under them; the edge is never where the group is.
                  */}
                  <ellipse
                    cx={b.centre.x * 100} cy={b.centre.y * 100}
                    rx={b.semiMajor * 100} ry={b.semiMinor * 100}
                    transform={`rotate(${b.rotationDeg} ${b.centre.x * 100} ${b.centre.y * 100})`}
                    fill="none" stroke="transparent" strokeWidth={8}
                    style={{ cursor: 'move', touchAction: 'none' }}
                    onPointerDown={(e) => {
                      // While adding, every tap is meant to place a shot —
                      // this band is wide enough to cross a lot of the
                      // black, and would otherwise steal taps meant for the
                      // surface under it.
                      if (pinchStarting.current || adding) return
                      e.stopPropagation()
                      const p = pointAt(e)
                      if (!p) return
                      capture(e)
                      setDrag({ kind: 'move', bull: bi, offset: { x: b.centre.x - p.x, y: b.centre.y - p.y } })
                    }}
                  />
                  {/* Resize handle on the long axis. */}
                  <circle
                    cx={(b.centre.x + b.semiMajor * Math.cos(rad(b.rotationDeg))) * 100}
                    cy={(b.centre.y + b.semiMajor * Math.sin(rad(b.rotationDeg))) * 100}
                    r={1.6} fill="#fff" stroke="#1baf7a" strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'ew-resize', touchAction: 'none' }}
                    onPointerDown={(e) => {
                      if (pinchStarting.current || adding) return
                      e.stopPropagation()
                      capture(e)
                      setDrag({ kind: 'radius', bull: bi })
                    }}
                  />
                </>
              )}
              {/* A small, non-interactive crosshair marks the origin itself,
                  so it never competes with a shot for the tap underneath it. */}
              <g stroke="#1baf7a" strokeWidth={0.6} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }}>
                <line x1={b.centre.x * 100 - 1} y1={b.centre.y * 100} x2={b.centre.x * 100 + 1} y2={b.centre.y * 100} />
                <line x1={b.centre.x * 100} y1={b.centre.y * 100 - 1} x2={b.centre.x * 100} y2={b.centre.y * 100 + 1} />
              </g>

              {b.holes.map((h, hi) => {
                orderCounter += 1
                const isSel = selected?.bull === bi && selected?.hole === hi
                // Yellow reads clearly against the black paper without a fill
                // hiding the hole underneath it; red marks the one selected
                // for editing.
                const color = isSel ? '#d03b3b' : '#fab219'
                const cx = h.x * 100
                const cy = h.y * 100
                const r = 1.5
                return (
                  <g key={hi} style={{ cursor: 'move', touchAction: 'none' }}
                    onPointerDown={(e) => {
                      // While adding, a tap on top of an existing marker is
                      // meant for the surface underneath — two holes close
                      // together are exactly when the markers overlap.
                      if (pinchStarting.current || adding) return
                      e.stopPropagation()
                      capture(e)
                      setDrag({ kind: 'hole', bull: bi, hole: hi })
                      setSelected({ bull: bi, hole: hi })
                    }}
                  >
                    {/* Generous, invisible touch target — the outline alone is too thin to grab reliably. */}
                    <circle cx={cx} cy={cy} r={3.4} fill="transparent" />
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                    <text
                      x={cx} y={cy - r - 1.2} fill={color} fontSize={2.2}
                      fontWeight={700} textAnchor="middle"
                      stroke="#000" strokeWidth={0.5} style={{ pointerEvents: 'none', paintOrder: 'stroke' }}
                    >
                      {orderCounter}
                    </text>
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="secondary"
          onClick={() => setAdding((a) => !a)}
          aria-pressed={adding}
          style={adding ? { borderColor: 'var(--series-1)', color: 'var(--series-1)' } : undefined}
        >
          {adding ? 'Tap the photo…' : '+ Add shot'}
        </button>
        <button className="secondary danger" onClick={removeSelected} disabled={!selected}>
          Remove shot
        </button>
      </div>

      <p className="meta" style={{ marginTop: 10 }}>
        {holeCount} shot{holeCount === 1 ? '' : 's'} marked. Drag any number onto its hole. Pinch to
        zoom anywhere, including on the ring or a shot.{' '}
        {ringLocked
          ? 'The green ring is the aiming mark, placed automatically — everything is measured against it.'
          : 'The green ring is the aiming mark — drag anywhere on its dashed edge to slide it, or its white handle to resize it, until it sits exactly on the black, because everything is measured against it.'}
      </p>
    </div>
  )
}
