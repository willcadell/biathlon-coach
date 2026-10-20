import type { Point } from './records'

/** Sensor units: neighbouring centres closer than this cannot be told apart. */
export const MIN_GAP = 1.0

/** Maps the sensor frame (after zero, flip, scale and rotation) to millimetres on the target, from the centres learned by calibration.
 *
 *  The sensor's response is not a plain scale: the neighbouring targets came out 4 to 18 sensor units apart in recorded series, so
 *  each pair of neighbouring anchors gets its own local scale. Along the row the map is piecewise linear through the centres (the end
 *  segments carry on past Alpha and Echo); across the row it is the offset from the line through the neighbouring centres, at that
 *  segment's scale.
 *
 *  centres: in the sensor frame, measured from Charlie's centre, left to right. anchors: which target (0 = Alpha ... 4 = Echo) each
 *  centre belongs to; all five by default. */
export class TargetMap {
  readonly anchors: number[]

  constructor(readonly centres: Point[], public spacing: number, anchors?: number[]) {
    this.anchors = anchors ?? centres.map((_, i) => i)
  }

  /** Null when the centres can be used, otherwise the reason they cannot. names label the centres in the message. */
  static check(centres: Point[], names?: string[]): string | null {
    for (let k = 0; k < centres.length - 1; k++) {
      const dx = centres[k + 1].x - centres[k].x
      if (dx < MIN_GAP) {
        return `${names?.[k] ?? `Target ${k + 1}`} and ${names?.[k + 1] ?? `target ${k + 2}`} came out ${dx < 0 ? 'in the wrong order' : 'almost on top of each other'} (${dx.toFixed(1)} units apart).`
      }
    }
    return null
  }

  apply(x: number, y: number): Point {
    const c = this.centres, a = this.anchors
    let k = 0
    while (k < c.length - 2 && x > c[k + 1].x) k++
    const dx = c[k + 1].x - c[k].x
    const t = (x - c[k].x) / dx
    const targets = a[k + 1] - a[k]                                  // how many target spacings this segment spans
    const yLine = c[k].y + t * (c[k + 1].y - c[k].y)
    return { x: (a[k] - 2 + t * targets) * this.spacing, y: (y - yLine) * this.spacing * targets / dx }
  }
}
