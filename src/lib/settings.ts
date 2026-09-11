import { DEFAULT_SETTINGS, faceById, type Settings } from './types'

const KEY = 'biathlon-coach:settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const stored = JSON.parse(raw) as Partial<Settings>
    const merged = { ...DEFAULT_SETTINGS, ...stored }
    // Settings saved before target faces existed carry an aiming-mark size
    // that belongs to no face. Trust the face rather than the stale number,
    // because a wrong ruler silently corrupts every measurement.
    if (stored.targetFaceId === undefined) {
      merged.aimingMarkMm = faceById(merged.targetFaceId).blackMm
    }
    return merged
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // A full or locked store is not worth crashing the app over.
  }
}
