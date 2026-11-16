/**
 * The pure parts of the trained hole-finding model: warping a photo into the flat target plane, turning the
 * network's output into hole positions, and converting them back to the photo. No DOM and no runtime here, so the
 * same code runs in the app (holeModel.ts), in tests, and in the parity check against the Python training code
 * (ml/train.py, ml/export_dataset.ts), which these functions deliberately mirror step for step.
 *
 * The network reads the target in the plane at 4 px per mm (so a hole is about 22 px across wherever the photo was
 * taken from), as luminance with the printed black stretched to about 25 and the paper to about 225, and returns a
 * heatmap of hole centres at half resolution.
 */
import type { TargetFace } from './types'
import { ringRadii } from './scoring'

/** Rectified pixels per millimetre of target. */
export const PX_PER_MM = 4
/** The heatmap is this many rectified pixels per cell. */
export const STRIDE = 2
/** A heatmap peak at or above this is a hole. Fixed before the model was scored, not tuned on it. */
export const THRESHOLD = 0.5
/** Faces the model has been trained and checked on. Anything else keeps using the classic detector. */
export const MODEL_FACES = ['issf-50m']

export interface PhotoPixels {
  width: number
  height: number
  /** RGBA, 4 bytes a pixel, row-major. */
  data: Uint8Array | Uint8ClampedArray
}

/** The aiming mark's fit in the photo, in photo pixels. */
export interface PhotoFit {
  cx: number
  cy: number
  semiMajor: number
  semiMinor: number
  rotationDeg: number
}

export interface PlaneView {
  /** Side of the square view, px. */
  size: number
  /** Radius of the outermost scoring ring, mm. */
  outerMm: number
}

/** The square view of the target: the outermost scoring ring plus 8%. */
export function viewFor(face: TargetFace): PlaneView {
  const outerMm = ringRadii(face).at(-1) ?? face.blackMm / 2
  return { size: Math.round(outerMm * 1.08 * 2 * PX_PER_MM), outerMm }
}

/** The photo pixel for a target-plane point (mm, x right, y up): the inverse of geometry.toTargetPlane. */
export function planeToPhoto(X: number, Y: number, fit: PhotoFit, blackMm: number): { x: number; y: number } {
  const mmPerUnit = blackMm / 2 / fit.semiMajor
  const ux = X / mmPerUnit
  const uy = Y / mmPerUnit
  const t = (fit.rotationDeg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const along = ux * cos + uy * sin
  const acrossFixed = -ux * sin + uy * cos
  const stretch = fit.semiMinor > 1e-6 ? fit.semiMajor / fit.semiMinor : 1
  const across = acrossFixed / stretch
  const dx = along * cos - across * sin
  const dy = along * sin + across * cos
  return { x: fit.cx + dx, y: fit.cy - dy }
}

function luminance(data: Uint8Array | Uint8ClampedArray, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return -1
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const g = (xx: number, yy: number) => {
    const p = (yy * w + xx) * 4
    return data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114
  }
  return (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy
}

/** Stretches luminance so the printed black reads about 25 and the paper about 225, from percentiles inside the
 *  face disc, so differences in lighting between photos do not show up as differences between sheets. Rounds to whole
 *  levels, as the training images (8-bit PNGs) were. */
export function normalise(gray: Float32Array, size: number): void {
  const vals: number[] = []
  const c = size / 2
  for (let v = 0; v < size; v += 3) {
    for (let u = 0; u < size; u += 3) {
      if (Math.hypot(u - c, v - c) < c * 0.92) vals.push(gray[v * size + u])
    }
  }
  vals.sort((a, b) => a - b)
  const lo = vals[Math.floor(vals.length * 0.08)]
  const hi = vals[Math.floor(vals.length * 0.92)]
  const k = (225 - 25) / Math.max(1, hi - lo)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.round(Math.max(0, Math.min(255, 25 + (gray[i] - lo) * k)))
  }
}

/** The photo warped into the target plane (4 px per mm), as normalised luminance, 0-255, row-major, size x size. */
export function rectify(photo: PhotoPixels, fit: PhotoFit, face: TargetFace): { gray: Float32Array; size: number } {
  const { size } = viewFor(face)
  const gray = new Float32Array(size * size)
  const c = size / 2
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const p = planeToPhoto((u + 0.5 - c) / PX_PER_MM, (c - (v + 0.5)) / PX_PER_MM, fit, face.blackMm)
      const s = luminance(photo.data, photo.width, photo.height, p.x, p.y)
      gray[v * size + u] = s < 0 ? 128 : s
    }
  }
  normalise(gray, size)
  return { gray, size }
}

