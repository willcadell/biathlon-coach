import { supabase } from './supabase'
import type { Bout, ClickAdjustment, CoachNote, MetalBout, Position, Shot, Wind, WindDirection, Workout } from './types'
import { PRECISION_SHOTS } from './types'

const BUCKET = 'target-photos'

async function currentAthleteId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}

// --- Workouts ---

export interface WorkoutRow {
  id: string
  started_at: string
  name: string
  wind: Wind
  wind_direction: WindDirection
  notes: string
}

export interface ClickRow {
  id: string
  workout_id: string
  logged_at: string
  vertical: number
  vertical_dir: 'up' | 'down'
  horizontal: number
  horizontal_dir: 'left' | 'right'
  clips: number
  note: string
}

export interface CoachNoteRow {
  id: string
  workout_id: string
  coach_id: string
  coach_name: string
  created_at: string
  note: string
}

function toClick(row: ClickRow): ClickAdjustment {
  return {
    id: row.id,
    loggedAt: row.logged_at,
    vertical: row.vertical,
    verticalDir: row.vertical_dir,
    horizontal: row.horizontal,
    horizontalDir: row.horizontal_dir,
    // Rows saved before this existed have no value.
    clips: row.clips ?? 0,
    note: row.note,
  }
}

function toCoachNote(row: CoachNoteRow): CoachNote {
  return { id: row.id, coachId: row.coach_id, coachName: row.coach_name, createdAt: row.created_at, note: row.note }
}

export function toWorkout(row: WorkoutRow, clicks: ClickRow[], coachNotes: CoachNoteRow[] = []): Workout {
  return {
    id: row.id,
    startedAt: row.started_at,
    name: row.name,
    wind: row.wind,
    windDirection: row.wind_direction,
    notes: row.notes,
    clickLog: clicks
      .filter((c) => c.workout_id === row.id)
      .map(toClick)
      .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
    coachNotes: coachNotes
      .filter((n) => n.workout_id === row.id)
      .map(toCoachNote)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }
}

export async function putWorkout(workout: Workout): Promise<void> {
  const athleteId = await currentAthleteId()
  const { error } = await supabase.from('workouts').upsert({
    id: workout.id,
    athlete_id: athleteId,
    started_at: workout.startedAt,
    name: workout.name,
    wind: workout.wind,
    wind_direction: workout.windDirection,
    notes: workout.notes,
  })
  if (error) throw error

  // The click log is small and always saved as a whole workout — replace it
  // wholesale rather than diffing inserts/edits/deletes against the server.
  const { error: delErr } = await supabase.from('click_adjustments').delete().eq('workout_id', workout.id)
  if (delErr) throw delErr
  if (workout.clickLog.length > 0) {
    const { error: insErr } = await supabase.from('click_adjustments').insert(
      workout.clickLog.map((c) => ({
        id: c.id,
        workout_id: workout.id,
        logged_at: c.loggedAt,
        vertical: c.vertical,
        vertical_dir: c.verticalDir,
        horizontal: c.horizontal,
        horizontal_dir: c.horizontalDir,
        clips: c.clips,
        note: c.note,
      })),
    )
    if (insErr) throw insErr
  }
}

export async function allWorkouts(): Promise<Workout[]> {
  const [{ data: rows, error }, { data: clicks, error: clickErr }, { data: notes, error: notesErr }] = await Promise.all([
    supabase.from('workouts').select('*').order('started_at', { ascending: false }),
    supabase.from('click_adjustments').select('*'),
    supabase.from('workout_coach_notes').select('*'),
  ])
  if (error) throw error
  if (clickErr) throw clickErr
  if (notesErr) throw notesErr
  return (rows ?? []).map((r) => toWorkout(r, clicks ?? [], notes ?? []))
}

/** Delete a workout and everything shot under it: its precision bouts, their
 *  photos, and its metal bouts. The DB cascades the bout/metal-bout/click
 *  rows; photos in Storage don't cascade, so they're removed here first. */
