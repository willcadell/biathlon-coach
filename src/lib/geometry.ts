import type {
  Bull, Ellipse, ImagePoint, Point, Position, ScoringContext, Shot, BoutMetrics, SightCorrection,
  TargetFace,
} from './types'
import { faceById, HIT_ZONE_MM } from './types'
import { scoreBout, ringRadii } from './scoring'

const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * Undo camera foreshortening for one bull and convert to millimetres.
 *
 * The aiming mark is a known circle. Photographed off-axis it lands on the
 * sensor as an ellipse, and the ratio of its axes tells us exactly how much the
 * image was squashed and in which direction. Stretching the minor axis back out
 * by major/minor restores the target plane well enough for shot analysis at the
 * angles a phone held over a target actually produces.
 *
 * Returns millimetres from the bull centre, y positive UP.
 */
export function toTargetPlane(hole: ImagePoint, bull: Bull, aimingMarkMm: number): Point {
  const dx = hole.x - bull.centre.x
  // Image y grows downward; flip immediately so everything downstream is target-like.
  const dy = -(hole.y - bull.centre.y)

  // Rotate into the ellipse's own frame. The stored rotation is clockwise in
  // image space, which is counter-clockwise once y is flipped.
  const t = rad(bull.rotationDeg)
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const along = dx * cos + dy * sin
  const across = -dx * sin + dy * cos

  // Stretch the squashed axis back to circular.
  const stretch = bull.semiMinor > 1e-6 ? bull.semiMajor / bull.semiMinor : 1
  const acrossFixed = across * stretch

  // Rotate back out.
  const ux = along * cos - acrossFixed * sin
  const uy = along * sin + acrossFixed * cos

  // Scale: the semi-major axis is the true radius of the aiming mark.
  const mmPerUnit = bull.semiMajor > 1e-6 ? aimingMarkMm / 2 / bull.semiMajor : 0
  return { x: ux * mmPerUnit, y: uy * mmPerUnit }
}

/** Millimetres represented by one normalised image unit, for the record. */
export function mmPerUnitFor(bulls: Bull[], aimingMarkMm: number): number {
  const withMark = bulls.filter((b) => b.semiMajor > 1e-6)
  if (withMark.length === 0) return 0
  const mean = withMark.reduce((s, b) => s + b.semiMajor, 0) / withMark.length
  return aimingMarkMm / 2 / mean
}

/**
 * Flatten a detection into shots.
 *
 * Multi-bull targets are overlaid: each hole is measured against its own bull,
 * so five bulls with one shot each compose into one five-shot group. That is
 * how a coach reads a zeroing target, and it is the only way the group
 * statistics mean anything.
 */
export function bullsToShots(bulls: Bull[], aimingMarkMm: number): Shot[] {
  const shots: Shot[] = []
  for (const bull of bulls) {
    for (const hole of bull.holes) {
      shots.push({ order: shots.length + 1, mm: toTargetPlane(hole, bull, aimingMarkMm), bullId: bull.id })
    }
  }
  return shots
}

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export function centroid(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 }
  const sx = pts.reduce((s, p) => s + p.x, 0)
  const sy = pts.reduce((s, p) => s + p.y, 0)
  return { x: sx / pts.length, y: sy / pts.length }
}

/**
 * Group shape from the shot covariance.
 *
 * The eigenvectors of the 2x2 covariance give the long and short axes of the
 * cloud; their aspect ratio is what separates "strung out vertically" (a timing
 * or breathing fault) from "round and wide" (an unstable hold).
 */
