/**
 * Finds the holes on a precision target with the trained model, running on this device: no Claude call, no key, no
 * connection once the model has been fetched once. See docs/vision-model-plan.md and holeModelCore.ts.
 *
 * The runtime (onnxruntime-web, a 14 MB WebAssembly file) and the model (under 1 MB) are fetched only when a target
 * is first scored, never with the rest of the app, and the service worker keeps them for use at a range with no signal.
 * The network runs in a web worker (holeWorker.ts) so the screen stays responsive. Only called through detectShots,
 * which falls back to the classic detector if anything here fails.
 */
import type { Detection } from './types'
import { faceById } from './types'
import { forStorage, locateBlackInBlob } from './imaging'
import {
  MODEL_FACES, STRIDE, findPeaks, modelInput, onTarget, peakToPhoto, rectify, viewFor, type PhotoFit, type PhotoPixels,
} from './holeModelCore'

type Reply = { id: number; ok?: true; logits?: Float32Array; error?: string }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (r: Reply) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./holeWorker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<Reply>) => {
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    if (e.data.error) p.reject(new Error(e.data.error))
    else p.resolve(e.data)
  }
  // A worker that dies (no WebAssembly, a blocked script) fails every waiting call, and the next call starts a fresh one.
  w.onerror = (e) => {
    const err = new Error(e.message || 'The model worker failed')
    for (const p of pending.values()) p.reject(err)
    pending.clear()
    w.terminate()
    worker = null
  }
  worker = w
  return w
}

function ask(message: { kind: 'warm' } | { kind: 'run'; input: Float32Array; height: number; width: number }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    const transfer = message.kind === 'run' ? [message.input.buffer] : []
    getWorker().postMessage({ id, ...message }, transfer)
  })
}

/** Starts fetching the model in the background, so the first target scored is not waiting on a download. Skipped on a
 *  connection that asks to save data or is very slow: the download is 15 MB and happens once, at first use. */
export function warmUpHoleModel(): void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return
  void ask({ kind: 'warm' }).catch(() => undefined)
}

async function pixelsOf(blob: Blob): Promise<PhotoPixels> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { data, width, height }
}

/**
 * Detects the holes with the trained model. Returns null where the model does not apply (a target face it has not
 * been trained on) or the aiming mark cannot be found, so the caller can use the classic detector instead.
 */
export async function detectWithModel(file: Blob, faceId: string, expectedShots: number): Promise<Detection | null> {
  if (!MODEL_FACES.includes(faceId)) return null
  const face = faceById(faceId)

  // The model was trained on photos in the form the app keeps them (1400 px, JPEG), so it reads the same form.
  const photo = await forStorage(file)
  const bull = await locateBlackInBlob(photo)
  if (!bull) return null
  const pixels = await pixelsOf(photo)
  const W = pixels.width
  // The app's fractions are of the image's width on both axes.
  const fit: PhotoFit = {
    cx: bull.centre.x * W, cy: bull.centre.y * W, semiMajor: bull.semiMajor * W, semiMinor: bull.semiMinor * W, rotationDeg: bull.rotationDeg,
  }

  const { gray, size } = rectify(pixels, fit, face)
  const input = modelInput(gray, size)
  const reply = await ask({ kind: 'run', input: input.data, height: input.height, width: input.width })
  const logits = reply.logits as Float32Array

  const view = viewFor(face)
  const cells = Math.floor(size / STRIDE)
  const peaks = onTarget(findPeaks(logits, input.width / STRIDE, cells, cells), view, expectedShots)
  const holes = peaks.map((p) => {
    const q = peakToPhoto(p, view, fit, face.blackMm)
    return { x: q.x / W, y: q.y / W }
  })

  const found = holes.length
  return {
    bulls: [{ ...bull, holes }],
    notes:
      'Found with the trained model on this device — no Claude call was made. Check every marker: ' +
      (found < expectedShots ? `it found ${found} of the ${expectedShots} shots, so look for a hole it missed. ` : '') +
      'where holes overlap it marks one hole, not two.',
    confidence: found === expectedShots ? 0.75 : 0.5,
  }
}
