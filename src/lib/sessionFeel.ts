import type { BoutTag, Checkin, FeelRating, FindingId } from './types'

/**
 * What the athlete tells the app about how a session felt and what they noticed on a
 * bout. Captured now; using it in the advice comes next (docs/athlete-feedback/DESIGN.md,
 * items 1 to 3), which is why each tag already names the findings it points at.
 */

export interface TagInfo {
  id: BoutTag
  label: string
  /** The findings this tag supports, when the athlete notices it. */
  pointsAt: FindingId[]
}

export const BOUT_TAGS: TagInfo[] = [
  { id: 'jerked-trigger', label: 'Jerked the trigger', pointsAt: ['trigger_bias', 'flier', 'metal_scattered'] },
  { id: 'rushed', label: 'Rushed it', pointsAt: ['flier', 'cold_first_shot', 'metal_late_discs', 'metal_first_disc'] },
  { id: 'held-too-long', label: 'Held too long', pointsAt: ['vertical_stringing', 'fatigue_drift', 'metal_late_discs'] },
  { id: 'breathing-off', label: 'Breathing off', pointsAt: ['vertical_stringing', 'fatigue_drift', 'metal_intensity_drop'] },
  { id: 'steered', label: 'Had to steer the rifle on', pointsAt: ['unstable_npa', 'horizontal_stringing', 'metal_one_disc'] },
  { id: 'arrived-hot', label: 'Arrived hot', pointsAt: ['cold_first_shot', 'metal_first_disc', 'metal_intensity_drop'] },
  { id: 'distracted', label: 'Distracted', pointsAt: ['flier', 'metal_miss_streaks', 'metal_race_gap'] },
  { id: 'wind', label: 'Wind or gusts', pointsAt: ['wind_sensitivity'] },
  { id: 'felt-good', label: 'Felt good', pointsAt: [] },
]

const TAG_IDS = new Set<string>(BOUT_TAGS.map((t) => t.id))

/** Tags as read back from storage: anything not on the list (an older or newer app) is dropped. */
export function cleanTags(raw: unknown): BoutTag[] {
  return Array.isArray(raw) ? raw.filter((t): t is BoutTag => typeof t === 'string' && TAG_IDS.has(t)) : []
}

export const tagLabel = (id: BoutTag) => BOUT_TAGS.find((t) => t.id === id)?.label ?? id

/** "rushed it, breathing off": for a line under a bout. */
export const tagsText = (tags: BoutTag[] | undefined) => (tags ?? []).map((t) => tagLabel(t).toLowerCase()).join(', ')

export type CheckinRow = keyof Checkin

export const CHECKIN_ROWS: { id: CheckinRow; label: string; options: [string, string, string] }[] = [
  { id: 'energy', label: 'Energy', options: ['Fresh', 'OK', 'Tired'] },
  { id: 'head', label: 'Head', options: ['Calm', 'OK', 'Rattled'] },
  { id: 'hold', label: 'Hold', options: ['Steady', 'OK', 'Wobbly'] },
]

/** A check-in as read back from storage, keeping only valid ratings. Null when there is nothing. */
export function cleanCheckin(raw: unknown): Checkin | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Checkin = {}
  for (const { id } of CHECKIN_ROWS) {
    const v = (raw as Record<string, unknown>)[id]
    if (v === 1 || v === 2 || v === 3) out[id] = v as FeelRating
  }
  return Object.keys(out).length > 0 ? out : null
}

/** "Energy: tired · Head: calm · Hold: OK", for the workout in History. Empty if nothing was rated. */
export function checkinText(c: Checkin | null | undefined): string {
  if (!c) return ''
  return CHECKIN_ROWS
    .filter((r) => c[r.id])
    .map((r) => `${r.label}: ${r.options[c[r.id]! - 1].toLowerCase().replace(/^ok$/, 'OK')}`)
    .join(' · ')
}
