import { AimTracker, classify, hex, splitRecords, type Sample, type TrackerOutput } from './records'
import type { TargetMap } from './targetMap'

// The USB connection to the optical dry-fire target's receiver (WebUSB, Chrome or Edge on a computer). It sends the start-up sequence the
// receiver expects, answers the sensor's feedback packets with a keep-alive, drives the target's lights, and turns the record stream
// into samples and shots through AimTracker.
//
// A stalled control request tends to wedge the receiver's data pipe until it is physically replugged, so only the messages below are ever
// sent, one at a time, and a rejected one stops the session at once and names the culprit.

// ---- the parts of WebUSB this file uses (lib.dom does not ship them) ----
interface UsbResult { status: string }
interface UsbInResult extends UsbResult { data?: DataView }
interface UsbSetup { requestType: 'vendor'; recipient: 'device'; request: number; value: number; index: number }
interface UsbDevice {
  vendorId: number
  productId: number
  configuration: unknown
  open(): Promise<void>
  close(): Promise<void>
  selectConfiguration(n: number): Promise<void>
  claimInterface(n: number): Promise<void>
  clearHalt(direction: 'in' | 'out', endpoint: number): Promise<void>
  controlTransferOut(setup: UsbSetup, data?: Uint8Array): Promise<UsbResult>
  controlTransferIn(setup: UsbSetup, length: number): Promise<UsbInResult>
  transferIn(endpoint: number, length: number): Promise<UsbInResult>
}
interface UsbApi {
  getDevices(): Promise<UsbDevice[]>
  requestDevice(options: { filters: { vendorId: number; productId: number }[] }): Promise<UsbDevice>
  addEventListener(type: 'disconnect', listener: (e: { device: UsbDevice }) => void): void
}
const usbApi = (): UsbApi | undefined => (typeof navigator !== 'undefined' ? (navigator as unknown as { usb?: UsbApi }).usb : undefined)

const VENDOR_ID = 0x1224
const PRODUCT_ID = 0x0022
const ENDPOINT_IN = 1
/** Mailbox address of the target (wIndex of the 0xF0 / 0xF1 requests). */
const TARGET_ID = 10
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type Message = [number[], number]

/** What the receiver expects after it is enabled, in order: [bytes, timeout ms]. */
const START_MESSAGES: Message[] = [
  [[0x33, 0x02], 500], [[0x34, 0x04], 500], [[0x40, 0x0a, 0x10], 20000], [[0x25, 0x04], 500],
  [[0x50, 0x80, 0x80], 20000], [[0x40, 0x0a, 0x10], 20000],
  [[0x32, 0x00, 0x00], 250], [[0x16], 250],
  [[0x32, 0x00, 0x00], 250], [[0x32, 0x00, 0x00], 250], [[0x32, 0x00, 0x00], 250],
  [[0x32, 0x01, 0x00], 250], [[0x32, 0x03, 0x00], 250], [[0x32, 0x0b, 0x00], 250], [[0x32, 0x1b, 0x00], 250],
  [[0x50, 0x80, 0x80], 20000],
]
/** Answer to each of the sensor's 18 and 21 byte feedback packets, and (every other time) the light level. */
const KEEPALIVE: Message = [[0x40, 0x0a, 0x10], 20000]
const LEVEL: [number, number] = [0x80, 0x80]

export type ConnectionState = 'disconnected' | 'connecting' | 'ready' | 'streaming' | 'error'

export interface SensorEvents {
  status: { state: ConnectionState; detail: string }
  sample: Sample
  /** A shot: the sample at the trigger record, with the trigger strength. */
  shot: Sample & { strength: number }
  /** Counts of what has arrived, for a link-quality readout. */
  counts: { aim: number; aux: number; trigger: number }
}

type Listener<K extends keyof SensorEvents> = (event: SensorEvents[K]) => void

export interface SensorOptions {
  flipX: boolean
  flipY: boolean
  scale: number
  rotation: number
  map: TargetMap | null
}

export class SensorConnection {
  state: ConnectionState = 'disconnected'
  tracker = new AimTracker()
  private device: UsbDevice | null = null
  private running = false
  private buffer: Uint8Array = new Uint8Array(0)
  private chain: Promise<unknown> = Promise.resolve()
  private t0 = 0
  private disconnectBound = false
  private counts = { aim: 0, aux: 0, trigger: 0 }
  private listeners: { [K in keyof SensorEvents]?: Listener<K>[] } = {}

