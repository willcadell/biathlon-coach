/**
 * Analysis works on a set of workouts and only on what was shot in them.
 *
 * The loaders already ask for one athlete's rows (see db.ts), but bouts and
 * metal bouts carry no owner in the app's types, so the analysis layer can't
 * check whose they are. What it can check is that each one belongs to a workout
 * it was given. Anything else — a bout that reached it some other way, or one
 * whose workout isn't in the athlete's own list — never enters a statistic,
 * a trend, or the advice.
 */
export function ofWorkouts<T extends { workoutId: string }>(items: T[], workouts: { id: string }[]): T[] {
  const ids = new Set(workouts.map((w) => w.id))
  return items.filter((i) => ids.has(i.workoutId))
}