export function groupEllipse(pts: Point[]): Ellipse {
  if (pts.length < 3) return { major: 0, minor: 0, angleDeg: 0, aspect: 1 }
  const c = centroid(pts)
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of pts) {
    const dx = p.x - c.x
    const dy = p.y - c.y
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  const n = pts.length - 1
  sxx /= n
  syy /= n
  sxy /= n

  const mean = (sxx + syy) / 2
  const diff = (sxx - syy) / 2
  const root = Math.sqrt(diff * diff + sxy * sxy)
  const l1 = Math.max(mean + root, 0)
  const l2 = Math.max(mean - root, 0)
  const major = Math.sqrt(l1)
  const minor = Math.sqrt(l2)
  const angleDeg = (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI)
  return {
    major,
    minor,
    angleDeg,
    aspect: minor > 1e-6 ? major / minor : major > 1e-6 ? 99 : 1,
  }
}

/** How far the major axis sits from vertical, 0..90 degrees. */
export function degreesFromVertical(angleDeg: number): number {
  const a = ((angleDeg % 180) + 180) % 180
  return Math.abs(90 - a)
}

/** Least-squares slope of position against firing order: mm drifted per shot. */
export function driftPerShot(shots: Shot[]): Point {
  const n = shots.length
  if (n < 3) return { x: 0, y: 0 }
  const meanT = (n + 1) / 2
  let stt = 0
  let stx = 0
  let sty = 0
  for (const s of shots) {
    const dt = s.order - meanT
    stt += dt * dt
    stx += dt * s.mm.x
    sty += dt * s.mm.y
  }
  if (stt < 1e-9) return { x: 0, y: 0 }
  return { x: stx / stt, y: sty / stt }
}

/**
 * Find a shot that does not belong to the group.
 *
 * A flier is judged against the other shots only, otherwise it drags the
 * statistics it is being measured against and hides itself.
 */
export function findFlier(shots: Shot[], hitRadius: number): number | null {
  if (shots.length < 4) return null
  let worst = { index: -1, ratio: 0 }
  for (let i = 0; i < shots.length; i++) {
    const others = shots.filter((_, j) => j !== i).map((s) => s.mm)
    const c = centroid(others)
    const mr = others.reduce((s, p) => s + dist(p, c), 0) / others.length
    const d = dist(shots[i].mm, c)
    // Thresholds chosen by simulation against five-shot Gaussian groups: at 4x
    // the leave-one-out mean radius roughly 9% of ordinary bouts trip this and
    // 58% of genuinely thrown shots are caught. Looser settings called a flier
    // in over half of all clean groups, which made the finding meaningless.
    // The floor guards against a freakishly tight group flagging everything.
    const threshold = Math.max(4 * mr, 0.5 * hitRadius)
    if (d > threshold && d / threshold > worst.ratio) worst = { index: i, ratio: d / threshold }
  }
  return worst.index >= 0 ? worst.index : null
}

export function sightCorrection(mpi: Point, mmPerClick: number): SightCorrection {
  const clicks = (mm: number) => (mmPerClick > 1e-6 ? Math.round(Math.abs(mm) / mmPerClick) : 0)
  return {
    vertical: clicks(mpi.y),
    // Group printing high needs the impact moved down.
    verticalDir: mpi.y >= 0 ? 'down' : 'up',
    horizontal: clicks(mpi.x),
    horizontalDir: mpi.x >= 0 ? 'left' : 'right',
  }
}

