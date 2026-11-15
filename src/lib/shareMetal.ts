import type { MetalBout, Workout } from './types'
import { METAL_TARGETS, comboLabel, hitsOf } from './metal'
import { comboRounds, raceLabel, summariseMetal, summariseRace } from './metalSummary'
import { formatRangeTime } from './time'
import {
  APP_URL, COLORS, HEIGHT, WIDTH, canvasToBlob, deliverImage, drawBadge, drawQrCode, hexToRgba, tierFor, wrapText, type Tier,
} from './share'

/** The shareable cards for metal: a whole session's metal, and a single combo. Same 1080 x 1350
 *  card as the target card, in the same paper, frame and footer, so they read as one set. A card is
 *  graded by hit rate, as the target card is by ring score. */

const RANGE_BLUE = '#2a78d6'
const FONT = '-apple-system, sans-serif'

const PAGE_TITLE = (workout: Workout) =>
  workout.name || new Date(workout.startedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

/** The frame, wash, brand line, badge and title every metal card starts with. Returns where the
 *  title ended, so the card can carry on below it. */
function drawCardTop(ctx: CanvasRenderingContext2D, tier: Tier, title: string, subtitle: string): number {
  ctx.fillStyle = COLORS.paperBase
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const wash = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.8)
  wash.addColorStop(0, hexToRgba(tier.wash, 0.28))
  wash.addColorStop(1, hexToRgba(tier.wash, 0))
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.strokeStyle = tier.deep
  ctx.lineWidth = 6
  ctx.strokeRect(22, 22, WIDTH - 44, HEIGHT - 44)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.textMuted
  ctx.font = `600 28px ${FONT}`
  ctx.fillText('545 COACH', 64, 84)
  drawBadge(ctx, tier)

  ctx.fillStyle = COLORS.textPrimary
  ctx.font = `700 56px ${FONT}`
  const bottom = wrapText(ctx, title, 64, 172, WIDTH - 128, 62)
  ctx.fillStyle = tier.deep
  ctx.font = `600 32px ${FONT}`
  ctx.fillText(subtitle, 64, bottom + 46)
  return bottom + 46
}

async function drawCardFooter(ctx: CanvasRenderingContext2D, dateIso: string) {
  const qrSize = 120
  const footerY = 1170
  await drawQrCode(ctx, APP_URL, 90, footerY, qrSize)
  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.textPrimary
  ctx.font = `600 30px ${FONT}`
  ctx.fillText('Try 545 Coach', 90 + qrSize + 32, footerY + 44)
  ctx.fillStyle = COLORS.textMuted
  ctx.font = `500 26px ${FONT}`
  ctx.fillText(APP_URL.replace('https://', ''), 90 + qrSize + 32, footerY + 78)
  ctx.fillText(new Date(dateIso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), 90 + qrSize + 32, footerY + 112)
}

function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser could not create an image surface.')
  return { canvas, ctx }
}

/** A target as the app draws it: white with a coloured outline once hit, solid colour while it is
 *  still standing (a miss). The colour is the card's own: range blue, or race orange. */
function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hit: boolean, colour = RANGE_BLUE) {
  const outline = Math.max(3, r / 5)
  ctx.beginPath()
  ctx.arc(x, y, r - (hit ? outline / 2 : 0), 0, Math.PI * 2)
  if (hit) {
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = outline
    ctx.strokeStyle = colour
    ctx.stroke()
  } else {
    ctx.fillStyle = colour
    ctx.fill()
  }
}

const pct = (n: number) => `${Math.round(n)}%`

/** One row per round or stage: its label and position, the five targets as dots, and the range
 *  time and heart rate when any were recorded. Rows shrink as there are more; a dozen fit. */
