import type { Bull, ImagePoint } from './types'
import { locateBlack } from './blackLocator'
import { locateHoles } from './holeLocator'
import { fromCropFraction, type CropRect } from './geometry'

/** Longest edge the vision model is sent. Bigger costs more and reads no better. */
const API_MAX_EDGE = 1568
/** Longest edge kept on disk, so a season of targets does not fill the phone. */
const STORE_MAX_EDGE = 1400
const THUMB_EDGE = 320
/** Longest edge for the deterministic black-locator: no benefit to full
 *  resolution since it works from raw pixel thresholds, not fine detail. */
const LOCATE_MAX_EDGE = 640
/** Longest edge for the deterministic hole-locator — holes are much smaller
 *  features than the bull, so this needs real detail behind it. */
const HOLES_MAX_EDGE = 1400

async function draw(file: Blob, maxEdge: number, quality: number, square = false): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const side = square ? Math.min(w, h) : 0
  const canvas = document.createElement('canvas')
  canvas.width = square ? side : w
  canvas.height = square ? side : h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  if (square) ctx.drawImage(bitmap, (w - side) / -2, (h - side) / -2, w, h)
  else ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      quality,
    )
  })
}

export const forStorage = (file: Blob) => draw(file, STORE_MAX_EDGE, 0.82)

/** Width divided by height. Everything downstream measures in width units. */
export async function aspectOf(file: Blob): Promise<number> {
  const bitmap = await createImageBitmap(file)
  const aspect = bitmap.width / bitmap.height
  bitmap.close()
  return aspect > 0 ? aspect : 1
}
export const forThumb = (file: Blob) => draw(file, THUMB_EDGE, 0.7, true)

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** Base64 JPEG sized for the vision call, without the data: prefix. */
export async function forVision(file: Blob): Promise<string> {
  return toBase64(await draw(file, API_MAX_EDGE, 0.9))
}

/**
 * Cut a region out of the ORIGINAL photo — not a copy already downscaled for
 * storage — and size that crop up to the vision limit on its own.
 *
 * This is what actually buys back resolution: a crop tight around one aiming
 * mark, taken from the full-resolution camera capture, puts far more real
 * pixels on each hole than the same hole gets sitting in a whole-sheet photo
 * capped at the same API limit.
 *
 * `rect` is in the app's width-unit coordinates (a fraction of the image
 * WIDTH on both axes), matching every other coordinate in this app — so the
 * pixel rectangle is `rect * bitmap.width` on both axes, not `* height`.
 */
export async function cropForVision(
  file: Blob,
  rect: { x0: number; y0: number; x1: number; y1: number },
  maxEdge = API_MAX_EDGE,
  quality = 0.92,
): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const w = bitmap.width
  const sx = Math.round(rect.x0 * w)
  const sy = Math.round(rect.y0 * w)
  const sw = Math.max(1, Math.round((rect.x1 - rect.x0) * w))
  const sh = Math.max(1, Math.round((rect.y1 - rect.y0) * w))
  const scale = Math.min(1, maxEdge / Math.max(sw, sh))
  const dw = Math.max(1, Math.round(sw * scale))
  const dh = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = dw
  canvas.height = dh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode crop'))), 'image/jpeg', quality)
  })
  return toBase64(blob)
}

/**
 * Find the black aiming mark with classical image processing rather than
 * asking Claude to eyeball its coordinates — see blackLocator.ts for why.
 * Returns null when nothing on the sheet looks like a solid aiming mark, so
 * the caller can fall back to a whole-image read or a manual placeholder.
 */
export async function locateBlackInBlob(file: Blob): Promise<Bull | null> {
  const working = await draw(file, LOCATE_MAX_EDGE, 0.85)
  const bitmap = await createImageBitmap(working)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const result = locateBlack({ width, height, data })
  if (!result) return null

  return {
    id: 'bull-1',
    // Width-fraction units throughout this app: dividing by the working
    // canvas's own width is equivalent to dividing by the original image's,
    // since draw() only ever scales both dimensions together.
    centre: { x: result.cx / width, y: result.cy / width },
    semiMajor: result.semiMajor / width,
    semiMinor: result.semiMinor / width,
    rotationDeg: result.rotationDeg,
    holes: [],
  }
}

/**
 * Find bullet holes with classical image processing rather than Claude —
 * see holeLocator.ts. Experimental: unlike the black-locator, this one
 * isn't yet reliable enough to be the default, hence the separate opt-in
 * path rather than folding straight into detectShots.
 *
 * Crops the ORIGINAL full-resolution photo tight around the aiming mark
 * (the same rect the Claude-based reader would use) so holes get real
 * pixels behind them, then reports each candidate back in the full image's
 * own width-fraction coordinates via the same crop-remap math the Claude
 * path uses.
 */
export async function locateHolesInBlob(
  file: Blob,
  rect: CropRect,
  bull: Pick<Bull, 'centre' | 'semiMajor' | 'semiMinor' | 'rotationDeg'>,
  aimingMarkMm: number,
  bulletDiameterMm: number,
  /** Each printed ring's radius as a fraction of the black's own radius —
   *  lets the hole-locator recognise and exclude a printed ring-value
   *  digit rather than mistake it for a hole. */
  ringRadiiFrac: number[] = [],
): Promise<{ holes: ImagePoint[]; ambiguous: boolean[] }> {
  const bitmap = await createImageBitmap(file)
  const w = bitmap.width
  const sx = Math.round(rect.x0 * w)
  const sy = Math.round(rect.y0 * w)
  const sw = Math.max(1, Math.round((rect.x1 - rect.x0) * w))
  const sh = Math.max(1, Math.round((rect.y1 - rect.y0) * w))
  const scale = Math.min(1, HOLES_MAX_EDGE / Math.max(sw, sh))
  const dw = Math.max(1, Math.round(sw * scale))
  const dh = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = dw
  canvas.height = dh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh)
  bitmap.close()

  const { data } = ctx.getImageData(0, 0, dw, dh)

  // Width-fraction lengths/positions to the crop's own resized pixel space:
  // one width-fraction unit is dw / (rect.x1 - rect.x0) pixels here, the
  // same conversion factor on both axes (draw() never stretches one axis
  // relative to the other).
  const pxPerUnit = dw / (rect.x1 - rect.x0)
  const bullPx = {
    cx: (bull.centre.x - rect.x0) * pxPerUnit,
    cy: (bull.centre.y - rect.y0) * pxPerUnit,
    semiMajor: bull.semiMajor * pxPerUnit,
    semiMinor: bull.semiMinor * pxPerUnit,
    rotationDeg: bull.rotationDeg,
  }
  const expectedHoleRadiusPx = (bulletDiameterMm / 2) * (bullPx.semiMajor / (aimingMarkMm / 2))

  const candidates = locateHoles({ width: dw, height: dh, data }, bullPx, expectedHoleRadiusPx, ringRadiiFrac)
  return {
    holes: candidates.map((c) => fromCropFraction(rect, c.cx / dw, c.cy / dh)),
    ambiguous: candidates.map((c) => c.ambiguous),
  }
}
