/**
 * Deterministic, non-AI location of a target's black aiming mark.
 *
 * Claude vision guessing the ring's position was the least reliable part of
 * the detection pipeline — occasionally wildly wrong on an easy, high-
 * contrast photo, and never twice the same way. Finding "the largest solid
 * dark blob in the photo" is a much older and better-understood problem:
 * threshold, label connected regions, fit an ellipse to the winner. Same
 * answer every time, no API call, no cost.
 *
 * Operates on a plain RGBA pixel buffer (a canvas ImageData's `.data`, or an
 * equivalent from any other decoder), so this file has no dependency on the
 * DOM and can be exercised from a Node test script against real photos.
 */

export interface PixelBuffer {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel, row-major — the same layout as ImageData.data. */
  data: Uint8ClampedArray | Uint8Array
}

export interface LocatedBlack {
  /** Pixel coordinates in the buffer that was searched. */
  cx: number
  cy: number
  semiMajor: number
  semiMinor: number
  /** Degrees clockwise from horizontal, matching `Bull.rotationDeg`. */
  rotationDeg: number
  /** Pixel count of the winning region, as a fraction of the whole image —
   *  how big the black is, for a caller that wants to sanity-check it. */
  areaFrac: number
  /** How completely the region fills its own fitted ellipse, 0..1. A solid
   *  disc is close to 1; a scatter of pen strokes or text is much lower.
   *  Kept on the result so a caller can see why a candidate was accepted. */
  fillRatio: number
}

/** Below this, a dark region is noise — a staple hole, a stray pixel, a
 *  full stop — not worth fitting an ellipse to at all. */
const MIN_AREA_FRAC = 0.01
/** Below this fill ratio a region is a scribble or an outline, not a solid
 *  disc: chosen from real photos where handwriting and hand-drawn circles
 *  around unrelated holes never exceeded about 0.3, and the true black —
 *  even torn, shadowed, or half off-frame — never fell below 0.6. */
const MIN_FILL_RATIO = 0.55
/** Above this, an enclosed light region is a real background feature — the
 *  gap between two concentric scoring rings, say — not a shot's flash or a
 *  fleck of glare. Every printed ring is itself a closed loop, so the white
 *  band between any two of them is technically "enclosed" too; only a size
 *  cutoff tells that apart from a hole actually worth filling. */
const MAX_HOLE_AREA_FRAC = 0.02

function toGray(data: PixelBuffer['data'], width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0
  }
  return gray
}

/** Otsu's method: the luminance threshold that best splits the image into
 *  two populations, found by maximising the variance between them. Adapts
 *  to each photo's own lighting instead of a fixed brightness cutoff, which
 *  is what makes this work across sun, shade, and indoor light. */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0)
  for (const v of gray) hist[v]++
  const total = gray.length

  let sumAll = 0
  for (let t = 0; t < 256; t++) sumAll += t * hist[t]

  let sumB = 0
  let weightB = 0
  let best = 0
  let bestVariance = -1

  for (let t = 0; t < 256; t++) {
    weightB += hist[t]
    if (weightB === 0) continue
    const weightF = total - weightB
    if (weightF === 0) break

    sumB += t * hist[t]
    const meanB = sumB / weightB
    const meanF = (sumAll - sumB) / weightF
    const variance = weightB * weightF * (meanB - meanF) ** 2

    if (variance > bestVariance) {
      bestVariance = variance
      best = t
    }
  }
  return best
}

export interface Labelling {
  /** Component id per pixel, -1 where the source mask was 0. */
  labels: Int32Array
  /** Pixel count per component id. */
  sizes: number[]
  /** Whether any pixel of that component sits on the image's own edge. */
  touchesBorder: boolean[]
}

/** Generic 4-connected component labelling, used for both the dark regions
 *  and the light "gaps" between and inside them — the two are the same
 *  problem run on an inverted mask. */
export function labelComponents(mask: Uint8Array, width: number, height: number): Labelling {
  const labels = new Int32Array(width * height).fill(-1)
  const sizes: number[] = []
  const touchesBorder: boolean[] = []
  const stack = new Int32Array(width * height)

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue
    const id = sizes.length
    let count = 0
    let border = false
    let sp = 0
    stack[sp++] = start
    labels[start] = id

    while (sp > 0) {
      const idx = stack[--sp]
      const x = idx % width
      const y = (idx / width) | 0
      count++
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) border = true

      if (y > 0 && mask[idx - width] && labels[idx - width] === -1) { labels[idx - width] = id; stack[sp++] = idx - width }
      if (y < height - 1 && mask[idx + width] && labels[idx + width] === -1) { labels[idx + width] = id; stack[sp++] = idx + width }
      if (x > 0 && mask[idx - 1] && labels[idx - 1] === -1) { labels[idx - 1] = id; stack[sp++] = idx - 1 }
      if (x < width - 1 && mask[idx + 1] && labels[idx + 1] === -1) { labels[idx + 1] = id; stack[sp++] = idx + 1 }
    }
    sizes.push(count)
    touchesBorder.push(border)
  }
  return { labels, sizes, touchesBorder }
}