function drawRoundRows(ctx: CanvasRenderingContext2D, rounds: MetalBout[], prefix: string, dot: string) {
  const top = 520
  const bottom = 1120
  const shown = rounds.slice(0, 12)
  const rowH = Math.min(104, (bottom - top) / Math.max(1, shown.length))
  const dotR = Math.min(30, rowH * 0.32)
  // Few rows sit in the middle of the space rather than hugging the headline.
  const startY = top + (bottom - top - rowH * shown.length) / 2
  const hasHr = shown.some((b) => b.heartRate > 0)
  const hasTime = shown.some((b) => (b.rangeSeconds ?? 0) > 0)
  shown.forEach((b, i) => {
    const cy = startY + rowH * i + rowH / 2
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = COLORS.textPrimary
    ctx.font = `700 ${Math.min(36, rowH * 0.45)}px ${FONT}`
    ctx.fillText(`${prefix}${i + 1}`, 90, cy)
    ctx.fillStyle = COLORS.textMuted
    ctx.font = `500 ${Math.min(28, rowH * 0.36)}px ${FONT}`
    ctx.fillText(b.position === 'prone' ? 'Prone' : 'Standing', 160, cy)
    const hits = hitsOf(b)
    METAL_TARGETS.forEach((t, k) => drawDot(ctx, 330 + k * (dotR * 2 + 12) + dotR, cy, dotR, hits[t], dot))
    ctx.textAlign = 'right'
    ctx.fillStyle = COLORS.textPrimary
    ctx.font = `600 ${Math.min(30, rowH * 0.4)}px ${FONT}`
    const right: string[] = []
    if (hasTime) right.push(b.rangeSeconds ? formatRangeTime(b.rangeSeconds) : '—')
    if (hasHr) right.push(b.heartRate > 0 ? `${b.heartRate} bpm` : '—')
    ctx.fillText(right.join('   '), WIDTH - 90, cy)
  })
  ctx.textBaseline = 'alphabetic'
  if (rounds.length > shown.length) {
    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.textMuted
    ctx.font = `500 26px ${FONT}`
    ctx.fillText(`+ ${rounds.length - shown.length} more`, WIDTH / 2, bottom + 30)
  }
}

/** A whole session's metal: the overall hit rate, each target's hit rate as a circle (as in
 *  Analysis), prone against standing, and the clean bouts and range time when there are some. */