/** What the network is fed: the view as (pixel / 255 - 0.5) / 0.25, edge-padded to a multiple of 8 on each side. */
export function modelInput(gray: Float32Array, size: number): { data: Float32Array; width: number; height: number } {
  const padded = Math.ceil(size / 8) * 8
  const data = new Float32Array(padded * padded)
  for (let y = 0; y < padded; y++) {
    const sy = Math.min(y, size - 1)
    for (let x = 0; x < padded; x++) {
      data[y * padded + x] = (gray[sy * size + Math.min(x, size - 1)] / 255 - 0.5) / 0.25
    }
  }
  return { data, width: padded, height: padded }
}

export interface Peak {
  /** Rectified pixels, continuous (a pixel's centre is at +0.5). */
  u: number
  v: number
  score: number
}

/**
 * The holes in a heatmap: local maxima over a 5 x 5 window above `threshold`, each placed at the score-weighted centre
 * of its window. `logits` is the network's raw output, `cols` cells wide; only the first `useCols` x `useRows`
 * cells (the part that covers the real view, not the padding) are read. Strongest first.
 */
export function findPeaks(logits: Float32Array, cols: number, useCols: number, useRows: number, threshold = THRESHOLD): Peak[] {
  const p = new Float32Array(useCols * useRows)
  for (let y = 0; y < useRows; y++) {
    for (let x = 0; x < useCols; x++) p[y * useCols + x] = 1 / (1 + Math.exp(-logits[y * cols + x]))
  }
  const out: Peak[] = []
  for (let y = 0; y < useRows; y++) {
    for (let x = 0; x < useCols; x++) {
      const v = p[y * useCols + x]
      if (v <= threshold) continue
      const y0 = Math.max(0, y - 2)
      const y1 = Math.min(useRows, y + 3)
      const x0 = Math.max(0, x - 2)
      const x1 = Math.min(useCols, x + 3)
      let isMax = true
      let sum = 0
      let sx = 0
      let sy = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const w = p[yy * useCols + xx]
          if (w > v) isMax = false
          sum += w
          sx += w * (xx + 0.5)
          sy += w * (yy + 0.5)
        }
      }
      if (isMax) out.push({ u: (sx / sum) * STRIDE, v: (sy / sum) * STRIDE, score: v })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Drops anything outside the outermost scoring ring (plus 2 mm): handwriting and the score table in the margin are not
 *  holes. Keeps at most `maxShots` of the strongest, when the bout's shot count is known. */
export function onTarget(peaks: Peak[], view: PlaneView, maxShots?: number): Peak[] {
  const c = view.size / 2
  const limit = (view.outerMm + 2) * PX_PER_MM
  const kept = peaks.filter((p) => Math.hypot(p.u - c, p.v - c) <= limit)
  return maxShots && kept.length > maxShots ? kept.slice(0, maxShots) : kept
}

/** A peak as a position in the photo, in pixels. */
export function peakToPhoto(peak: Peak, view: PlaneView, fit: PhotoFit, blackMm: number): { x: number; y: number } {
  const c = view.size / 2
  return planeToPhoto((peak.u - c) / PX_PER_MM, (c - peak.v) / PX_PER_MM, fit, blackMm)
}
