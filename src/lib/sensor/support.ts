// Whether the sensor trainer can be offered at all: only on a computer, in a browser that has WebUSB, on a secure page.
// An iPhone or iPad cannot use it (Safari has no WebUSB), and a phone or tablet is the wrong place for it, so there the dry-fire
// screen shows nothing about it.

export interface SensorSupport {
  ok: boolean
  /** Why not, for a developer or a help line; the screen itself stays quiet when the sensor trainer is not available. */
  reason?: 'not-a-computer' | 'no-webusb' | 'insecure-page' | 'narrow-screen'
}

interface Env {
  userAgent: string
  /** navigator.userAgentData?.mobile */
  mobileHint: boolean | undefined
  hasUsb: boolean
  secure: boolean
  width: number
  finePointer: boolean
}

/** The decision, separated from the browser so it can be tested. */
export function judgeSupport(env: Env): SensorSupport {
  const handheld = env.mobileHint === true || /Android|iPhone|iPad|iPod|Mobile|CriOS|FxiOS/i.test(env.userAgent)
  if (handheld || !env.finePointer) return { ok: false, reason: 'not-a-computer' }
  if (!env.hasUsb) return { ok: false, reason: 'no-webusb' }
  if (!env.secure) return { ok: false, reason: 'insecure-page' }
  if (env.width < 900) return { ok: false, reason: 'narrow-screen' }
  return { ok: true }
}

export function sensorSupport(): SensorSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return { ok: false, reason: 'not-a-computer' }
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean }; usb?: unknown }
  return judgeSupport({
    userAgent: nav.userAgent,
    mobileHint: nav.userAgentData?.mobile,
    hasUsb: !!nav.usb,
    secure: window.isSecureContext,
    width: window.innerWidth,
    finePointer: window.matchMedia('(pointer: fine)').matches,
  })
}