export async function buildMetalSessionImage(workout: Workout, bouts: MetalBout[]): Promise<Blob> {
  const sum = summariseMetal(bouts)
  const tier = tierFor(sum.hitRatePct)
  const { canvas, ctx } = newCanvas()
  drawCardTop(ctx, tier, PAGE_TITLE(workout), `Metal session · ${sum.bouts} bout${sum.bouts === 1 ? '' : 's'} · ${tier.tagline}`)

  ctx.textAlign = 'center'
  ctx.fillStyle = tier.deep
  ctx.font = `800 170px ${FONT}`
  ctx.fillText(pct(sum.hitRatePct), WIDTH / 2, 470)
  ctx.fillStyle = COLORS.textMuted
  ctx.font = `500 32px ${FONT}`
  ctx.fillText(`${sum.hits} of ${sum.shots} targets hit`, WIDTH / 2, 524)

  // The five targets, alpha to echo, each with its own hit rate.
  const r = 78
  const gap = 36
  const rowW = METAL_TARGETS.length * r * 2 + (METAL_TARGETS.length - 1) * gap
  const x0 = (WIDTH - rowW) / 2 + r
  sum.byTarget.forEach((t, i) => {
    const cx = x0 + i * (r * 2 + gap)
    const cy = 690
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = RANGE_BLUE
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 50px ${FONT}`
    ctx.textBaseline = 'middle'
    ctx.fillText(pct(t.hitRatePct), cx, cy + 2)
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = COLORS.textMuted
    ctx.font = `600 26px ${FONT}`
    ctx.fillText(t.target[0].toUpperCase() + t.target.slice(1), cx, cy + r + 40)
  })

  // Prone against standing.
  const pos = sum.byPosition
  pos.forEach((p, i) => {
    const colW = (WIDTH - 160) / Math.max(1, pos.length)
    const cx = 80 + colW * i + colW / 2
    ctx.fillStyle = COLORS.textPrimary
    ctx.font = `800 64px ${FONT}`
    ctx.fillText(pct(p.hitRatePct), cx, 935)
    ctx.fillStyle = COLORS.textMuted
    ctx.font = `500 28px ${FONT}`
    ctx.fillText(`${p.position === 'prone' ? 'Prone' : 'Standing'} · ${p.bouts} bout${p.bouts === 1 ? '' : 's'}`, cx, 978)
  })

  // The extras, only the ones that exist.
  const extras: string[] = []
  if (sum.clean > 0) extras.push(`${sum.clean} clean 5 for 5`)
  if (sum.avgRangeSeconds !== null) extras.push(`${formatRangeTime(sum.avgRangeSeconds)} avg range time`)
  if (sum.avgHeartRate !== null) extras.push(`${sum.avgHeartRate} bpm avg entry`)
  ctx.fillStyle = tier.deep
  ctx.font = `600 32px ${FONT}`
  ctx.fillText(extras.join('  ·  '), WIDTH / 2, 1080)

  await drawCardFooter(ctx, workout.startedAt)
  return canvasToBlob(canvas)
}

/** One combo, round by round: each round's five targets as dots, with the heart rate and range
 *  time it recorded. Up to a dozen rounds fit; the rows shrink as there are more. */
export async function buildComboImage(workout: Workout, zone: number | null, roundsIn: MetalBout[]): Promise<Blob> {
  const rounds = comboRounds(roundsIn)
  const sum = summariseMetal(rounds)
  const tier = tierFor(sum.hitRatePct)
  const { canvas, ctx } = newCanvas()
  drawCardTop(ctx, tier, comboLabel(zone), `${PAGE_TITLE(workout)} · ${rounds.length} round${rounds.length === 1 ? '' : 's'}`)

  ctx.textAlign = 'center'
  ctx.fillStyle = tier.deep
  ctx.font = `800 130px ${FONT}`
  ctx.fillText(`${sum.hits}/${sum.shots}`, WIDTH / 2, 420)
  ctx.fillStyle = COLORS.textMuted
  ctx.font = `500 32px ${FONT}`
  ctx.fillText(`${pct(sum.hitRatePct)} hit rate`, WIDTH / 2, 470)

  drawRoundRows(ctx, rounds, 'R', RANGE_BLUE)

  await drawCardFooter(ctx, rounds[0]?.shotAt ?? workout.startedAt)
  return canvasToBlob(canvas)
}

/** The race colours, as Analysis shows them: Race orange is the app's series-2 (#eb6834, lightened for the glow and badge) deepened
 *  by 20% black (#bc532a), the same shade as the Race performance tiles. The card's frame, glow,
 *  badge, headline and dots are all in it, so a race reads as a race at a glance. */
const RACE_ORANGE = '#bc532a'
const RACE_WASH = '#f4b898'

/** A race result: the format, every stage's five targets, the total and what the misses cost. A
 *  clean race (nothing missed) says so. */
export async function buildRaceImage(workout: Workout, stagesIn: MetalBout[]): Promise<Blob> {
  const type = workout.raceType ?? 'sprint'
  const race = summariseRace(type, stagesIn)
  const grade = tierFor(race.hitRatePct)
  // The grade's name and tagline stay; its colours become the race's.
  const tier: Tier = { ...grade, wash: RACE_WASH, deep: RACE_ORANGE }
  const { canvas, ctx } = newCanvas()
  drawCardTop(ctx, tier, PAGE_TITLE(workout), `${raceLabel(type)} · ${race.complete ? tier.tagline : `${race.stages.length} of ${race.expectedStages} stages`}`)

  ctx.textAlign = 'center'
  ctx.fillStyle = RACE_ORANGE
  ctx.font = `800 130px ${FONT}`
  ctx.fillText(`${race.hits}/${race.shots}`, WIDTH / 2, 420)
  ctx.fillStyle = race.cleanShoot ? RACE_ORANGE : COLORS.textMuted
  ctx.font = `${race.cleanShoot ? 700 : 500} 34px ${FONT}`
  ctx.fillText(`${race.penalty}  ·  ${Math.round(race.hitRatePct)}% hit`, WIDTH / 2, 474)

  drawRoundRows(ctx, race.stages, 'S', RACE_ORANGE)
  await drawCardFooter(ctx, race.stages[0]?.shotAt ?? workout.startedAt)
  return canvasToBlob(canvas)
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workout'

/** A session's metal as a card; for a race, the race result card instead. */
export async function shareMetalSessionImage(workout: Workout, bouts: MetalBout[]): Promise<void> {
  const sum = summariseMetal(bouts)
  if (workout.raceType) {
    const race = summariseRace(workout.raceType, bouts)
    const blob = await buildRaceImage(workout, bouts)
    await deliverImage(blob, `${slug(workout.name || workout.raceType)}-race.png`, workout.name || raceLabel(workout.raceType), `${raceLabel(workout.raceType)} — ${race.hits}/${race.shots}, ${race.penalty.toLowerCase()}`)
    return
  }
  const blob = await buildMetalSessionImage(workout, bouts)
  await deliverImage(blob, `${slug(workout.name || 'metal')}-metal.png`, workout.name || 'Metal session', `Metal session — ${sum.hits}/${sum.shots} targets (${Math.round(sum.hitRatePct)}%)`)
}

export async function shareComboImage(workout: Workout, zone: number | null, rounds: MetalBout[]): Promise<void> {
  const sum = summariseMetal(rounds)
  const blob = await buildComboImage(workout, zone, rounds)
  await deliverImage(blob, `${slug(workout.name || 'combo')}-combo.png`, comboLabel(zone), `${comboLabel(zone)} — ${sum.hits}/${sum.shots} targets`)
}
