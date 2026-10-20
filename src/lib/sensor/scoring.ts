import type { Position } from '../types'
import type { Point } from './records'
import { median } from './records'

// Hit or miss on the five targets, at the 5 m scale of the dry-fire target: everything is 1/10 of the 50 m range, so a 45 mm prone disc is
// 4.5 mm and a 115 mm standing disc is 11.5 mm, and the targets are 25 mm apart.

export const TARGET_SPACING_MM = 25
export const DISC_DIAMETER_MM: Record<Position, number> = { prone: 4.5, standing: 11.5 }
/** A .22 bullet, 5.6 mm at 50 m. */
export const BULLET_DIAMETER_MM = 0.56

/** Centre of target i (0 = Alpha ... 4 = Echo), millimetres, +x right, +y up, origin at Charlie. */
export const targetCentre = (i: number, spacing = TARGET_SPACING_MM): Point => ({ x: (i - 2) * spacing, y: 0 })

export function nearestTarget(x: number, y: number, spacing = TARGET_SPACING_MM): number {
  let best = 0, bestD = Infinity
  for (let i = 0; i < 5; i++) {
    const c = targetCentre(i, spacing)
    const d = Math.hypot(x - c.x, y - c.y)
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

export interface ShotResult { target: number; dist: number; hit: boolean }

/** Biathlon scoring is hit or miss. With edgeCounts, a shot that only touches the edge of the disc is a hit. practice widens every disc by
 *  that many millimetres, as a training aid; 0 is the real disc. */
export function scoreShot(x: number, y: number, position: Position, { edgeCounts = true, practice = 0, spacing = TARGET_SPACING_MM } = {}): ShotResult {
  const target = nearestTarget(x, y, spacing)
  const c = targetCentre(target, spacing)
  const dist = Math.hypot(x - c.x, y - c.y)
  const radius = DISC_DIAMETER_MM[position] / 2 + (edgeCounts ? BULLET_DIAMETER_MM / 2 : 0) + practice
  return { target, dist, hit: dist <= radius }
}

/** Root-mean-square distance of a trace from its own median: the hold. */
export function holdRms(points: Point[]): number | null {
  if (points.length < 5) return null
  const mx = median(points.map((p) => p.x)), my = median(points.map((p) => p.y))
  return Math.sqrt(points.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / points.length)
}
