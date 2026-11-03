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
