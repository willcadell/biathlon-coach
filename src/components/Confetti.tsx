import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'

/** What is being celebrated, so the confetti is in that session's colour: the
 *  red of Race, the blue of Range (precision, metal and combos), the violet of
 *  Dryfire. Shades of each, from deep to pale, so a burst still sparkles. */
export type ConfettiKind = 'race' | 'range' | 'dryfire'
const PALETTES: Record<ConfettiKind, string[]> = {
  race: ['#d03b3b', '#b82e2e', '#eb4d4d', '#f28b82', '#eb6834', '#ffd0cc'],
  range: ['#2a78d6', '#1d5aa6', '#3987e5', '#7fb2ef', '#5b9be8', '#cfe2fa'],
  dryfire: ['#8a70c2', '#6a52a3', '#a38fd6', '#c7b8ea', '#7b5fb8', '#e6def7'],
}
const DURATION_MS = 3200
/** A small burst, for a quick win rather than a goal: fewer pieces, lower and shorter. */
const SMALL_DURATION_MS = 1800

interface Piece { x: number; y: number; vx: number; vy: number; w: number; h: number; angle: number; spin: number; colour: string }

/**
 * A burst of confetti over the whole screen that falls, fades and removes
 * itself. Decoration only: it ignores taps, is hidden from assistive tech, and
 * draws nothing at all for someone who has asked their device for less motion
 * (the message it accompanies carries the news on its own).
 */
export function Confetti({ small = false, kinds = ['range'] }: {
  small?: boolean
  /** More than one (several goals met at once) mixes their palettes. */
  kinds?: ConfettiKind[]
}) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const ctx = el?.getContext('2d')
    if (!el || !ctx || reduced) return

    const DURATION = small ? SMALL_DURATION_MS : DURATION_MS
    const colours = kinds.flatMap((k) => PALETTES[k])
    const dpr = window.devicePixelRatio || 1
    const width = window.innerWidth
    const height = window.innerHeight
    el.width = width * dpr
    el.height = height * dpr
    ctx.scale(dpr, dpr)

    // Two cannons low on each side, firing up and inward, then gravity does the rest.
    const pieces: Piece[] = Array.from({ length: small ? 50 : 150 }, (_, i) => {
      const left = i % 2 === 0
      const speed = (small ? 7 : 9) + Math.random() * (small ? 6 : 9)
      const aim = (Math.PI / 180) * (50 + Math.random() * 30)
      return {
        x: left ? 0 : width,
        y: height * 0.75,
        vx: (left ? 1 : -1) * Math.cos(aim) * speed,
        vy: -Math.sin(aim) * speed,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.35,
        colour: colours[Math.floor(Math.random() * colours.length)],
      }
    })

    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = now - start
      ctx.clearRect(0, 0, width, height)
      const fade = t > DURATION * 0.65 ? Math.max(0, 1 - (t - DURATION * 0.65) / (DURATION * 0.35)) : 1
      ctx.globalAlpha = fade
      for (const p of pieces) {
        p.vy += 0.28
        p.vx *= 0.992
        p.x += p.vx
        p.y += p.vy
        p.angle += p.spin
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.colour
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      if (t < DURATION) frame = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, width, height)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // Keyed on size only: a burst fires once, and a fresh `kinds` array on a re-render must not restart it.
  }, [small])

  return (
    <canvas
      ref={canvas} aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 70 }}
    />
  )
}

/** Plays one small burst from anywhere, including as a screen is closing: it mounts its own canvas
 *  on the page and takes it away again, so it does not depend on the component that asked for it
 *  still being there. */
export function fireSmallConfetti(kind: ConfettiKind = 'range'): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(<Confetti small kinds={[kind]} />)
  window.setTimeout(() => { root.unmount(); host.remove() }, SMALL_DURATION_MS + 300)
}
