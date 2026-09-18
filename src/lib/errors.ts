/**
 * Reads a human-readable message out of whatever a failed call actually
 * threw. Supabase's own errors (PostgrestError, AuthError, and plain
 * objects from some rejected RPC calls) don't reliably extend the native
 * Error class, so `e instanceof Error` alone silently falls through to a
 * generic fallback and hides the real reason — exactly the gap that made a
 * genuine RLS/schema error look like "check your connection" instead of
 * saying what actually went wrong.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return fallback
}
