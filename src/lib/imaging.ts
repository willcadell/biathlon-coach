/** Longest edge the vision model is sent. Bigger costs more and reads no better. */
const API_MAX_EDGE = 1568
/** Longest edge kept on disk, so a season of targets does not fill the phone. */
const STORE_MAX_EDGE = 1400
const THUMB_EDGE = 320

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
