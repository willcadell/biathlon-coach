/**
 * A random id that works outside a secure context.
 *
 * `crypto.randomUUID()` only runs over HTTPS or `localhost`, which rules out
 * exactly the way this app gets tried first — from a phone, over plain HTTP,
 * against a dev server on the local network. `getRandomValues` carries no
 * such restriction, so build a UUID v4 from it by hand.
 */
export function uuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
