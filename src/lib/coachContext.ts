import { version } from '../../package.json'
import { METAL_TARGETS, hitsOf } from './metal'
import type { MetalBout, Workout } from './types'

/**
 * The context another app (NordicAim) can pull from a 545 Coach log: what
 * happened on metal, what the rifle's zero was doing, and what the wind was,
 * for range and race sessions. Dry-fire sessions are left out — they have none
 * of the three.
 *
 * Shaped to NordicAim's draft docs/spec/coach-context-import.md (field names
 * and nesting as written there), plus a few clearly additive fields — marked
 * below — that the spec doesn't ask for but a reader needs to interpret the
 * numbers. Matching to the other app's sessions is by calendar date only, since
 * the two apps share no identifier.
 */
export interface CoachContextFile {
  format: 'coach-context'
  formatVersion: 1
  source: { app: '545-coach'; appVersion: string; exportedAt: string }
  /** Free text for the person importing to recognise this as their own. Left
   *  empty by default — a file that's easy to share shouldn't carry a name. */
  athleteHint: string | null
  range: { from: string; to: string }
  metalSessions: MetalContext[]
  zeroAdjustments: ZeroAdjustment[]
  windConditions: WindContext[]
  /** Additive: what the numbers mean, so an importer doesn't have to guess. */
  conventions: {
    discOrder: string
    zeroClicks: string
    windDirection: string
    windStrength: string
  }
}

export interface MetalContext {
  /** Local calendar date of the session the bout belongs to. */
  sessionDate: string
  position: 'prone' | 'standing'
  /** Disc 1..5 = alpha..echo, left to right downrange. */
  discHits: boolean[]
  /** Opaque grouping key shared by every round of one ski-and-shoot combo. */
  comboGroup: string | null
  /** 0-1. */
  hitRate: number
  /** Additive: the combo's target heart-rate zone, 1-5, if one was set. */
  targetZone: number | null
  /** Additive: the race format, when the session was a race rather than training. */
  race: string | null
}

export interface ZeroAdjustment {
  at: string
  /** Net movement of the point of impact, + up / − down. */
  verticalClicks: number
  /** Net movement of the point of impact, + right / − left. */
  horizontalClicks: number
  note: string | null
}

export interface WindContext {
  sessionDate: string
  /** Always null: 545 Coach records a strength band, not a speed. */
  speedKph: null
  /** Clock position the wind blew from, '1'..'12'; null when there was no wind. */
  direction: string | null
  /** The strength band: none, light, moderate or strong. */
  note: string
}

/** YYYY-MM-DD in the device's own timezone — the date the athlete would
 *  call it, not the UTC date a late-evening session might fall across. */
export function localDate(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Range and race sessions — everything except dry-fire. */
export const isRangeOrRace = (w: Workout) => w.workoutType !== 'dryfire'

export function buildCoachContext(
  workouts: Workout[],
  metalBouts: MetalBout[],
  now: Date = new Date(),
): CoachContextFile {
  const sessions = workouts.filter(isRangeOrRace)
  const byId = new Map(sessions.map((w) => [w.id, w]))
  const dates = sessions.map((w) => localDate(w.startedAt)).sort()

  const metalSessions: MetalContext[] = metalBouts
    .filter((b) => byId.has(b.workoutId))
    .sort((a, b) => a.shotAt.localeCompare(b.shotAt))
    .map((b) => {
      const w = byId.get(b.workoutId)!
      const hits = hitsOf(b)
      const discHits = METAL_TARGETS.map((t) => hits[t])
      return {
        sessionDate: localDate(w.startedAt),
        position: b.position,
        discHits,
        comboGroup: b.comboId,
        hitRate: discHits.filter(Boolean).length / METAL_TARGETS.length,
        targetZone: b.targetZone,
        race: w.raceType,
      }
    })

  const zeroAdjustments: ZeroAdjustment[] = sessions
    .flatMap((w) => w.clickLog)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
    .map((c) => ({
      at: c.loggedAt,
      verticalClicks: c.verticalDir === 'up' ? c.vertical : -c.vertical,
      horizontalClicks: c.horizontalDir === 'right' ? c.horizontal : -c.horizontal,
      note: c.note.trim() || null,
    }))

  const windConditions: WindContext[] = sessions
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((w) => ({
      sessionDate: localDate(w.startedAt),
      speedKph: null,
      direction: w.wind === 'none' ? null : w.windDirection,
      note: w.wind,
    }))

  const today = localDate(now.toISOString())
  return {
    format: 'coach-context',
    formatVersion: 1,
    source: { app: '545-coach', appVersion: version, exportedAt: now.toISOString() },
    athleteHint: null,
    range: { from: dates[0] ?? today, to: dates[dates.length - 1] ?? today },
    metalSessions,
    zeroAdjustments,
    windConditions,
    conventions: {
      discOrder: 'discHits[0..4] = alpha, beta, charlie, delta, echo — left to right downrange',
      zeroClicks: 'Signed net clicks per logged adjustment, as movement of the point of impact: + up / + right, − down / − left',
      windDirection: 'Clock position the wind blows FROM, facing the target: 12 headwind, 6 tailwind, 3 and 9 full crosswind',
      windStrength: 'Strength band only (none, light, moderate, strong) — no speed is recorded',
    },
  }
}
