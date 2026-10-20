// Decoding the byte stream the receiver sends on its bulk IN endpoint, and turning aim records into samples and shots.
//
// The stream is a series of records: [len][type][...], len includes itself, several records can share one transfer.
//   type 0x88, 18 bytes   target status (payload byte 9 = 0x02 while the target is enabled)
//   type 0x44             data from the sensor, byte 2 = 0x8a:
//     17 bytes, byte 3 = 0x8e or 0xce  AIM packet
//         [3] 0x8e normal / 0xce flagged; when flagged (bit 6) bytes 4..16 are bitwise inverted
//         [7] sequence counter, [8] a slow side-channel byte (not used)
//         [9..16] four little-endian int16: x1, y1, x2, y2. Two aim samples per packet, about 10 ms apart,
//         in time order. The packets arrive about every 20 ms.
//     19 bytes, byte 3 low bits 0x10    TRIGGER record: the same layout plus [17] index and validity, [18] strength.
//         A real pull reads 165 to 171; bolt movement reads 133 or less.
//     18 and 21 bytes                  AUX packets (sensor feedback, answered with a keep-alive; see usb.ts)

/** Raw sensor units to millimetres before calibration (the calibration finds the real scale). */
export const RAW_TO_MM = 1 / 50

export interface Point { x: number; y: number }

/** One aim sample. x and y are in millimetres on the target (after the zero, rotation and learned map); ux and uy are the
 *  sensor frame before the map, which is where calibration learns the target positions. t is ms since the session started. */
export interface Sample { t: number; x: number; y: number; ux: number; uy: number }

export interface TriggerInfo { amplitude: number; index: number; valid: boolean }

export type RecordKind = 'status' | 'trigger' | 'aim' | 'aux' | 'sensor-other' | 'other'

export const hex = (bytes: ArrayLike<number>): string =>
  Array.from(bytes as ArrayLike<number> & Iterable<number>, (b) => b.toString(16).padStart(2, '0')).join(' ')

/** Splits a byte buffer into whole records and returns the unconsumed rest. */
export function splitRecords(bytes: Uint8Array): { records: Uint8Array[]; rest: Uint8Array } {
  const records: Uint8Array[] = []
  let i = 0
  while (i < bytes.length) {
    const len = bytes[i]
    if (len < 2) { i++; continue }               // resynchronise on garbage
    if (i + len > bytes.length) break
    records.push(bytes.subarray(i, i + len))
    i += len
  }
  return { records, rest: bytes.slice(i) }
}

export function classify(rec: Uint8Array): RecordKind {
  if (rec[1] === 0x88) return 'status'
  if (rec[1] === 0x44 && rec.length === 19 && (rec[3] & 0x1f) === 0x10) return 'trigger'
  if (rec[1] === 0x44) return rec.length === 17 ? 'aim' : rec.length === 18 || rec.length === 21 ? 'aux' : 'sensor-other'
  return 'other'
}

export interface DecodedAim {
  seq: number
  flagged: boolean
  isTrigger: boolean
  trigger: TriggerInfo | null
  /** Identifies the sender; compare across targets. */
  header: string
  /** Two aim points in raw sensor units, in time order. */
  points: [[number, number], [number, number]]
}

export function decodeAimRecord(rec: Uint8Array): DecodedAim | null {
  const isTrigger = rec.length === 19 && (rec[3] & 0x1f) === 0x10
  if ((rec.length !== 17 && !isTrigger) || rec[1] !== 0x44) return null
  const b = Uint8Array.from(rec)
  const flagged = (b[3] & 0x40) !== 0
  if (flagged) for (let i = 4; i < b.length; i++) b[i] ^= 0xff   // a flagged record's payload is inverted
  const dv = new DataView(b.buffer)
  return {
    seq: b[7],
    flagged,
    isTrigger,
    trigger: isTrigger ? { amplitude: b[18], index: b[17] & 0x0f, valid: (b[17] & 0x80) === 0 } : null,   // read from the un-inverted copy
    header: hex([rec[2], b[3] & 0xbf, b[4], b[5], b[6]]),
    points: [[dv.getInt16(9, true), dv.getInt16(11, true)], [dv.getInt16(13, true), dv.getInt16(15, true)]],
  }
}

