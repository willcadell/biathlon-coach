import { DRILLS, type Recommendation } from './training'
import type { Drill } from './types'

/**
 * Suggested activities for a week, sized to the time the athlete has. It never says
 * which day: the athlete fits them in where they can. See
 * docs/athlete-feedback/WEEKLY-PLAN.md.
 */

/** Minutes a week the athlete can give to shooting practice, in each place. */
export interface TrainingBudget {
  /** Dry-fire at home: a wall and 5 m is enough. */
  homeMinutes: number
  /** At a range, live. */
  rangeMinutes: number
}

export type Place = 'home' | 'range'

export interface Activity {
  drill: Drill
  /** Times this week. */
  sessions: number
  /** Why this drill, for this athlete. */
  reason: string
}

export interface WeekSuggestion {
  home: Activity[]
  range: Activity[]
  /** Minutes not used in each place. */
  spare: TrainingBudget
  /** No findings yet, so these are foundation drills rather than ones from the athlete's shooting. */
  foundations: boolean
}

/** At most this many different drills in one place, so a week keeps a clear focus. */
const MAX_DRILLS_PER_PLACE = 3
/** Never more than this many times a week for one drill. */
const MAX_SESSIONS = 3

/** What every shooter builds on, for an athlete the app has no findings for yet. */
const FOUNDATIONS: { id: string; reason: string }[] = [
  { id: 'breathing-pause', reason: 'a foundation for every shot' },
  { id: 'hold-build', reason: 'a foundation: the stability every group needs' },
  { id: 'npa-check', reason: 'a foundation: a position that points at the target on its own' },
  { id: 'zero-check', reason: 'start of any block: know your sight is right' },
  { id: 'follow-through', reason: 'a foundation: know where a shot went before you look' },
]

/** The times a week a drill asks for, read from its frequency text ("2–3× per week, dry"
 *  → 3), capped. Anything without a weekly count ("Every live session") counts once. */
export function sessionsPerWeek(frequency: string): number {
  const m = frequency.match(/(\d+)\s*(?:[–-]\s*(\d+))?\s*×\s*per week/)
  if (!m) return 1
  return Math.max(1, Math.min(MAX_SESSIONS, Number(m[2] ?? m[1])))
}

export function suggestWeek(recommendations: Recommendation[], budget: TrainingBudget): WeekSuggestion {
  const foundations = recommendations.length === 0
  const ranked: { drill: Drill; reason: string }[] = foundations
    ? FOUNDATIONS.flatMap((f) => {
        const drill = DRILLS.find((d) => d.id === f.id)
        return drill ? [{ drill, reason: f.reason }] : []
      })
    : recommendations

  const left: Record<Place, number> = { home: Math.max(0, budget.homeMinutes), range: Math.max(0, budget.rangeMinutes) }
  const placed: Record<Place, Activity[]> = { home: [], range: [] }
  const placeOf = new Map<string, Place>()

  const tryPlace = (item: { drill: Drill; reason: string }, place: Place): boolean => {
    if (placeOf.has(item.drill.id)) return false
    if (placed[place].length >= MAX_DRILLS_PER_PLACE || left[place] < item.drill.minutes) return false
    placed[place].push({ drill: item.drill, sessions: 1, reason: item.reason })
    placeOf.set(item.drill.id, place)
    left[place] -= item.drill.minutes
    return true
  }

  // Breadth first, best first: one session each. Dry drills belong at home and live
  // drills at the range; a dry drill only takes range time once every live drill has
  // had its chance at it.
  for (const item of ranked) tryPlace(item, item.drill.dryFire ? 'home' : 'range')
  for (const item of ranked) if (item.drill.dryFire) tryPlace(item, 'range')

  // Then depth: the top drills come round again, up to what each asks for.
  for (const place of ['home', 'range'] as Place[]) {
    let added = true
    while (added) {
      added = false
      for (const a of placed[place]) {
        if (a.sessions < sessionsPerWeek(a.drill.frequency) && left[place] >= a.drill.minutes) {
          a.sessions += 1
          left[place] -= a.drill.minutes
          added = true
          break // back to the top, so the best drill fills first
        }
      }
    }
  }

  return { home: placed.home, range: placed.range, spare: { homeMinutes: left.home, rangeMinutes: left.range }, foundations }
}

// --- Keeping the budget ---------------------------------------------------------

const KEY = 'biathlon-coach:training-budget'

/** The athlete's budget, or null if they have not set one. Kept in this browser,
 *  like the rest of the settings. */
export function loadBudget(): TrainingBudget | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const b = JSON.parse(raw) as Partial<TrainingBudget>
    if (typeof b.homeMinutes !== 'number' || typeof b.rangeMinutes !== 'number') return null
    return { homeMinutes: b.homeMinutes, rangeMinutes: b.rangeMinutes }
  } catch {
    return null
  }
}

export function saveBudget(budget: TrainingBudget): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(budget))
  } catch {
    // A full or locked store is not worth crashing the app over.
  }
}

/** "1 h 30 min", "45 min", "2 h". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