export async function deleteWorkout(id: string): Promise<void> {
  const { data: bouts } = await supabase.from('precision_bouts').select('image_path').eq('workout_id', id)
  await removeBoutPhotos((bouts ?? []).map((b) => b.image_path))
  const { error } = await supabase.from('workouts').delete().eq('id', id)
  if (error) throw error
}

// --- Precision bouts ---

export interface BoutRow {
  id: string
  workout_id: string
  shot_at: string
  position: Position
  target_face_id: string
  bullet_diameter_mm: number
  expected_shots: number
  image_path: string | null
  mm_per_unit: number
  shots: Shot[]
  metrics: Bout['metrics']
  skied_in: boolean
  notes: string
}

export function toBout(row: BoutRow): Bout {
  return {
    kind: 'precision',
    id: row.id,
    workoutId: row.workout_id,
    shotAt: row.shot_at,
    position: row.position,
    targetFaceId: row.target_face_id,
    bulletDiameterMm: row.bullet_diameter_mm,
    expectedShots: row.expected_shots,
    imagePath: row.image_path,
    shots: row.shots,
    context: { skiedIn: row.skied_in, notes: row.notes },
    mmPerUnit: row.mm_per_unit,
    metrics: row.metrics,
  }
}

export async function allBouts(): Promise<Bout[]> {
  const { data, error } = await supabase.from('precision_bouts').select('*').order('shot_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toBout)
}

/** Save a freshly-scored bout together with its photo. The photo is
 *  uploaded first so the row is never left pointing at a path that doesn't
 *  exist yet. */
export async function putBout(bout: Omit<Bout, 'imagePath'>, image: { full: Blob; thumb: Blob }): Promise<Bout> {
  const athleteId = await currentAthleteId()
  const imagePath = `${athleteId}/${bout.id}`
  const { error: fullErr } = await supabase.storage
    .from(BUCKET)
    .upload(`${imagePath}.jpg`, image.full, { contentType: image.full.type || 'image/jpeg', upsert: true })
  if (fullErr) throw fullErr
  const { error: thumbErr } = await supabase.storage
    .from(BUCKET)
    .upload(`${imagePath}-thumb.jpg`, image.thumb, { contentType: image.thumb.type || 'image/jpeg', upsert: true })
  if (thumbErr) throw thumbErr

  const full: Bout = { ...bout, imagePath }
  const { error } = await supabase.from('precision_bouts').insert({
    id: full.id,
    workout_id: full.workoutId,
    athlete_id: athleteId,
    shot_at: full.shotAt,
    position: full.position,
    target_face_id: full.targetFaceId,
    bullet_diameter_mm: full.bulletDiameterMm,
    expected_shots: full.expectedShots ?? PRECISION_SHOTS,
    image_path: imagePath,
    mm_per_unit: full.mmPerUnit,
    shots: full.shots,
    metrics: full.metrics,
    skied_in: full.context.skiedIn,
    notes: full.context.notes,
  })
  if (error) throw error
  return full
}

/** Re-score an already-saved bout after the athlete refines the shot
 *  placement — same photo, same row, just the shots and what follows from
 *  them. Nothing about the photo or the bout's identity changes. */
export async function updateBoutShots(
  id: string,
  patch: Pick<Bout, 'shots' | 'mmPerUnit' | 'metrics'>,
): Promise<void> {
  const { error } = await supabase
    .from('precision_bouts')
    .update({ shots: patch.shots, mm_per_unit: patch.mmPerUnit, metrics: patch.metrics })
    .eq('id', id)
  if (error) throw error
}

export async function deleteBout(id: string): Promise<void> {
  const { data: row } = await supabase.from('precision_bouts').select('image_path').eq('id', id).maybeSingle()
  await removeBoutPhotos([row?.image_path ?? null])
  const { error } = await supabase.from('precision_bouts').delete().eq('id', id)
  if (error) throw error
}

async function removeBoutPhotos(imagePaths: (string | null)[]): Promise<void> {
  const objects = imagePaths.filter((p): p is string => p !== null).flatMap((p) => [`${p}.jpg`, `${p}-thumb.jpg`])
  if (objects.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove(objects)
  if (error) throw error
}

/** Signed, time-limited URLs for a batch of bout thumbnails — one request
 *  for the whole list rather than one per row. Signed rather than public
 *  because the bucket holds every athlete's photos behind the same RLS
 *  ownership check as the rest of the app. */
export async function boutThumbUrls(imagePaths: string[]): Promise<Record<string, string>> {
  if (imagePaths.length === 0) return {}
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(imagePaths.map((p) => `${p}-thumb.jpg`), 3600)
  if (error) throw error
  const out: Record<string, string> = {}
  data.forEach((d, i) => {
    if (d.signedUrl) out[imagePaths[i]] = d.signedUrl
  })
  return out
}

/** Signed URL for one bout's full-size photo, for reviewing a single bout in
 *  detail — unlike boutThumbUrls' small previews for a whole list. Null once
 *  the athlete has deleted the photos but kept the scored bout. */
export async function boutImageUrl(imagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(`${imagePath}.jpg`, 3600)
  if (error) throw error
  return data?.signedUrl ?? null
}

/** Drop every stored photo but keep the scored bouts. Photos are almost all
 *  of the space this app uses, and once a bout is scored the shot positions
 *  are the record — the picture is only evidence. */
export async function clearImages(): Promise<void> {
  const { data: bouts, error } = await supabase.from('precision_bouts').select('id, image_path')
  if (error) throw error
  const withPhotos = (bouts ?? []).filter((b) => b.image_path !== null)
  if (withPhotos.length === 0) return
  await removeBoutPhotos(withPhotos.map((b) => b.image_path))
  const { error: updErr } = await supabase
    .from('precision_bouts')
    .update({ image_path: null })
    .in('id', withPhotos.map((b) => b.id))
  if (updErr) throw updErr
}

// --- Metal bouts ---

export interface MetalRow {
  id: string
  workout_id: string
  shot_at: string
  position: Position
  hit_alpha: boolean
  hit_beta: boolean
  hit_charlie: boolean
  hit_delta: boolean
  hit_echo: boolean
  heart_rate: number
  combo_id: string | null
  is_race: boolean
}

export function toMetalBout(row: MetalRow): MetalBout {
  return {
    kind: 'metal',
    id: row.id,
    workoutId: row.workout_id,
    shotAt: row.shot_at,
    position: row.position,
    hits: {
      alpha: row.hit_alpha,
      beta: row.hit_beta,
      charlie: row.hit_charlie,
      delta: row.hit_delta,
      echo: row.hit_echo,
    },
    heartRate: row.heart_rate,
    comboId: row.combo_id,
    isRace: row.is_race,
  }
}

export async function putMetalBout(bout: MetalBout): Promise<void> {
  const athleteId = await currentAthleteId()
  const { error } = await supabase.from('metal_bouts').upsert({
    id: bout.id,
    workout_id: bout.workoutId,
    athlete_id: athleteId,
    shot_at: bout.shotAt,
    position: bout.position,
    hit_alpha: bout.hits.alpha,
    hit_beta: bout.hits.beta,
    hit_charlie: bout.hits.charlie,
    hit_delta: bout.hits.delta,
    hit_echo: bout.hits.echo,
    heart_rate: bout.heartRate,
    combo_id: bout.comboId,
    is_race: bout.isRace,
  })
  if (error) throw error
}

export async function allMetalBouts(): Promise<MetalBout[]> {
  const { data, error } = await supabase.from('metal_bouts').select('*').order('shot_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toMetalBout)
}

export async function deleteMetalBout(id: string): Promise<void> {
  const { error } = await supabase.from('metal_bouts').delete().eq('id', id)
  if (error) throw error
}

/** Everything, as JSON, so nothing is trapped in one account. */
export async function exportAll(): Promise<string> {
  const [workouts, bouts, metal] = await Promise.all([allWorkouts(), allBouts(), allMetalBouts()])
  return JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), workouts, bouts, metal }, null, 2)
}
