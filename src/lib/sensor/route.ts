import type { Point } from './records'

/** Ramer-Douglas-Peucker: the few straight segments that describe a path to within eps millimetres. */
export function simplify(points: Point[], eps: number): Point[] {
  if (points.length < 3) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number]
    let worst = -1, at = -1
    const { x: ax, y: ay } = points[a], { x: bx, y: by } = points[b]
    const len = Math.hypot(bx - ax, by - ay)
    for (let i = a + 1; i < b; i++) {
      const { x: px, y: py } = points[i]
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
      if (d > worst) { worst = d; at = i }
    }
    if (worst > eps) { keep[at] = 1; stack.push([a, at], [at, b]) }
  }
  return points.filter((_, i) => keep[i])
}

/** One row of a track: time (ms), x, y (mm on the target), and the number of shots fired so far (the leg the point belongs to). */
export type TrackRow = [t: number, x: number, y: number, leg: number]

export interface LegStats {
  /** How long the leg took, ms. */
  ms: number
  /** How far the rifle travelled along the straightened route, mm. */
  path: number
  /** The straight-line distance from where the leg began to where it ended, mm. */
  straight: number
  points: Point[]
}

/** Per leg of a track (the path up to each shot): how long it took, how far the rifle travelled (straightened), and the straight distance. */
export function legStats(track: TrackRow[], eps = 3): Map<number, LegStats> {
  const legs = new Map<number, TrackRow[]>()
  for (const q of track) {
    const rows = legs.get(q[3])
    if (rows) rows.push(q)
    else legs.set(q[3], [q])
  }
  const out = new Map<number, LegStats>()
  for (const [leg, rows] of legs) {
    const s = simplify(rows.map((q) => ({ x: q[1], y: q[2] })), eps)
    let path = 0
    for (let i = 1; i < s.length; i++) path += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y)
    const first = rows[0], last = rows[rows.length - 1]
    out.set(leg, { ms: last[0] - first[0], path, straight: Math.hypot(last[1] - first[1], last[2] - first[2]), points: s })
  }
  return out
}
