/**
 * Deterministic, non-AI location of bullet holes around a known aiming mark.
 *
 * The bull is found first (blackLocator.ts) with real confidence — it's the
 * single largest solid dark shape on the sheet, a strong enough prior to
 * lean on completely. A hole has no equivalent prior, and it isn't even a
 * solid blob the way the black is: a torn hole is a starburst scatter of
 * bright tear-flecks around the puncture, with gaps between them that never
 * cross a brightness threshold at all. Connected-component labelling — the
 * right tool for the solid black — treats that scatter as mostly background
 * with a few disconnected specks, which is why an earlier version of this
 * file swung between finding nothing and finding everything.
 *
 * What actually works: local density. A hole-sized neighbourhood centred on
 * a real puncture has a lot of anomalous pixels in it even if they don't
 * connect; a neighbourhood over clean paper or a stray fleck of dirt
 * doesn't. Find where that density peaks, suppress peaks too close to a
 * stronger one nearby (so one hole isn't reported twice), and flag a peak
 * whose disturbed area is much wider than expected as probably two or more
 * overlapping shots rather than guess a count — the athlete corrects
 * everything by hand regardless, so a flagged starting point is a fair
 * trade for never inventing one.
 *
 * Operates on a plain RGBA pixel buffer, so this file has no DOM dependency
 * and can be exercised from a Node test script against real photos.
 */

import type { PixelBuffer } from './blackLocator'

export interface HoleCandidate {
  /** Pixel coordinates in the buffer that was searched. */
  cx: number
  cy: number
  /** True when the disturbed area here is much wider than one hole's worth
   *  — almost always two or more overlapping shots. Still reported as a
   *  single marker at its centre, but the caller should make clear it
   *  needs a look rather than presenting it as a settled reading. */
  ambiguous: boolean
}

export interface KnownBull {
  cx: number
  cy: number
  semiMajor: number
  semiMinor: number
  /** Degrees clockwise from horizontal, matching Bull.rotationDeg. */
  rotationDeg: number
}

/** A neighbourhood needs at least this fraction of its own area disturbed
 *  to count as a hole at all — chosen well below what a real puncture's
 *  scatter of tear-flecks reaches, but above what print detail or noise
 *  reaches once it's spread over an area this size. */
const MIN_DENSITY = 0.35
/** Peaks closer together than this many hole-radii are the same hole found
 *  twice, not two separate ones. */
const NMS_RADIUS_FACTOR = 1.3
/** If the disturbed area is still this dense at roughly twice the expected
 *  hole radius, it's wider than one hole and almost certainly an overlap. */
const AMBIGUOUS_RADIUS_FACTOR = 2.0
const AMBIGUOUS_DENSITY = 0.3
/** A precision bout is never more than PRECISION_SHOTS (types.ts) shots, so
 *  once there are more candidates than that, the excess is leftover noise,
 *  not real holes — cut it rather than hand the athlete a screen full of
 *  markers to delete. Candidates on the black are kept over ones further
 *  out when trimming, not just the strongest by density. Kept as a literal
 *  rather than importing the constant, since this file is deliberately
 *  DOM- and app-type-free so it can run standalone against test photos. */
const MAX_SHOTS = 10

function toGray(data: PixelBuffer['data'], width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0
  }
  return gray
}

/** True for a pixel that sits inside the bull's own printed black, false
 *  for one out on the white rings — decides which background a pixel is
 *  read against. Same rotation convention as the ellipse fits in
 *  blackLocator.ts: computed directly in raw (x, y-down) pixel space, no
 *  target-plane y-flip, since this never leaves pixel coordinates. */
