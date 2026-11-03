import { supabase } from './supabase'
import type { Bout, Bull, ClickAdjustment, CoachNote, MetalBout, NationalTest, NationalTestStage, PendingTarget, Position, RaceType, SensorSession, SensorShot, Shot, TemplateRun, TemplateStep, TimeSource, Wind, WindDirection, Workout, WorkoutTemplate, WorkoutType } from './types'
import { PRECISION_SHOTS } from './types'
import { currentUserId as currentAthleteId } from './auth'

const BUCKET = 'target-photos'


// --- Workouts ---

export interface WorkoutRow {
  id: string
  started_at: string
  name: string
  workout_type: WorkoutType
  template?: TemplateRun | null
  wind_logged_at?: string | null
  weather_notes?: string | null
  zero_confirmed_at?: string | null
  wind: Wind
  wind_direction: WindDirection
  notes: string
  race_type: RaceType | null
  dryfire_minutes: number
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
    workoutType: row.workout_type,
    wind: row.wind,
    windDirection: row.wind_direction,
    notes: row.notes,
    raceType: row.race_type,
    dryfireMinutes: row.dryfire_minutes,
    template: row.template ?? null,
    windLoggedAt: row.wind_logged_at ?? null,
    weatherNotes: row.weather_notes ?? '',
    zeroConfirmedAt: row.zero_confirmed_at ?? null,
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
  const row = {
    id: workout.id,
    athlete_id: athleteId,
    started_at: workout.startedAt,
    name: workout.name,
    workout_type: workout.workoutType,
    wind: workout.wind,
    wind_direction: workout.windDirection,
    notes: workout.notes,
    race_type: workout.raceType,
    dryfire_minutes: workout.dryfireMinutes,
    // Only sent when set, so a session saves the same as before wherever the column is missing.
    ...(workout.template ? { template: workout.template } : {}),
  }
  const { error: firstErr } = await supabase.from('workouts').upsert({
    ...row, wind_logged_at: workout.windLoggedAt ?? null, weather_notes: workout.weatherNotes ?? '', zero_confirmed_at: workout.zeroConfirmedAt ?? null,
  })
  // A database that has not had the weather migration yet: save the workout without it.
  const missing = ['wind_logged_at', 'weather_notes', 'zero_confirmed_at'].some((c) => (firstErr?.message ?? '').includes(c))
  const error = firstErr && missing ? (await supabase.from('workouts').upsert(row)).error : firstErr
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
  // Scoped to the signed-in athlete on purpose: RLS also lets a coach read the
  // workouts of athletes they coach, so "everything I can read" is not "my own"
  // for anyone who is both — their coached athletes' training would land in
  // their own history, analysis and export.
  const athleteId = await currentAthleteId()
  const [{ data: rows, error }, { data: clicks, error: clickErr }, { data: notes, error: notesErr }] = await Promise.all([
    supabase.from('workouts').select('*').eq('athlete_id', athleteId).order('started_at', { ascending: false }),
    supabase.from('click_adjustments').select('*'),
    supabase.from('workout_coach_notes').select('*'),
  ])
  if (error) throw error
  if (clickErr) throw clickErr
  if (notesErr) throw notesErr
  // Click logs and notes have no athlete column; keep only those on these workouts.
  const own = new Set((rows ?? []).map((r) => r.id as string))
  return (rows ?? []).map((r) =>
    toWorkout(r, (clicks ?? []).filter((c) => own.has(c.workout_id)), (notes ?? []).filter((n) => own.has(n.workout_id))),
  )
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
  time_source?: TimeSource | null
  position: Position
  target_face_id: string
  bullet_diameter_mm: number
  expected_shots: number
  image_path: string | null
  mm_per_unit: number
  shots: Shot[]
  bulls: Bull[] | null
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
    ...(row.time_source ? { timeSource: row.time_source } : {}),
    position: row.position,
    targetFaceId: row.target_face_id,
    bulletDiameterMm: row.bullet_diameter_mm,
    expectedShots: row.expected_shots,
    imagePath: row.image_path,
    shots: row.shots,
    bulls: row.bulls ?? undefined,
    context: { skiedIn: row.skied_in, notes: row.notes },
    mmPerUnit: row.mm_per_unit,
    metrics: row.metrics,
  }
}

