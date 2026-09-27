import type { Bout } from './types'
import { boutPhotoBlob } from './db'
import { devModeOn } from './dev'
import { supabase } from './supabase'

/**
 * Anonymous target contributions, to improve automatic hole detection.
 *
 * What's sent is a smaller copy of the photo and the confirmed hole positions,
 * and nothing that says whose it is — see the training_targets migration. A
 * submission can't be traced back or withdrawn later; the athlete is told that
 * when they choose.
 *
 * It's the athlete's choice, made once (asked at first sign-in, changeable in
 * Settings). When it's on, each target scored from then on is contributed in the
 * background. The server enforces the choice as well, so this can't run without it.
 */

const CONTRIBUTED_KEY = 'biathlon-coach:contributed'
/** Enough resolution to find a hole, small enough to keep the upload light. */
const MAX_EDGE = 1400

/** Which bouts this device has already contributed, so none is sent twice.
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
    // Sending it again is harmless: the server drops a duplicate photo.
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

export interface Contribution {
  /** null = not asked yet. */
  choice: boolean | null
  /** Only targets shot after this are contributed. */
  since: string | null
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}

export async function getContribution(): Promise<Contribution> {
  const { data, error } = await supabase
    .from('athlete_preferences').select('contribute_targets, contribute_since').maybeSingle()
  if (error) throw error
  return { choice: data?.contribute_targets ?? null, since: data?.contribute_since ?? null }
}

/** Saying yes starts from now: targets already logged aren't swept up. */
export async function setContribution(yes: boolean): Promise<Contribution> {
  const next: Contribution = { choice: yes, since: yes ? new Date().toISOString() : null }
  const { error } = await supabase.from('athlete_preferences').upsert({
    athlete_id: await currentUserId(),
    contribute_targets: next.choice,
    contribute_since: next.since,
  })
  if (error) throw error
  return next
}

const inFlight = new Set<string>()
const failed = new Set<string>()
/** A pass at a time is plenty: scoring a target is not a burst. */
const PER_PASS = 4

/**
 * Contributes any target scored since the athlete said yes that hasn't gone yet.
 * Quiet by design: a failure (offline, a photo already dropped) leaves the target
 * for a later pass, and never interrupts the athlete.
 */
export async function contributePending(bouts: Bout[], since: string): Promise<void> {
  if (devModeOn()) return
  const cutoff = new Date(since).getTime()
  const due = bouts.filter(
    (b) =>
      b.imagePath && new Date(b.shotAt).getTime() >= cutoff &&
      !wasContributed(b.id) && !inFlight.has(b.id) && !failed.has(b.id),
  ).slice(0, PER_PASS)
  for (const bout of due) {
    inFlight.add(bout.id)
    try {
      await contributeBout(bout)
    } catch {
      failed.add(bout.id)
    } finally {
      inFlight.delete(bout.id)
    }
  }
}