function makeInsideBlackTest(bull: KnownBull): (x: number, y: number) => boolean {
  const t = (bull.rotationDeg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const a2 = bull.semiMajor * bull.semiMajor
  const b2 = bull.semiMinor * bull.semiMinor
  return (x: number, y: number) => {
    const dx = x - bull.cx
    const dy = y - bull.cy
    const along = dx * cos + dy * sin
    const across = -dx * sin + dy * cos
    return (along * along) / a2 + (across * across) / b2 <= 1
  }
}

/**
 * Maps a pixel into the bull's own frame, undoing both its rotation and its
 * perspective squash, and returns polar coordinates in units of the black's
 * own radius (1.0 sits exactly on the black's edge). In this frame the
 * printed ring geometry is the same for every photo of the same face
 * regardless of camera angle, which is what makes checking against it
 * possible at all.
 */
function makeEllipsePolar(bull: KnownBull): (x: number, y: number) => { r: number; angle: number } {
  const t = (bull.rotationDeg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  return (x: number, y: number) => {
    const dx = x - bull.cx
    const dy = y - bull.cy
    const along = dx * cos + dy * sin
    const across = (-dx * sin + dy * cos) * (bull.semiMajor / bull.semiMinor)
    return { r: Math.hypot(along, across) / bull.semiMajor, angle: Math.atan2(across, along) }
  }
}

/** How close to the black's own edge (in units of its radius) a candidate
 *  must sit to plausibly be a printed ring-value digit rather than a hole
 *  that happens to fall near one. */
const RING_LABEL_RADIUS_TOLERANCE = 0.07
/** How close to one of the four meridians (left, right, top, bottom), in
 *  radians — a standard ISSF face prints a full column of ring values
 *  above and below centre, and a full row to each side, so all four
 *  directions need checking, not just the horizontal one. */
const RING_LABEL_ANGLE_TOLERANCE = 0.28

/** Prefix sums of any per-pixel value, (width+1)×(height+1), for O(1) box
 *  sums — used both for a binary mask (density) and for raw brightness
 *  weighted by a mask (a local background average). */
function buildIntegral(values: Uint8Array | Float64Array, width: number, height: number): Float64Array {
  const stride = width + 1
  const sum = new Float64Array(stride * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += values[y * width + x]
      sum[(y + 1) * stride + (x + 1)] = sum[y * stride + (x + 1)] + rowSum
    }
  }
  return sum
}

/** Sum of the mask over a square window of half-width r centred at (cx, cy),
 *  clipped to the image, plus the pixel count actually covered — the
 *  caller divides these itself so it can tell a window that ran off the
 *  edge of the image from one that's genuinely all background. */
function boxQuery(integral: Float64Array, width: number, height: number, cx: number, cy: number, r: number) {
  const stride = width + 1
  const x0 = Math.max(0, Math.round(cx - r))
  const x1 = Math.min(width, Math.round(cx + r) + 1)
  const y0 = Math.max(0, Math.round(cy - r))
  const y1 = Math.min(height, Math.round(cy + r) + 1)
  if (x1 <= x0 || y1 <= y0) return { sum: 0, area: 0 }
  const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]
  return { sum, area: (x1 - x0) * (y1 - y0) }
}

/** Radius of the local-background average, as a multiple of the expected
 *  hole radius — wide enough that a hole or two averaged into it barely
 *  moves the estimate, narrow enough to still track a shadow or a lighting
 *  gradient crossing the photo instead of averaging straight through it.
 *  A single global background (the first version of this file) reads a
 *  whole shadowed patch as one uniform anomaly, exactly like a global
 *  brightness cutoff did for the black-locator before it moved to Otsu. */
const BG_RADIUS_FACTOR = 6
const BLACK_MARGIN = 35
const WHITE_MARGIN = 35

/**
 * Find candidate bullet holes around a known aiming mark.
 *
 * Two backgrounds, two directions of anomaly: inside the black, a hole
 * shows as torn paper lighter than the surrounding ink; out on the white
 * rings, a hole shows as a dark puncture. What "the surrounding ink" or
 * "the white paper" means is read locally, not as one number for the whole
 * photo — a phone's own shadow across part of the sheet is common enough
 * that a single global brightness figure reads the whole shadowed area as
 * disturbed, which is exactly the false-positive cluster a global-median
 * version of this function produced.
 */
