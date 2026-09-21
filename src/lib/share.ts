import QRCode from 'qrcode'
import type { Bout, Position, Workout } from './types'
import { HIT_ZONE_MM, faceById } from './types'
import { ringRadii } from './scoring'

const WIDTH = 1080
const HEIGHT = 1350

// Will move once there's a permanent domain — see shareTargetImage's own note.
const APP_URL = 'https://545coach.netlify.app'

// Fixed literal colors, independent of the viewer's own light/dark theme —
// a shared image should look the same to everyone it's shared with, not
// shift with whoever generated it. Values mirror the app's own light-theme
// tokens (styles.css :root) rather than inventing a separate palette, so a
// shared card, the icon, and the app itself all read as one brand.
const COLORS = {
  paperBase: '#f7f6f2', // ~ --page
  paper: '#ffffff', // ~ --raised — target disc + QR backing
  targetBlack: '#17181c', // the target's own scoring black, not a UI colour
  ringInner: '#4a4d55',
  ringOuter: '#cfd1d6',
  hitZone: 'rgba(111, 168, 220, 0.85)',
  shot: '#2a5d9c',
  flier: '#c0392b',
  centre: '#c96a3a',
  ellipse: '#c96a3a',
  textPrimary: '#171716', // ~ --text-primary
  textMuted: '#83807a', // ~ --text-muted
  border: 'rgba(23, 23, 22, 0.12)', // ~ --border
}

const POSITION_LABEL: Record<Position, string> = { prone: 'Prone', standing: 'Standing' }

/** A trading-card "grade" from the bout's score. `wash` is a pale tint used
 *  for the background glow and badge fill; `deep` is the saturated version
 *  used for the frame and any text, kept legible on the card's light paper
 *  background. Sharp and Solid reuse the app's own series-1/series-2 accents
 *  so the card ties back to the rest of the app instead of inventing new
 *  brand colours; Elite gets a one-off gold as its celebratory exception.
 *  Tagline stays encouraging at the low end, same spirit as diagnostics.ts
 *  staying conservative rather than ever reading as a scolding. */
interface Tier {
  name: string
  tagline: string
  wash: string
  deep: string
}

function tierFor(pct: number): Tier {
  if (pct >= 90) return { name: 'ELITE', tagline: 'Outstanding session!', wash: '#e0b64c', deep: '#8a6115' }
  if (pct >= 75) return { name: 'SHARP', tagline: 'Great session!', wash: '#8fb4d9', deep: '#2a78d6' }
  if (pct >= 55) return { name: 'SOLID', tagline: 'Solid work.', wash: '#c98a58', deep: '#c1541a' }
  return { name: 'LOGGED', tagline: 'Logged and learning.', wash: '#9aa0a8', deep: '#6b6f76' }
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

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
  ctx.fillStyle = COLORS.targetBlack
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

/** A tier-graded corner badge — the closest thing this card has to foil on
 *  a physical trading card. */
function drawBadge(ctx: CanvasRenderingContext2D, tier: Tier) {
  ctx.save()
  ctx.font = '800 26px -apple-system, sans-serif'
  const textWidth = ctx.measureText(tier.name).width
  const paddingX = 22
  const w = textWidth + paddingX * 2
  const h = 52
  const x = WIDTH - 64 - w
  const y = 48
  const r = h / 2

  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fillStyle = tier.wash
  ctx.fill()

  ctx.fillStyle = tier.deep
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(tier.name, x + w / 2, y + h / 2 + 2)
  ctx.restore()
}

/** A QR square with its own light backing and a hairline border, so it stays
 *  scannable and visually distinct on the card's own light background. */
async function drawQrCode(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number) {
  const pad = 16
  ctx.fillStyle = COLORS.paper
  ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2)
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 1.5
  ctx.strokeRect(x - pad, y - pad, size + pad * 2, size + pad * 2)

  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, url, {
    width: size,
    margin: 0,
    color: { dark: COLORS.textPrimary, light: COLORS.paper },
  })
  ctx.drawImage(qrCanvas, x, y, size, size)
}

/** Renders a precision bout as a single, self-contained trading card sized
 *  for an Instagram feed post — the target, its score and grade, and a QR
 *  code back to the app, flattened so it can be shared as one file. */
export async function buildTargetShareImage(bout: Bout, workout: Workout): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser could not create an image surface.')

  const pct = bout.metrics.ringPossible > 0 ? (bout.metrics.ringTotal / bout.metrics.ringPossible) * 100 : 0
  const tier = tierFor(pct)

  // A warm paper base — same as the app's own background — with a soft
  // wash of the tier's colour glowing in from the top, like light through
  // tinted glass, instead of a solid dark card.
  ctx.fillStyle = COLORS.paperBase
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const wash = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.8)
  wash.addColorStop(0, hexToRgba(tier.wash, 0.28))
  wash.addColorStop(1, hexToRgba(tier.wash, 0))
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // The card frame — a trading card's defining feature, graded in the
  // tier's own colour.
  const frameInset = 22
  ctx.strokeStyle = tier.deep
  ctx.lineWidth = 6
  ctx.strokeRect(frameInset, frameInset, WIDTH - frameInset * 2, HEIGHT - frameInset * 2)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.textMuted
  ctx.font = '600 28px -apple-system, sans-serif'
  ctx.fillText('545 COACH', 64, 84)

  drawBadge(ctx, tier)

  const title = workout.name || new Date(workout.startedAt).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  ctx.fillStyle = COLORS.textPrimary
  ctx.font = '700 56px -apple-system, sans-serif'
  const titleBottom = wrapText(ctx, title, 64, 172, WIDTH - 128, 62)

  ctx.fillStyle = tier.deep
  ctx.font = '600 32px -apple-system, sans-serif'
  ctx.fillText(`${POSITION_LABEL[bout.position]} · ${tier.tagline}`, 64, titleBottom + 46)

  drawTargetDiagram(ctx, bout, WIDTH / 2, 610, 280)

  ctx.textAlign = 'center'
  ctx.fillStyle = tier.deep
  ctx.font = '800 112px -apple-system, sans-serif'
  ctx.fillText(`${bout.metrics.ringTotal}/${bout.metrics.ringPossible}`, WIDTH / 2, 1010)

  ctx.font = '500 30px -apple-system, sans-serif'
  ctx.fillStyle = COLORS.textMuted
  ctx.fillText(
    `${bout.shots.length} shot${bout.shots.length === 1 ? '' : 's'} · ${bout.metrics.meanRadius.toFixed(0)} mm mean radius`,
    WIDTH / 2, 1062,
  )

  // Footer: a QR code back to the app on the left, the URL and date beside
  // it — the "fine print" of the card.
  const qrSize = 120
  const footerY = 1170
  await drawQrCode(ctx, APP_URL, 90, footerY, qrSize)

  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.textPrimary
  ctx.font = '600 30px -apple-system, sans-serif'
  ctx.fillText('Try 545 Coach', 90 + qrSize + 32, footerY + 44)
  ctx.fillStyle = COLORS.textMuted
  ctx.font = '500 26px -apple-system, sans-serif'
  ctx.fillText(APP_URL.replace('https://', ''), 90 + qrSize + 32, footerY + 78)
  ctx.fillText(
    new Date(bout.shotAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    90 + qrSize + 32, footerY + 112,
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
 *
 * APP_URL above is the app's current Netlify subdomain — update it if the
 * app ever moves to a permanent domain, so shared cards keep pointing
 * somewhere real.
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
