import type { MetalBout, MetalTarget, Position } from './types'

/** The five targets, left to right, in the order they're always named. */
export const METAL_TARGETS: readonly MetalTarget[] = ['alpha', 'beta', 'charlie', 'delta', 'echo']

/** Discs on the range. Fixed by the discipline, not configurable. */
export const DISCS_PER_METAL_BOUT = METAL_TARGETS.length

/** All five hit — the state a fresh bout starts from is all missed instead;
 *  this is for a legacy record that predates per-target recording, where
 *  assuming everything fell is the least wrong guess available. */
export const allHit = (): Record<MetalTarget, boolean> =>
  Object.fromEntries(METAL_TARGETS.map((t) => [t, true])) as Record<MetalTarget, boolean>

export const allMissed = (): Record<MetalTarget, boolean> =>
  Object.fromEntries(METAL_TARGETS.map((t) => [t, false])) as Record<MetalTarget, boolean>

/** A bout saved before targets were recorded individually has no `hits` at
 *  all — read it as a clean run rather than crash on it. */
export const hitsOf = (bout: MetalBout): Record<MetalTarget, boolean> => bout.hits ?? allHit()

export const missCount = (hits: Record<MetalTarget, boolean>) => METAL_TARGETS.filter((t) => !hits[t]).length
export const hitCount = (hits: Record<MetalTarget, boolean>) => METAL_TARGETS.filter((t) => hits[t]).length

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
      const totalMisses = set.reduce((n, b) => n + missCount(hitsOf(b)), 0)
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

export interface TargetStat {
  target: MetalTarget
  bouts: number
  misses: number
  missRatePct: number
}

/** Miss rate per target, across whatever bouts are handed in — the point of
 *  recording hits individually instead of as a bare count: a target that
 *  keeps falling last (or not at all) is a real, fixable pattern, and a
 *  count alone could never show it. */
export function targetStats(bouts: MetalBout[]): TargetStat[] {
  if (bouts.length === 0) return []
  return METAL_TARGETS.map((target) => {
    const misses = bouts.filter((b) => !hitsOf(b)[target]).length
    return { target, bouts: bouts.length, misses, missRatePct: Math.round((misses / bouts.length) * 100) }
  })
}