export interface TargetMapLike { apply(x: number, y: number): Point }

export interface TrackerOutput {
  samples: Sample[]
  /** Set when this record was a trigger record that counts as a shot. */
  shot: Sample | null
  /** A strong trigger record soon after a shot: an echo of that shot, not a new one. */
  echo: boolean
  seq: number
  header: string
  trigger: TriggerInfo | null
}

/** Turns aim records and trigger records into samples and shot events.
 *
 *  Per point: flip and scale, subtract the zero, rotate, then (once calibrated) map to millimetres on the target.
 *  A trigger record is the shot: not flagged or flagged alike (a good calibration pull arrived flagged), valid, strength at
 *  least minAmplitude, and not within debounceMs of the previous shot. */
export class AimTracker {
  flipX = false
  flipY = false
  /** Multiplier on RAW_TO_MM. */
  scale = 1
  /** The aim point (in scaled sensor units) that should read as (0, 0). */
  offset: Point = { x: 0, y: 0 }
  /** Latest aim point before the offset is applied. */
  last: Point | null = null
  /** Rotation of the sensor frame, radians. */
  rotation = 0
  /** The learned target map, applied after zero, flip, scale and rotation. */
  map: TargetMapLike | null = null
  minAmplitude = 150
  debounceMs = 1500
  private lastShotAt = -Infinity

  /** Zero at the median of several aim points (the pulls on the middle target). */
  zeroFrom(points: Point[]): boolean {
    if (!points.length) return false
    const med = (key: 'x' | 'y') => median(points.map((p) => p[key]))
    this.offset = { x: med('x'), y: med('y') }
    return true
  }

  /** Move the zero so a point now reading (ux, uy) in the sensor frame reads (0, 0). */
  shiftZero(ux: number, uy: number): void {
    const cr = Math.cos(this.rotation), sr = Math.sin(this.rotation)
    this.offset = { x: this.offset.x + ux * cr + uy * sr, y: this.offset.y - ux * sr + uy * cr }
  }

  clearZero(): void { this.offset = { x: 0, y: 0 } }

  /** tMs: time of this record in ms since the session started. */
  process(rec: Uint8Array, tMs: number): TrackerOutput | null {
    const a = decodeAimRecord(rec)
    if (!a) return null
    const sx = (this.flipX ? -1 : 1) * RAW_TO_MM * this.scale
    const sy = (this.flipY ? -1 : 1) * RAW_TO_MM * this.scale
    const raw = a.points.map(([x, y]) => ({ x: x * sx, y: y * sy }))
    this.last = raw[1]
    const cr = Math.cos(this.rotation), sr = Math.sin(this.rotation)
    const samples: Sample[] = raw.map((p, i) => {
      const x = p.x - this.offset.x, y = p.y - this.offset.y
      const ux = x * cr - y * sr, uy = x * sr + y * cr
      const m = this.map ? this.map.apply(ux, uy) : { x: ux, y: uy }
      return { t: tMs - (1 - i) * 10, x: m.x, y: m.y, ux, uy }
    })
    let shot: Sample | null = null
    let echo = false
    if (a.isTrigger && a.trigger && a.trigger.valid && a.trigger.amplitude >= this.minAmplitude) {
      if (tMs - this.lastShotAt >= this.debounceMs) { shot = { ...samples[1] }; this.lastShotAt = tMs }
      else echo = true
    }
    return { samples, shot, echo, seq: a.seq, header: a.header, trigger: a.trigger }
  }
}

export function median(values: number[]): number {
  const a = [...values].sort((p, q) => p - q)
  const h = a.length >> 1
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2
}