interface RegionStats {
  count: number
  sumX: number
  sumY: number
  sumXX: number
  sumYY: number
  sumXY: number
  /** Same moments, but only over pixels that face the region's own true
   *  outer edge — see fitBoundaryEllipse for why this fit exists at all. */
  boundaryCount: number
  bSumX: number
  bSumY: number
  bSumXX: number
  bSumYY: number
  bSumXY: number
}

const zeroStats = (): RegionStats => ({
  count: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0,
  boundaryCount: 0, bSumX: 0, bSumY: 0, bSumXX: 0, bSumYY: 0, bSumXY: 0,
})

/**
 * Turn a region's raw pixel moments into an ellipse.
 *
 * This is the filled-disc relationship, not the scatter-of-points one used
 * elsewhere for shot groups (`groupEllipse`): for a uniformly filled ellipse
 * with semi-axes a, b, the variance of its own pixels along the major axis
 * is a²/4 and along the minor axis b²/4 — the standard second moment of a
 * disc — so the semi-axes come back out as twice the standard deviation,
 * not one times it.
 */
function fitFilledEllipse(r: RegionStats) {
  const cx = r.sumX / r.count
  const cy = r.sumY / r.count
  const sxx = r.sumXX / r.count - cx * cx
  const syy = r.sumYY / r.count - cy * cy
  const sxy = r.sumXY / r.count - cx * cy

  const mean = (sxx + syy) / 2
  const diff = (sxx - syy) / 2
  const root = Math.sqrt(diff * diff + sxy * sxy)
  const l1 = Math.max(mean + root, 0)
  const l2 = Math.max(mean - root, 0)
  const semiMajor = 2 * Math.sqrt(l1)
  const semiMinor = 2 * Math.sqrt(l2)
  const rotationDeg = (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI)

  return { cx, cy, semiMajor, semiMinor, rotationDeg }
}

/**
 * Same idea as fitFilledEllipse, but fit to only the pixels sitting on the
 * region's own true outer edge, not its whole filled area.
 *
 * A filled-area fit is a fit to where the *mass* of the region sits, so
 * anything missing from the interior — a cluster of shots too big to count
 * as a small hole, a scatter of white ring-value numbers, whatever glare
 * didn't get thresholded cleanly — quietly drags the centre and axes
 * toward whatever's left. A good shooter's group blows out the middle of
 * the black entirely, which is exactly this problem at its worst. The
 * printed ring itself never moves, though, and its edge is exactly what's
 * real regardless of what happened inside it — fitting to boundary pixels
 * alone locks onto that edge and stays unaffected by anything happening in
 * the interior, at the cost of tolerating a boundary that isn't a perfect
 * ellipse (real photos vary; a shot that breaks through the printed ring
 * line puts a genuine notch in the true edge, not just an artefact of
 * thresholding).
 *
 * The scale factor differs from the filled version for the same reason
 * `groupEllipse` differs from both: a curve traced out at parameter angle θ
 * (x = a·cosθ) has variance a²/2 along its own major axis, not a²/4 (a
 * filled disc) or a² (a scatter of independent points).
 */
function fitBoundaryEllipse(r: RegionStats) {
  const cx = r.bSumX / r.boundaryCount
  const cy = r.bSumY / r.boundaryCount
  const sxx = r.bSumXX / r.boundaryCount - cx * cx
  const syy = r.bSumYY / r.boundaryCount - cy * cy
  const sxy = r.bSumXY / r.boundaryCount - cx * cy

  const mean = (sxx + syy) / 2
  const diff = (sxx - syy) / 2
  const root = Math.sqrt(diff * diff + sxy * sxy)
  const l1 = Math.max(mean + root, 0)
  const l2 = Math.max(mean - root, 0)
  const semiMajor = Math.sqrt(2 * l1)
  const semiMinor = Math.sqrt(2 * l2)
  const rotationDeg = (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI)

  return { cx, cy, semiMajor, semiMinor, rotationDeg }
}

/**
 * Find the black aiming mark in an image, or null if nothing on the sheet
 * looks like one.
 *
 * Deliberately single-answer: today's scope is one bull per precision
 * sheet, so this returns the single largest solid dark region rather than a
 * list — a multi-bull zeroing card is a different, harder shape problem for
 * another day.
 */
