/**
 * The count-in before a timed drill: one short beep a second, then a longer, higher
 * one on "Go". Made with Web Audio, so there are no sound files to load, and it must
 * be started from a tap (a browser will not play sound otherwise). It plays nothing,
 * and throws nothing, where audio is unavailable or the phone is on silent: the
 * count on screen is the same count.
 */

export interface CountInSound {
  /** Silence whatever has not played yet. */
  stop: () => void
}

const SILENT: CountInSound = { stop: () => {} }

export function playCountIn(seconds: number): CountInSound {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return SILENT
    const ctx = new Ctx()
    void ctx.resume()
    const start = ctx.currentTime + 0.05
    const tone = (at: number, hz: number, length: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = hz
      osc.connect(gain)
      gain.connect(ctx.destination)
      // A short ramp in and out, or the tone clicks.
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.4, at + 0.01)
      gain.gain.setValueAtTime(0.4, at + length - 0.03)
      gain.gain.linearRampToValueAtTime(0, at + length)
      osc.start(at)
      osc.stop(at + length)
    }
    for (let i = 0; i < seconds; i++) tone(start + i, 660, 0.14)
    tone(start + seconds, 1320, 0.5)
    return { stop: () => { void ctx.close().catch(() => {}) } }
  } catch {
    return SILENT
  }
}