export function computeMetrics(shots: Shot[], position: Position, ctx: ScoringContext): BoutMetrics {
  const hitRadius = HIT_ZONE_MM[position] / 2
  const pts = shots.map((s) => s.mm)
  const face = faceById(ctx.faceId)
  const score = scoreBout(pts, face, ctx.bulletDiameterMm)
  const mpi = centroid(pts)
  const origin: Point = { x: 0, y: 0 }
  const bulletRadius = ctx.bulletDiameterMm / 2
  // Same inward-gauge idea as ring scoring: the hole counts as touching the
  // hit-zone edge if its near or far side straddles that boundary, not just
  // its centre.
  const splitters = pts.map((p) => Math.abs(dist(p, origin) - hitRadius) <= bulletRadius)

  let extremeSpread = 0
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) extremeSpread = Math.max(extremeSpread, dist(pts[i], pts[j]))
  }

  const rest = shots.slice(1).map((s) => s.mm)
  const firstShotDeviation =
    shots.length >= 3 ? dist(shots[0].mm, centroid(rest)) : 0

  return {
    mpi,
    mpiOffset: dist(mpi, origin),
    meanRadius: pts.length ? pts.reduce((s, p) => s + dist(p, mpi), 0) / pts.length : 0,
    extremeSpread,
    ellipse: groupEllipse(pts),
    hits: pts.filter((p) => dist(p, origin) <= hitRadius).length,
    hitsIfZeroed: pts.filter((p) => dist(p, mpi) <= hitRadius).length,
    firstShotDeviation,
    drift: driftPerShot(shots),
    flierIndex: findFlier(shots, hitRadius),
    correction: sightCorrection(mpi, ctx.mmPerClick),
    rings: score.rings,
    ringTotal: score.total,
    ringPossible: score.possible,
    ringTotalIfZeroed: scoreBout(
      pts.map((p) => ({ x: p.x - mpi.x, y: p.y - mpi.y })),
      face,
      ctx.bulletDiameterMm,
    ).total,
    innerTens: score.innerTens,
    borderlineShots: score.borderline,
    splitters,
    splitterShots: splitters.filter(Boolean).length,
  }
}

/**
 * A rectangle in the app's width-unit coordinates: a fraction of the image
 * WIDTH on both axes, exactly like every other coordinate in this app.
 */
export interface CropRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Half-width and half-height of the axis-aligned box that contains a rotated
 *  ellipse, in the same units as its semi-axes. */
export function ellipseBoundingBox(semiMajor: number, semiMinor: number, rotationDeg: number) {
  const t = rad(rotationDeg)
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  return {
    halfWidth: Math.sqrt((semiMajor * cos) ** 2 + (semiMinor * sin) ** 2),
    halfHeight: Math.sqrt((semiMajor * sin) ** 2 + (semiMinor * cos) ** 2),
  }
}

/**
 * A crop rectangle tight around a face's OUTERMOST scoring ring, not just the
 * black — so a shot on the white paper still ends up inside the crop, from a
 * bull whose geometry (centre, radius, tilt) is already known roughly.
 *
 * The outer ring's true size relative to the black is a property of the
 * printed face, not something that needs a second guess from a model: it is
 * read straight from the ring spacing, then scaled onto whatever radius the
 * black was measured at.
 */
export function outerRingCrop(bull: Bull, face: TargetFace, aspect: number, margin = 1.15): CropRect {
  const outerRadiusMm = ringRadii(face).at(-1) ?? face.blackMm / 2
  const scale = (outerRadiusMm / (face.blackMm / 2)) * margin
  const box = ellipseBoundingBox(bull.semiMajor * scale, bull.semiMinor * scale, bull.rotationDeg)
  return {
    x0: Math.max(0, bull.centre.x - box.halfWidth),
    x1: Math.min(1, bull.centre.x + box.halfWidth),
    y0: Math.max(0, bull.centre.y - box.halfHeight),
    y1: Math.min(1 / aspect, bull.centre.y + box.halfHeight),
  }
}

/**
 * Map a point given as a fraction of a crop's own width (x) and height (y)
 * back into the full image's width-unit coordinates.
 *
 * Because the crop was cut with a single uniform scale (never stretched), this
 * is a plain linear remap — no perspective or aspect correction needed here,
 * that already happened, or will happen, against the aiming mark itself.
 */
export function fromCropFraction(rect: CropRect, xFrac: number, yFrac: number): ImagePoint {
  return {
    x: rect.x0 + xFrac * (rect.x1 - rect.x0),
    y: rect.y0 + yFrac * (rect.y1 - rect.y0),
  }
}

/** Same remap for a length given as a fraction of the crop's own width (used
 *  for the aiming-mark's semi-axes, which are always width-relative). */
export function fromCropWidthFraction(rect: CropRect, frac: number): number {
  return frac * (rect.x1 - rect.x0)
}