export async function allBouts(): Promise<Bout[]> {
  // Own bouts only — see allWorkouts.
  const athleteId = await currentAthleteId()
  const { data, error } = await supabase.from('precision_bouts').select('*').eq('athlete_id', athleteId).order('shot_at', { ascending: false })
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
  const row = {
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
    bulls: full.bulls ?? null,
    metrics: full.metrics,
    skied_in: full.context.skiedIn,
    notes: full.context.notes,
  }
  const { error } = await supabase.from('precision_bouts').insert(withTimeSource(row, full.timeSource))
  if (error && missingTimeSource(error)) {
    const retry = await supabase.from('precision_bouts').insert(row)
    if (retry.error) throw retry.error
    return full
  }
  if (error) throw error
  return full
}

/** Re-score an already-saved bout after the athlete refines the shot
 *  placement — same photo, same row, just the shots and what follows from
 *  them. Nothing about the photo or the bout's identity changes. */
export async function updateBoutShots(
  id: string,
  patch: Pick<Bout, 'shots' | 'mmPerUnit' | 'metrics'> & { bulls?: Bull[] },
): Promise<void> {
  const { error } = await supabase
    .from('precision_bouts')
    .update({ shots: patch.shots, mm_per_unit: patch.mmPerUnit, metrics: patch.metrics, ...(patch.bulls ? { bulls: patch.bulls } : {}) })
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
/** The stored full-size photo, for the athlete's own use (e.g. contributing it). */
export async function boutPhotoBlob(imagePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${imagePath}.jpg`)
  if (error || !data) throw error ?? new Error('Could not read the photo')
  return data
}

export async function boutImageUrl(imagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(`${imagePath}.jpg`, 3600)
  if (error) throw error
  return data?.signedUrl ?? null
}

/** Drop every stored photo but keep the scored bouts. Photos are almost all
 *  of the space this app uses, and once a bout is scored the shot positions
 *  are the record — the picture is only evidence. */
export async function clearImages(): Promise<void> {
  const { data: bouts, error } = await supabase
    .from('precision_bouts').select('id, image_path').eq('athlete_id', await currentAthleteId())
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

/** A row with its `time_source`, when it has one. Rows only carry the column when it is set, so
 *  bouts without one are written exactly as before. */
function withTimeSource<T extends object>(row: T, source: TimeSource | undefined): T & { time_source?: TimeSource } {
  return source ? { ...row, time_source: source } : row
}
const missingTimeSource = (e: { message?: string }) => (e.message ?? '').includes('time_source')

export interface MetalRow {
  time_source?: TimeSource | null
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
  target_zone: number | null
}

export function toMetalBout(row: MetalRow): MetalBout {
  return {
    kind: 'metal',
    id: row.id,
    workoutId: row.workout_id,
    shotAt: row.shot_at,
    ...(row.time_source ? { timeSource: row.time_source } : {}),
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
    targetZone: row.target_zone,
  }
}

export async function putMetalBout(bout: MetalBout): Promise<void> {
  const athleteId = await currentAthleteId()
  const row = {
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
    target_zone: bout.targetZone,
  }
  const { error } = await supabase.from('metal_bouts').upsert(withTimeSource(row, bout.timeSource))
  // A database that has not had the time_source migration yet: save the bout without it.
  if (error && missingTimeSource(error)) {
    const retry = await supabase.from('metal_bouts').upsert(row)
    if (retry.error) throw retry.error
    return
  }
  if (error) throw error
}

export async function allMetalBouts(): Promise<MetalBout[]> {
  // Own bouts only — see allWorkouts.
  const athleteId = await currentAthleteId()
  const { data, error } = await supabase.from('metal_bouts').select('*').eq('athlete_id', athleteId).order('shot_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toMetalBout)
}

export async function deleteMetalBout(id: string): Promise<void> {
  const { error } = await supabase.from('metal_bouts').delete().eq('id', id)
  if (error) throw error
}

// --- Sensor sessions ---

export interface SensorSessionRow {
  id: string
  workout_id: string
  started_at: string
  position: Position
  minutes: number
  shots: SensorShot[]
}

export function toSensorSession(row: SensorSessionRow): SensorSession {
  return { id: row.id, workoutId: row.workout_id, startedAt: row.started_at, position: row.position, minutes: row.minutes, shots: row.shots ?? [] }
}

export async function putSensorSession(session: SensorSession): Promise<void> {
  const athleteId = await currentAthleteId()
  const { error } = await supabase.from('sensor_sessions').upsert({
    id: session.id,
    workout_id: session.workoutId,
    athlete_id: athleteId,
    started_at: session.startedAt,
    position: session.position,
    minutes: session.minutes,
    shots: session.shots,
  })
  if (error) throw error
}

export async function allSensorSessions(): Promise<SensorSession[]> {
  // Own sessions only — see allWorkouts.
  const athleteId = await currentAthleteId()
  const { data, error } = await supabase.from('sensor_sessions').select('*').eq('athlete_id', athleteId).order('started_at', { ascending: false })
  if (error) throw error
  return (data as SensorSessionRow[] ?? []).map(toSensorSession)
}

export async function deleteSensorSession(id: string): Promise<void> {
  const { error } = await supabase.from('sensor_sessions').delete().eq('id', id)
  if (error) throw error
}

// --- Pending targets ---

export interface PendingTargetRow {
  id: string
  workout_id: string
  shot_at: string
  position: Position
}

export async function putPendingTarget(target: PendingTarget): Promise<void> {
  const athleteId = await currentAthleteId()
  const { error } = await supabase.from('pending_targets').upsert({
    id: target.id,
    workout_id: target.workoutId,
    athlete_id: athleteId,
    shot_at: target.shotAt,
    position: target.position,
  })
  if (error) throw error
}

export async function allPendingTargets(): Promise<PendingTarget[]> {
  const athleteId = await currentAthleteId()
  const { data, error } = await supabase.from('pending_targets').select('*').eq('athlete_id', athleteId).order('shot_at')
  if (error) throw error
  return (data as PendingTargetRow[] ?? []).map((r) => ({ id: r.id, workoutId: r.workout_id, shotAt: r.shot_at, position: r.position }))
}

export async function deletePendingTarget(id: string): Promise<void> {
  const { error } = await supabase.from('pending_targets').delete().eq('id', id)
  if (error) throw error
}

// --- Workout templates ---

export interface WorkoutTemplateRow {
  id: string
  name: string
  steps: TemplateStep[]
}

export async function putTemplate(template: WorkoutTemplate): Promise<void> {
  const athleteId = await currentAthleteId()
  const { error } = await supabase.from('workout_templates').upsert({
    id: template.id,
    athlete_id: athleteId,
    name: template.name,
    steps: template.steps,
  })
  if (error) throw error
}

export async function allTemplates(): Promise<WorkoutTemplate[]> {
  const athleteId = await currentAthleteId()
  const { data, error } = await supabase.from('workout_templates').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false })
  if (error) throw error
  return (data as WorkoutTemplateRow[] ?? []).map((r) => ({ id: r.id, name: r.name, steps: r.steps ?? [] }))
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('workout_templates').delete().eq('id', id)
  if (error) throw error
}

// --- National Team tests ---

export interface NationalTestRow {
  id: string
  workout_id: string
  started_at: string
  stages: NationalTestStage[]
  prone_bout_id: string | null
  standing_bout_id: string | null
}

export function toNationalTest(row: NationalTestRow): NationalTest {
  return { id: row.id, workoutId: row.workout_id, startedAt: row.started_at, stages: row.stages ?? [], proneBoutId: row.prone_bout_id ?? null, standingBoutId: row.standing_bout_id ?? null }
}

export async function putNationalTest(test: NationalTest): Promise<void> {
  const athleteId = await currentAthleteId()
  const { error } = await supabase.from('national_tests').upsert({
    id: test.id,
    workout_id: test.workoutId,
    athlete_id: athleteId,
    started_at: test.startedAt,
    stages: test.stages,
    prone_bout_id: test.proneBoutId,
    standing_bout_id: test.standingBoutId,
  })
  if (error) throw error
}

/** Remove a test and the two precision groups shot for it, photos included. */
export async function deleteNationalTest(test: NationalTest): Promise<void> {
  for (const id of [test.proneBoutId, test.standingBoutId]) {
    if (!id) continue
    // Either a photographed bout or a target still waiting for its photo.
    await deleteBout(id)
    await deletePendingTarget(id)
  }
  const { error } = await supabase.from('national_tests').delete().eq('id', test.id)
  if (error) throw error
}

export async function allNationalTests(): Promise<NationalTest[]> {
  // Own tests only — see allWorkouts.
  const athleteId = await currentAthleteId()
  const { data, error } = await supabase.from('national_tests').select('*').eq('athlete_id', athleteId).order('started_at', { ascending: false })
  if (error) throw error
  return (data as NationalTestRow[] ?? []).map(toNationalTest)
}

/** Everything, as JSON, so nothing is trapped in one account. */
export async function exportAll(): Promise<string> {
  const [workouts, bouts, metal, sensor, nationalTests] = await Promise.all([allWorkouts(), allBouts(), allMetalBouts(), allSensorSessions(), allNationalTests().catch(() => [] as NationalTest[])])
  return JSON.stringify({ version: 5, exportedAt: new Date().toISOString(), workouts, bouts, metal, sensor, nationalTests }, null, 2)
}
