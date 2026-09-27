import type { Bout } from './types'
import { boutPhotoBlob } from './db'
import { supabase } from './supabase'

/**
 * Anonymous target contributions, to improve automatic hole detection.
 *
 * What's sent is a smaller copy of the photo and the confirmed hole positions,
 * and nothing that says whose it is — see the training_targets migration. The
 * database function can't be given an account, so a submission can't be traced
 * back or withdrawn later; the app says so before sending.
 */

const CONTRIBUTED_KEY = 'biathlon-coach:contributed'
/** Enough resolution to find a hole, small enough to keep the upload light. */
const MAX_EDGE = 1400

/** Which bouts this device has already contributed, so the button doesn't offer it twice.
 *  Kept only on the device: the server deliberately can't say. */
export function wasContributed(boutId: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(CONTRIBUTED_KEY) ?? '[]') as string[]).includes(boutId)
  } catch {
    return false
  }
}

function markContributed(boutId: string): void {
  try {
    const ids = new Set(JSON.parse(localStorage.getItem(CONTRIBUTED_KEY) ?? '[]') as string[])
    ids.add(boutId)
    localStorage.setItem(CONTRIBUTED_KEY, JSON.stringify([...ids]))
  } catch {
    // Offering it again is harmless: the server drops a duplicate photo.
  }
}

/** Re-encoding through a canvas is what removes the camera and location
 *  metadata: only pixels are copied across. */
async function reducedJpegBase64(photo: Blob): Promise<string> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  if (!blob) throw new Error('Could not prepare the photo')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

/** Returns false when this exact photo had already been contributed. */
export async function contributeBout(bout: Bout): Promise<boolean> {
  if (!bout.imagePath) throw new Error('This target has no photo to contribute')
  const photo = await reducedJpegBase64(await boutPhotoBlob(bout.imagePath))
  const { data, error } = await supabase.rpc('submit_training_target', {
    p_photo_base64: photo,
    p_target_face_id: bout.targetFaceId,
    p_bullet_diameter_mm: bout.bulletDiameterMm,
    p_mm_per_unit: bout.mmPerUnit,
    p_position: bout.position,
    p_expected_shots: bout.expectedShots ?? null,
    // Positions only: no firing order, no bull ids.
    p_shots: bout.shots.map((s) => ({ x: s.mm.x, y: s.mm.y })),
  })
  if (error) throw error
  markContributed(bout.id)
  return data === true
}