export function locateBlack(image: PixelBuffer): LocatedBlack | null {
  const { width, height } = image
  const totalPx = width * height
  const gray = toGray(image.data, width, height)
  // Otsu alone can be pulled upward by a cast shadow on the paper — a third,
  // mid-grey population sitting between white and true black skews where
  // the two-class split lands. Printed target ink is reliably very dark
  // regardless of lighting, so capping the cutoff keeps merely-shadowed
  // paper out of the "dark" mask even when Otsu alone would include it.
  const threshold = Math.min(otsuThreshold(gray), 110)

  const dark = new Uint8Array(totalPx)
  // <= not <: Otsu's t is the last grey level assigned to the dark class,
  // not a value strictly between the two classes, so a pixel sitting
  // exactly at that level (common on a flat, noiseless block of colour) is
  // still dark. Real photos almost always have enough JPEG noise to blur
  // past this, but it should be correct either way.
  for (let i = 0; i < gray.length; i++) dark[i] = gray[i] <= threshold ? 1 : 0

  // Every non-dark pixel is either true background or a gap trapped inside
  // a dark shape — labelled the same way as the dark regions themselves,
  // on the inverted mask, so each one can be sized and checked for whether
  // it touches the image edge.
  const notDark = new Uint8Array(totalPx)
  for (let i = 0; i < totalPx; i++) notDark[i] = dark[i] ? 0 : 1
  const gaps = labelComponents(notDark, width, height)

  // A gap gets folded into the dark mask only if it's both enclosed (never
  // reaches the image border) and small — see MAX_HOLE_AREA_FRAC for why
  // enclosure alone isn't enough: the ring lines outside the black enclose
  // gaps of their own that must stay open.
  const maxHolePx = totalPx * MAX_HOLE_AREA_FRAC
  const fillGap = gaps.sizes.map((size, id) => !gaps.touchesBorder[id] && size <= maxHolePx)

  const filled = new Uint8Array(totalPx)
  for (let i = 0; i < totalPx; i++) {
    const gapId = gaps.labels[i]
    filled[i] = dark[i] || (gapId >= 0 && fillGap[gapId]) ? 1 : 0
  }

  const regions = labelComponents(filled, width, height)

  // For every gap that stayed open, which region(s) border it? One that
  // touches exactly one region — and never the image edge — is a hole
  // purely inside that region's own interior (too big to fill, but still
  // not a real edge), so its rim must not count toward that region's
  // boundary fit. A gap between two separate objects, or open to the image
  // edge, borders real background and does count.
  const gapRegions: Set<number>[] = gaps.sizes.map(() => new Set<number>())
  for (let i = 0; i < totalPx; i++) {
    const gapId = gaps.labels[i]
    if (gapId < 0 || fillGap[gapId]) continue
    const x = i % width
    const y = (i / width) | 0
    const note = (j: number) => { if (filled[j]) gapRegions[gapId].add(regions.labels[j]) }
    if (y > 0) note(i - width)
    if (y < height - 1) note(i + width)
    if (x > 0) note(i - 1)
    if (x < width - 1) note(i + 1)
  }
  const gapIsInternalHole = gaps.sizes.map(
    (_, id) => !fillGap[id] && !gaps.touchesBorder[id] && gapRegions[id].size === 1,
  )

  // One pass over every dark pixel accumulates both the filled-area moments
  // (candidate selection runs on these) and the boundary-only moments (the
  // winner's final geometry comes from these instead).
  const stats: RegionStats[] = Array.from({ length: regions.sizes.length }, zeroStats)
  for (let i = 0; i < totalPx; i++) {
    const id = regions.labels[i]
    if (id < 0) continue
    const x = i % width
    const y = (i / width) | 0
    const r = stats[id]
    r.count++
    r.sumX += x; r.sumY += y; r.sumXX += x * x; r.sumYY += y * y; r.sumXY += x * y

    const facesRealExterior = (inBounds: boolean, j: number) => {
      if (!inBounds) return true
      if (filled[j]) return false
      return !gapIsInternalHole[gaps.labels[j]]
    }
    const isBoundary =
      facesRealExterior(y > 0, i - width) ||
      facesRealExterior(y < height - 1, i + width) ||
      facesRealExterior(x > 0, i - 1) ||
      facesRealExterior(x < width - 1, i + 1)
    if (isBoundary) {
      r.boundaryCount++
      r.bSumX += x; r.bSumY += y; r.bSumXX += x * x; r.bSumYY += y * y; r.bSumXY += x * y
    }
  }

  // Selection (is this region big enough, solid enough, the biggest so far)
  // runs on the filled-area fit — that's what area and fill ratio are
  // defined against. Only the winner's final geometry switches to the
  // boundary fit, which is the more accurate answer but not one there's a
  // reason to compute for every rejected candidate.
  const minArea = totalPx * MIN_AREA_FRAC
  let bestStats: RegionStats | null = null
  let bestAreaFrac = 0
  let bestFillRatio = 0
  for (const r of stats) {
    if (r.count < minArea) continue
    const { semiMajor, semiMinor } = fitFilledEllipse(r)
    if (semiMajor < 1e-6) continue
    const idealArea = Math.PI * semiMajor * semiMinor
    const fillRatio = r.count / idealArea
    if (fillRatio < MIN_FILL_RATIO) continue

    const areaFrac = r.count / totalPx
    if (!bestStats || areaFrac > bestAreaFrac) {
      bestStats = r
      bestAreaFrac = areaFrac
      bestFillRatio = fillRatio
    }
  }
  if (!bestStats || bestStats.boundaryCount === 0) return null

  const { cx, cy, semiMajor, semiMinor, rotationDeg } = fitBoundaryEllipse(bestStats)
  return { cx, cy, semiMajor, semiMinor, rotationDeg, areaFrac: bestAreaFrac, fillRatio: bestFillRatio }
}
