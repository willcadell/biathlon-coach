import type { Bout, Position, Workout } from './types'
import { HIT_ZONE_MM, faceById } from './types'
import { ringRadii } from './scoring'

const WIDTH = 1080
const HEIGHT = 1350

// Fixed literal colors, independent of the viewer's own light/dark theme —
// a shared image should look the same to everyone it's shared with, not
// shift with whoever generated it.
const COLORS = {
  bgTop: '#1c1f24',
  bgBottom: '#0e1013',
  paper: '#ffffff',
  black: '#17181c',
  ringInner: '#4a4d55',
  ringOuter: '#cfd1d6',
  hitZone: 'rgba(111, 168, 220, 0.85)',
  shot: '#2a5d9c',
  flier: '#c0392b',
  centre: '#c96a3a',
  ellipse: '#c96a3a',
  textPrimary: '#f4f4f2',
  textMuted: '#9a9ea8',
  accent: '#6fa8dc',
}

const POSITION_LABEL: Record<Position, string> = { prone: 'Prone', standing: 'Standing' }

/** The bout's ring diagram — the same picture TargetPlot draws, redrawn in
 *  plain Canvas 2D so it can be flattened into one exportable image. */
function drawTargetDiagram(ctx: CanvasRenderingContext2D, bout: Bout, cx: number, cy: number, radiusPx: number) {
  const face = faceById(bout.targetFaceId)
  const { shots, metrics } = bout
  const radii = ringRadii(face)
  const blackRadius = face.blackMm / 2
  const hitRadius = HIT_ZONE_MM[bout.position] / 2
  const bulletRadius = bout.bulletDiameterMm / 2

  const furthest = shots.reduce((m, s) => Math.max(m, Math.hypot(s.mm.x, s.mm.y)), 0)
  const extent = Math.max(blackRadius * 1.15, furthest + bulletRadius * 2, radii[0] * 3)
  const scale = radiusPx / extent
  const px = (mm: number) => cx + mm * scale
  const py = (mm: number) => cy - mm * scale

  ctx.beginPath()
  ctx.fillStyle = COLORS.paper
  ctx.arc(cx, cy, radiusPx * 1.08, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.fillStyle = COLORS.black
  ctx.arc(cx, cy, blackRadius * scale, 0, Math.PI * 2)
  ctx.fill()

  for (const r of radii) {
    if (r > extent) continue
    ctx.beginPath()
    ctx.strokeStyle = r <= blackRadius ? COLORS.ringInner : COLORS.ringOuter
    ctx.lineWidth = Math.max(1.5, radiusPx / 160)
    ctx.arc(cx, cy, r * scale, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (hitRadius < extent) {
    ctx.save()
    ctx.setLineDash([radiusPx / 45, radiusPx / 70])
    ctx.strokeStyle = COLORS.hitZone
    ctx.lineWidth = Math.max(2, radiusPx / 110)
    ctx.beginPath()
    ctx.arc(cx, cy, hitRadius * scale, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  const e = metrics.ellipse
  if (e.major > 0.5 && shots.length >= 3) {
    ctx.save()
    ctx.translate(px(metrics.mpi.x), py(metrics.mpi.y))
    ctx.rotate((-e.angleDeg * Math.PI) / 180)
    ctx.setLineDash([radiusPx / 55, radiusPx / 80])
    ctx.strokeStyle = COLORS.ellipse
    ctx.lineWidth = Math.max(2, radiusPx / 130)
    ctx.beginPath()
    ctx.ellipse(0, 0, Math.max(e.major, 0.5) * scale, Math.max(e.minor, 0.5) * scale, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  const gx = px(metrics.mpi.x)
  const gy = py(metrics.mpi.y)
  const armLen = radiusPx / 22
  ctx.strokeStyle = COLORS.centre
  ctx.lineWidth = Math.max(2.5, radiusPx / 90)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(gx - armLen, gy)
  ctx.lineTo(gx + armLen, gy)
  ctx.moveTo(gx, gy - armLen)
  ctx.lineTo(gx, gy + armLen)
  ctx.stroke()

  shots.forEach((s, i) => {
    const ring = metrics.rings[i]
    const isFlier = metrics.flierIndex === i
    const x = px(s.mm.x)
    const y = py(s.mm.y)
    const r = Math.max(bulletRadius * scale, 8)
    ctx.beginPath()
    ctx.fillStyle = isFlier ? COLORS.flier : COLORS.shot
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = Math.max(1.5, radiusPx / 200)
    ctx.strokeStyle = COLORS.paper
    ctx.stroke()
    ctx.fillStyle = COLORS.paper
    ctx.font = `700 ${Math.max(14, r * 0.95)}px -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(ring ? ring.value : s.order), x, y + 1)
  })
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(' ')
  let line = ''
  let cy = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cy)
      line = word
      cy += lineHeight
    } else {
      line = test
    }
  }
  ctx.fillText(line, x, cy)
  return cy
}

/** Renders a precision bout as a single, self-contained image sized for an
 *  Instagram feed post — the target, its score, and the workout it came
 *  from, flattened so it can be shared as one file. */
export function buildTargetShareImage(bout: Bout, workout: Workout): Blob | Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser could not create an image surface.')

  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  bg.addColorStop(0, COLORS.bgTop)
  bg.addColorStop(1, COLORS.bgBottom)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.textMuted
  ctx.font = '600 30px -apple-system, sans-serif'
  ctx.fillText('545 COACH', 64, 84)

  const title = workout.name || new Date(workout.startedAt).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  ctx.fillStyle = COLORS.textPrimary
  ctx.font = '700 58px -apple-system, sans-serif'
  const titleBottom = wrapText(ctx, title, 64, 170, WIDTH - 128, 64)

  ctx.fillStyle = COLORS.accent
  ctx.font = '600 32px -apple-system, sans-serif'
  ctx.fillText(POSITION_LABEL[bout.position], 64, titleBottom + 46)

  drawTargetDiagram(ctx, bout, WIDTH / 2, 650, 320)

  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.textPrimary
  ctx.font = '800 116px -apple-system, sans-serif'
  ctx.fillText(`${bout.metrics.ringTotal}/${bout.metrics.ringPossible}`, WIDTH / 2, 1120)

  ctx.font = '500 32px -apple-system, sans-serif'
  ctx.fillStyle = COLORS.textMuted
  ctx.fillText(
    `${bout.shots.length} shot${bout.shots.length === 1 ? '' : 's'} · ${bout.metrics.meanRadius.toFixed(0)} mm mean radius`,
    WIDTH / 2, 1205,
  )

  ctx.font = '500 26px -apple-system, sans-serif'
  ctx.fillStyle = COLORS.textMuted
  ctx.fillText(
    new Date(bout.shotAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    WIDTH / 2, 1280,
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not export this image.'))
    }, 'image/png')
  })
}

function shareFileName(bout: Bout, workout: Workout): string {
  const base = (workout.name || 'workout').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `${base || 'workout'}-${bout.position}.png`
}

/**
 * Shares a precision bout's target as one image via the OS share sheet, or
 * falls back to a plain download where file sharing isn't available (mainly
 * desktop browsers without the Web Share API).
 */
export async function shareTargetImage(bout: Bout, workout: Workout): Promise<void> {
  const blob = await buildTargetShareImage(bout, workout)
  const file = new File([blob], shareFileName(bout, workout), { type: 'image/png' })
  const title = workout.name || 'Precision bout'
  const text = `${bout.metrics.ringTotal}/${bout.metrics.ringPossible} — ${POSITION_LABEL[bout.position]}`

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text })
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  URL.revokeObjectURL(url)
}