  static supported(): boolean { return !!usbApi() }

  on<K extends keyof SensorEvents>(type: K, listener: Listener<K>): () => void {
    const list = (this.listeners[type] ??= []) as Listener<K>[]
    list.push(listener)
    return () => { const i = list.indexOf(listener); if (i >= 0) list.splice(i, 1) }
  }

  private emit<K extends keyof SensorEvents>(type: K, event: SensorEvents[K]): void {
    for (const l of (this.listeners[type] ?? []) as Listener<K>[]) l(event)
  }

  private setState(state: ConnectionState, detail = ''): void {
    this.state = state
    this.emit('status', { state, detail })
  }

  async connect(): Promise<void> {
    const usb = usbApi()
    if (!usb) throw new Error('This browser cannot talk to the sensor. Use Chrome or Edge on a computer.')
    this.setState('connecting', 'Choose the receiver in the browser prompt')
    try {
      const granted = await usb.getDevices()
      this.device = granted.find((d) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID)
        ?? await usb.requestDevice({ filters: [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }] })
      await this.device.open()
      if (this.device.configuration === null) await this.device.selectConfiguration(1)
      await this.device.claimInterface(0)
      if (!this.disconnectBound) {
        this.disconnectBound = true
        usb.addEventListener('disconnect', (e) => {
          if (e.device === this.device) { this.running = false; this.setState('error', 'Receiver unplugged') }
        })
      }
      this.setState('ready', 'Receiver connected')
    } catch (e) {
      const err = e as Error
      this.setState('error', err.name === 'NotFoundError' ? 'No device chosen' : err.message)
      throw e
    }
  }

  async disconnect(): Promise<void> {
    await this.stop()
    try { await this.device?.close() } catch { /* already gone */ }
    this.device = null
    this.setState('disconnected')
  }

  // ---- control transfers, one at a time ----
  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn)
    this.chain = p.catch(() => undefined)
    return p
  }

  private async out(request: number, value: number, index: number, data: Uint8Array | undefined, what: string): Promise<void> {
    const r = await (this.device as UsbDevice).controlTransferOut({ requestType: 'vendor', recipient: 'device', request, value, index }, data)
    if (r.status !== 'ok') this.rejected(`${what} (${r.status})`)
  }

  private async in(request: number, length: number, what: string): Promise<Uint8Array> {
    const r = await (this.device as UsbDevice).controlTransferIn({ requestType: 'vendor', recipient: 'device', request, value: 0, index: 0 }, length)
    if (r.status !== 'ok' || !r.data) this.rejected(`${what} (${r.status})`)
    const d = r.data as DataView
    return new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
  }

  private rejected(what: string): never {
    const err = new Error(`The receiver rejected ${what}. Unplug and replug it, then connect again.`)
    this.fail(err)
    throw err
  }

  private message([bytes, timeout]: Message, id = TARGET_ID): Promise<void> {
    return this.queue(() => this.out(0xf0, timeout, id, Uint8Array.from(bytes), `mailbox message 0x${bytes[0].toString(16)}`))
  }

  private async query(opcode: number, replyLength: number): Promise<Uint8Array> {
    await this.message([[opcode], 250])
    await sleep(10)
    return this.queue(() => this.in(0xf1, replyLength, `reply to 0x${opcode.toString(16)}`))
  }

  /** Enables the target and starts the stream. */
  async start(options: SensorOptions): Promise<void> {
    if (!this.device) throw new Error('Not connected')
    this.counts = { aim: 0, aux: 0, trigger: 0 }
    this.buffer = new Uint8Array(0)
    this.tracker = new AimTracker()
    this.tracker.flipX = options.flipX
    this.tracker.flipY = options.flipY
    this.tracker.scale = options.scale
    this.tracker.rotation = options.rotation
    this.tracker.map = options.map
    this.running = true
    this.t0 = performance.now()
    try {
      await this.queue(() => this.in(0x81, 8, 'the device id read'))
      await this.queue(() => this.in(0x8b, 1, 'the state read'))
      await this.queue(() => this.out(0x90, 1, 0, undefined, 'the enable command'))
      await this.resetPipe()
      void this.readLoop()
      await sleep(1000)
      // Byte 9 of the status read is 0x02 when a target answers; without one, mailbox messages would only stall the data pipe.
      let status = await this.queue(() => this.in(0x82, 16, 'the status read'))
      for (let tries = 0; status[9] !== 0x02 && tries < 6; tries++) {
        await sleep(500)
        status = await this.queue(() => this.in(0x82, 16, 'the status read'))
      }
      if (status[9] !== 0x02) {
        throw new Error('The control unit does not report a target. Check the cable between the target and the control unit, then replug the receiver.')
      }
      await this.query(0x20, 17)
      await this.query(0x21, 10)
      for (const m of START_MESSAGES) await this.message(m)
      this.setState('streaming', 'Waiting for the sensor')
    } catch (e) {
      this.running = false
      this.setState('error', (e as Error).message)
      throw e
    }
  }

  /** Target lights: bit i of each mask is target i (0 = Alpha). Red and green together look orange. */
  setLights(red: number, green = 0): Promise<void> {
    this.requireStreaming()
    return this.message([[0x32, red & 0x1f, green & 0x1f], 250])
  }

  /** Which targets are active, as a mask of five bits. */
  setTargets(mask: number): Promise<void> {
    this.requireStreaming()
    return this.message([[0x25, mask & 0x1f], 500])
  }

  private requireStreaming(): void {
    if (!this.device || this.state !== 'streaming') throw new Error('Start a session first')
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.device && this.state === 'streaming') {
      try {
        await this.message([[0x12], 250], 0)
        await this.queue(() => this.out(0x90, 0, 0, undefined, 'the disable command'))
      } catch { /* best effort */ }
      this.setState('ready', 'Receiver connected')
    }
  }

  private async resetPipe(): Promise<void> {
    try { await (this.device as UsbDevice).clearHalt('in', ENDPOINT_IN) } catch { /* the read loop retries */ }
  }

  private async readLoop(): Promise<void> {
    let failures = 0
    while (this.running) {
      try {
        const r = await (this.device as UsbDevice).transferIn(ENDPOINT_IN, 512)
        if (r.status !== 'ok') throw new Error(`endpoint returned "${r.status}"`)
        failures = 0
        if (r.data?.byteLength) this.feed(new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength))
      } catch (e) {
        if (!this.running) return
        // A stalled pipe usually stays wedged until the receiver is physically replugged, so give up quickly.
        if (++failures >= 4) {
          this.running = false
          this.setState('error', `The receiver stopped responding (${(e as Error).message}). Unplug and replug it, then connect again.`)
          return
        }
        await sleep(200)
        await this.resetPipe()
      }
    }
  }

  /** Bytes from the receiver: split into records and handled. Exposed so recorded streams can be replayed in tests. */
  feed(bytes: Uint8Array, tMs?: number): void {
    const merged = new Uint8Array(this.buffer.length + bytes.length)
    merged.set(this.buffer)
    merged.set(bytes, this.buffer.length)
    const { records, rest } = splitRecords(merged)
    this.buffer = rest
    for (const rec of records) this.handleRecord(rec, tMs ?? performance.now() - this.t0)
  }

  private handleRecord(rec: Uint8Array, tMs: number): void {
    const kind = classify(rec)
    if (kind === 'aim' || kind === 'trigger') {
      let out: TrackerOutput | null
      if (kind === 'aim') { this.counts.aim++; out = this.tracker.process(rec, tMs) }
      else { this.counts.trigger++; out = this.tracker.process(rec, tMs) }
      if (!out) return
      for (const s of out.samples) this.emit('sample', s)
      if (out.shot && out.trigger) this.emit('shot', { ...out.shot, strength: out.trigger.amplitude })
    } else if (kind === 'aux') {
      this.counts.aux++
      // Acknowledge each feedback packet, and every other one with the light level.
      this.message(KEEPALIVE).catch((e) => this.fail(e as Error))
      if (this.counts.aux % 2 === 1) this.message([[0x50, ...LEVEL], 20000]).catch((e) => this.fail(e as Error))
    }
    this.emit('counts', { ...this.counts })
  }

  private fail(e: Error): void {
    if (this.running) { this.running = false; this.setState('error', e.message) }
  }
}

export { hex }
