/** Times are kept as ISO timestamps (UTC), the same basis Garmin and Strava use, so a bout can
 *  be matched to a heart-rate stream by its time. These convert to and from what a
 *  `datetime-local` input shows, which is local time to the minute. */

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-11-03T14:32", local time, for a datetime-local input. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The ISO timestamp for what a datetime-local input holds, or null if it is empty or invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** "2:32 PM", for a bout's row. */
export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** A range time for display: "34.2 s", or "1:05.3" from a minute up. */
export function formatRangeTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const m = Math.floor(seconds / 60)
  return `${m}:${(seconds - m * 60).toFixed(1).padStart(4, '0')}`
}

/** " · 34.2 s range" for a bout's meta line, or nothing when it was not timed. */
export const rangeTimeNote = (seconds: number | undefined): string =>
  seconds && seconds > 0 ? ` · ${formatRangeTime(seconds)} range` : ''
