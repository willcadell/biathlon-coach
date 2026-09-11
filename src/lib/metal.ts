import type { MetalBout, Position } from './types'

/** Discs on the range. Fixed by the discipline, not configurable. */
export const DISCS_PER_METAL_BOUT = 5

export interface MetalStat {
  position: Position
  bouts: number
  totalShots: number
  totalMisses: number
  /** Hits out of every shot in the window, as a percentage. This is the
   *  number a race actually turns on — not group shape, which a metal bout
   *  cannot measure at all. */
  hitRatePct: number
}

/** Hit rate by position, from whatever metal bouts are handed in — the
 *  caller decides the time window, same as the precision-bout findings do. */
export function metalStats(bouts: MetalBout[]): MetalStat[] {
  return (['prone', 'standing'] as Position[])
    .map((position) => {
      const set = bouts.filter((b) => b.position === position)
      const totalShots = set.length * DISCS_PER_METAL_BOUT
      const totalMisses = set.reduce((n, b) => n + b.misses, 0)
      return {
        position,
        bouts: set.length,
        totalShots,
        totalMisses,
        hitRatePct: totalShots > 0 ? ((totalShots - totalMisses) / totalShots) * 100 : 0,
      }
    })
    .filter((s) => s.bouts > 0)
}
