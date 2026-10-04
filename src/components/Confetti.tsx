import { useEffect, useRef } from 'react'

const COLOURS = ['#2f8f5b', '#e8892b', '#3b82c4', '#d9534f', '#f2c94c', '#8e63c7']
const DURATION_MS = 3200

interface Piece { x: number; y: number; vx: number; vy: number; w: number; h: number; angle: number; spin: number; colour: string }

/**
 * A burst of confetti over the whole screen that falls, fades and removes
 * itself. Decoration only: it ignores taps, is hidden from assistive tech, and
 * draws nothing at all for someone who has asked their device for less motion
 * (the message it accompanies carries the news on its own).
 */
export function Confetti() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const ctx = el?.getContext('2d')
    if (!el || !ctx || reduced) return

    const dpr = window.devicePixelRatio || 1
    const width = window.innerWidth
    const height = window.innerHeight
    el.width = width * dpr
    el.height = height * dpr
    ctx.scale(dpr, dpr)

    // Two cannons low on each side, firing up and inward, then gravity does the rest.
    const pieces: Piece[] = Array.from({ length: 150 }, (_, i) => {
      const left = i % 2 === 0
      const speed = 9 + Math.random() * 9
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
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      }
    })

    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = now - start
      ctx.clearRect(0, 0, width, height)
      const fade = t > DURATION_MS * 0.65 ? Math.max(0, 1 - (t - DURATION_MS * 0.65) / (DURATION_MS * 0.35)) : 1
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
      if (t < DURATION_MS) frame = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, width, height)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <canvas
      ref={canvas} aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 70 }}
    />
  )
}