export function locateHoles(
  image: PixelBuffer,
  bull: KnownBull,
  expectedHoleRadiusPx: number,
  /** Each printed ring's radius, as a fraction of the black's own radius —
   *  from `ringRadii(face)` divided by `face.blackMm / 2`. Optional: pass
   *  nothing to skip the ring-label check entirely. */
  ringRadiiFrac: number[] = [],
): HoleCandidate[] {
  const { width, height } = image
  const gray = toGray(image.data, width, height)
  const insideBlack = makeInsideBlackTest(bull)
  const ellipsePolar = makeEllipsePolar(bull)
  const looksLikeRingLabel = (x: number, y: number) => {
    const { r, angle } = ellipsePolar(x, y)
    const fromHorizontal = Math.min(Math.abs(angle), Math.abs(Math.PI - angle))
    const fromVertical = Math.min(Math.abs(angle - Math.PI / 2), Math.abs(angle + Math.PI / 2))
    if (Math.min(fromHorizontal, fromVertical) > RING_LABEL_ANGLE_TOLERANCE) return false
    return ringRadiiFrac.some((rf) => Math.abs(r - rf) <= RING_LABEL_RADIUS_TOLERANCE)
  }

  const isBlackSide = new Uint8Array(width * height)
  const blackWeighted = new Float64Array(width * height)
  const whiteWeighted = new Float64Array(width * height)
  const whiteSide = new Uint8Array(width * height)
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      if (insideBlack(x, y)) {
        isBlackSide[i] = 1
        blackWeighted[i] = gray[i]
      } else {
        whiteSide[i] = 1
        whiteWeighted[i] = gray[i]
      }
    }
  }

  const bgR = expectedHoleRadiusPx * BG_RADIUS_FACTOR
  const blackCountI = buildIntegral(isBlackSide, width, height)
  const blackSumI = buildIntegral(blackWeighted, width, height)
  const whiteCountI = buildIntegral(whiteSide, width, height)
  const whiteSumI = buildIntegral(whiteWeighted, width, height)
  const localMean = (countI: Float64Array, sumI: Float64Array, x: number, y: number, fallback: number) => {
    const { sum: count } = boxQuery(countI, width, height, x, y, bgR)
    if (count < 1) return fallback
    const { sum } = boxQuery(sumI, width, height, x, y, bgR)
    return sum / count
  }

  // A whole-image fallback for the rare window with none of one side in it
  // (e.g. right at the photo's edge) — better than treating it as background.
  let blackTotal = 0, blackN = 0, whiteTotal = 0, whiteN = 0
  for (let i = 0; i < gray.length; i++) {
    if (isBlackSide[i]) { blackTotal += gray[i]; blackN++ } else { whiteTotal += gray[i]; whiteN++ }
  }
  const blackFallback = blackN > 0 ? blackTotal / blackN : 40
  const whiteFallback = whiteN > 0 ? whiteTotal / whiteN : 220

  const anomaly = new Uint8Array(width * height)
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      if (isBlackSide[i]) {
        const localBg = localMean(blackCountI, blackSumI, x, y, blackFallback)
        anomaly[i] = gray[i] > localBg + BLACK_MARGIN ? 1 : 0
      } else {
        const localBg = localMean(whiteCountI, whiteSumI, x, y, whiteFallback)
        anomaly[i] = gray[i] < localBg - WHITE_MARGIN ? 1 : 0
      }
    }
  }

  const integral = buildIntegral(anomaly, width, height)
  const coreR = expectedHoleRadiusPx * 0.9
  const wideR = expectedHoleRadiusPx * AMBIGUOUS_RADIUS_FACTOR

  const density = (x: number, y: number, r: number) => {
    const { sum, area } = boxQuery(integral, width, height, x, y, r)
    return area > 0 ? sum / area : 0
  }

  // Candidates on a coarse grid — a hole many pixels wide doesn't need a
  // check at every single pixel to be found, and this is the expensive
  // part of the pass.
  const step = Math.max(1, Math.round(expectedHoleRadiusPx * 0.3))
  interface Peak { x: number; y: number; d: number }
  const peaks: Peak[] = []
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (looksLikeRingLabel(x, y)) continue
      const d = density(x, y, coreR)
      if (d >= MIN_DENSITY) peaks.push({ x, y, d })
    }
  }

  // Greedy non-max suppression: strongest peaks win, anything too close to
  // an already-accepted one is the same hole found again.
  peaks.sort((a, b) => b.d - a.d)
  const nmsR = expectedHoleRadiusPx * NMS_RADIUS_FACTOR
  const accepted: Peak[] = []
  for (const p of peaks) {
    if (accepted.every((a) => Math.hypot(a.x - p.x, a.y - p.y) > nmsR)) accepted.push(p)
  }

  // A precision bout is never more than a handful of shots over what the
  // bout expects, and a real shot is overwhelmingly likely to land on or
  // near the black rather than out past it — a shadow or a fold has no
  // reason to respect that boundary, which is exactly what let the
  // remaining false positives through the density and shape checks above.
  // Rank the black first, and only reach past it if there's still room.
  const ranked = accepted
    .map((p) => ({ ...p, onBlack: insideBlack(p.x, p.y) }))
    .sort((a, b) => (a.onBlack === b.onBlack ? b.d - a.d : a.onBlack ? -1 : 1))
    .slice(0, MAX_SHOTS)

  return ranked.map((p) => ({
    cx: p.x,
    cy: p.y,
    ambiguous: density(p.x, p.y, wideR) >= AMBIGUOUS_DENSITY,
  }))
}
