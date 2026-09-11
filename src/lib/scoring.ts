import type { Point, RingScore, TargetFace } from './types'

/**
 * How far a shot can sit from a ring line before this app stops trusting which
 * side of it the hole really is, in millimetres.
 *
 * The whole measurement chain — the model finding the black edge, the
 * perspective correction, the athlete nudging a marker — lands somewhere near a
 * millimetre on a 50 m face. A shot inside that of a line is reported, but
 * flagged, because a plug gauge on the paper is the only way to settle it.
 */
export const MEASUREMENT_TOLERANCE_MM = 1

/**
 * Radius of each scoring ring line, largest ring value first.
 *
 * Index 0 is the ten ring, index 9 the one ring on a standard face.
 */
export function ringRadii(face: TargetFace): number[] {
  const tenRadius = face.tenRingMm / 2
  const count = 10 - face.lowestRing + 1
  return Array.from({ length: count }, (_, i) => tenRadius + i * face.ringSpacingMm)
}

/**
 * Score one shot under the inward-gauge rule.
 *
 * A shot counts for a ring if the hole touches or breaks that ring's line, so
 * what matters is the edge of the hole nearest the centre, not its middle. A
 * .22 hole is 5.6 mm across, which is most of the way from the ten ring to the
 * nine on a 50 m face — ignoring it would cost real points.
 */
export function scoreShot(mm: Point, face: TargetFace, bulletDiameterMm: number): RingScore {
  const centreDistance = Math.hypot(mm.x, mm.y)
  const edgeDistance = centreDistance - bulletDiameterMm / 2
  const value = ringAt(edgeDistance, face)

  return {
    value,
    innerTen: face.innerTenMm > 0 && edgeDistance <= face.innerTenMm / 2,
    edgeDistance,
    // If nudging the shot by the measurement tolerance would change the ring,
    // the reading is not settled and the athlete should check the paper.
    borderline:
      ringAt(edgeDistance - MEASUREMENT_TOLERANCE_MM, face) !== value ||
      ringAt(edgeDistance + MEASUREMENT_TOLERANCE_MM, face) !== value,
  }
}

/** The highest-value ring line this edge distance touches or crosses. */
function ringAt(edgeDistance: number, face: TargetFace): number {
  const radii = ringRadii(face)
  for (let i = 0; i < radii.length; i++) {
    if (edgeDistance <= radii[i]) return 10 - i
  }
  return 0
}

export interface BoutScore {
  rings: RingScore[]
  total: number
  possible: number
  innerTens: number
  borderline: number
}

export function scoreBout(shots: Point[], face: TargetFace, bulletDiameterMm: number): BoutScore {
  const rings = shots.map((mm) => scoreShot(mm, face, bulletDiameterMm))
  return {
    rings,
    total: rings.reduce((n, r) => n + r.value, 0),
    possible: shots.length * 10,
    innerTens: rings.filter((r) => r.innerTen).length,
    borderline: rings.filter((r) => r.borderline).length,
  }
}
