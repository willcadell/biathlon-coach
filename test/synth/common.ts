// Shared pieces for the synthetic-data experiment (see test/synth/README in
// the commit message): rectifying a photo into the flat target plane using the
// same black-circle fit the app uses, and mapping between that plane and the
// photo. Everything here runs in Node on Jimp bitmaps, no DOM.
import { Jimp } from 'jimp'
import { locateBlack } from '../../src/lib/blackLocator'
import { faceById, type TargetFace } from '../../src/lib/types'
import { ringRadii } from '../../src/lib/scoring'
import type { EvalTarget } from '../cv-eval'

export const WORK_EDGE = 640
/** Rectified pixels per millimetre of target. */
export const PX_PER_MM = 4

export interface BlackFit { cx: number; cy: number; semiMajor: number; semiMinor: number; rotationDeg: number }

export interface Rectified {
  label: string
  /** Luminance, size x size, row-major, 0-255 (normalised per photo). */
  gray: Float32Array
  size: number
  /** Half extent in mm that the square covers. */
  halfMm: number
  face: TargetFace
  /** The fit used, in original-photo pixels. */
  black: BlackFit
  original: { width: number; height: number; data: Buffer | Uint8Array }
}

export function faceExtents(face: TargetFace) {
  const outer = ringRadii(face).at(-1) ?? face.blackMm / 2
  const halfMm = outer * 1.08
  return { outer, halfMm, size: Math.round(halfMm * 2 * PX_PER_MM) }
}

/** The photo pixel for a target-plane point (mm, x right, y up) — the inverse of
 *  geometry.toTargetPlane, in the photo's own pixel units. */
export function planeToPhoto(X: number, Y: number, black: BlackFit, blackMm: number): { x: number; y: number } {
  const mmPerUnit = blackMm / 2 / black.semiMajor
  const ux = X / mmPerUnit
  const uy = Y / mmPerUnit
  const t = (black.rotationDeg * Math.PI) / 180
  const cos = Math.cos(t), sin = Math.sin(t)
  const along = ux * cos + uy * sin
  const acrossFixed = -ux * sin + uy * cos
  const stretch = black.semiMinor > 1e-6 ? black.semiMajor / black.semiMinor : 1
  const across = acrossFixed / stretch
  const dx = along * cos - across * sin
  const dy = along * sin + across * cos
  return { x: black.cx + dx, y: black.cy - dy }
}

function sampleGray(data: Uint8Array | Buffer, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return -1
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1)
  const fx = x - x0, fy = y - y0
  const g = (xx: number, yy: number) => {
    const p = (yy * w + xx) * 4
    return data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114
  }
  return (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy
}

export async function rectify(target: EvalTarget): Promise<Rectified | null> {
  const face = faceById(target.targetFaceId)
  const original = await Jimp.read(target.photoPath)
  const W = original.bitmap.width, H = original.bitmap.height
  const scale = Math.min(1, WORK_EDGE / Math.max(W, H))
  const work = original.clone().resize({ w: Math.round(W * scale), h: Math.round(H * scale) })
  const b = locateBlack({ width: work.bitmap.width, height: work.bitmap.height, data: work.bitmap.data })
  if (!b) return null
  const back = 1 / scale
  const black: BlackFit = { cx: b.cx * back, cy: b.cy * back, semiMajor: b.semiMajor * back, semiMinor: b.semiMinor * back, rotationDeg: b.rotationDeg }
  const { halfMm, size } = faceExtents(face)
  const gray = new Float32Array(size * size)
  const c = size / 2
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const X = (u + 0.5 - c) / PX_PER_MM
      const Y = (c - (v + 0.5)) / PX_PER_MM
      const p = planeToPhoto(X, Y, black, face.blackMm)
      const s = sampleGray(original.bitmap.data, W, H, p.x, p.y)
      gray[v * size + u] = s < 0 ? 128 : s
    }
  }
  normalise(gray, size)
  return { label: target.label, gray, size, halfMm, face, black, original: { width: W, height: H, data: original.bitmap.data } }
}

/** Stretch luminance so the printed black reads ~25 and the paper ~225,
 *  using percentiles inside the face disc, so lighting differences between
 *  photos don't show up as differences between sheets. */
export function normalise(gray: Float32Array, size: number) {
  const vals: number[] = []
  const c = size / 2
  for (let v = 0; v < size; v += 3) for (let u = 0; u < size; u += 3) {
    if (Math.hypot(u - c, v - c) < c * 0.92) vals.push(gray[v * size + u])
  }
  vals.sort((a, b) => a - b)
  const lo = vals[Math.floor(vals.length * 0.08)]
  const hi = vals[Math.floor(vals.length * 0.92)]
  const k = (225 - 25) / Math.max(1, hi - lo)
  for (let i = 0; i < gray.length; i++) gray[i] = Math.max(0, Math.min(255, 25 + (gray[i] - lo) * k))
}

export async function saveGray(path: string, gray: Float32Array, size: number) {
  const img = new Jimp({ width: size, height: size, color: 0xffffffff })
  for (let i = 0; i < gray.length; i++) {
    const g = Math.max(0, Math.min(255, Math.round(gray[i])))
    const p = i * 4
    img.bitmap.data[p] = g; img.bitmap.data[p + 1] = g; img.bitmap.data[p + 2] = g; img.bitmap.data[p + 3] = 255
  }
  await img.write(path as `${string}.png`)
}
