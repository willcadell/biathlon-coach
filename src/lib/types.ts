/** Shooting position. Biathlon uses two, with very different target sizes. */
export type Position = 'prone' | 'standing'

/** A point in the target plane, millimetres, origin at the aiming-mark centre.
 *  +x is right, +y is UP (so the maths reads like a target, not like a canvas). */
export interface Point {
  x: number
  y: number
}

/** One detected hole, in normalised image coordinates (0..1, y down). */
export interface ImagePoint {
  x: number
  y: number
}

/** An aiming mark ("bull") found in the photo, plus the holes belonging to it.
 *  Biathlon zeroing targets are often five separate bulls with one shot each;
 *  a plain grouping target is a single bull with five shots. Both are this shape. */
export interface Bull {
  id: string
  /** Centre of the aiming mark, normalised image coords. */
  centre: ImagePoint
  /** Aiming mark as seen by the camera. A circle photographed off-axis is an
   *  ellipse; the ratio of the axes is what lets us undo the perspective. */
  semiMajor: number
  semiMinor: number
  /** Rotation of the major axis, degrees clockwise from image +x. */
  rotationDeg: number
  holes: ImagePoint[]
}

/** What the vision pass returns before the athlete corrects it. */
export interface Detection {
  bulls: Bull[]
  /** Free-text note from the model about image quality, occlusion, etc. */
  notes: string
  /** Model's own confidence that every hole was found, 0..1. */
  confidence: number
}

/**
 * A printed target face.
 *
 * The black aiming area is the calibration reference — it is the largest
 * feature with a known size that a camera can find reliably, so every
 * millimetre in this app is derived from its diameter.
 */
export interface TargetFace {
  id: string
  name: string
  /** Diameter of the solid black aiming area, mm. The ruler for everything. */
  blackMm: number
  /** Diameter of the ten ring, mm. */
  tenRingMm: number
  /** Radial gap between one ring line and the next, mm. */
  ringSpacingMm: number
  /** Lowest scoring ring printed on the face. */
  lowestRing: number
  /** Diameter of the inner ten, mm, used to break ties. Zero if not printed. */
  innerTenMm: number
  note: string
}

export const TARGET_FACES: TargetFace[] = [
  {
    id: 'issf-50m',
    name: 'ISSF 50 m rifle',
    blackMm: 112.4,
    tenRingMm: 10.4,
    ringSpacingMm: 8,
    lowestRing: 1,
    innerTenMm: 5,
    note: 'The standard 50 m precision face. Rings 4 to 10 sit inside the black.',
  },
  {
    id: 'issf-10m-air',
    name: 'ISSF 10 m air rifle',
    blackMm: 30.5,
    tenRingMm: 0.5,
    ringSpacingMm: 2.5,
    lowestRing: 1,
    innerTenMm: 0,
    note: 'For indoor air training. The rings are small enough that a photo cannot always separate them.',
  },
]

export const faceById = (id: string): TargetFace =>
  TARGET_FACES.find((f) => f.id === id) ?? TARGET_FACES[0]

/** One shot's ring value under the inward-gauge rule. */
export interface RingScore {
  /** 10 down to 1, or 0 for a shot outside the lowest ring. */
  value: number
  /** True when the hole is inside the inner ten. */
  innerTen: boolean
  /** Distance from centre to the nearest edge of the hole, mm. */
  edgeDistance: number
  /**
   * True when measurement error could move the shot into an adjacent ring.
   * Worth checking the paper with a gauge before believing the number.
   */
  borderline: boolean
}

/** A single shot after calibration into target-plane millimetres. */
export interface Shot {
  /** 1-based firing order, as far as we can tell. */
  order: number
  /** Offset from the aiming-mark centre, mm. */
  mm: Point
  /** Which bull it came from (for multi-bull targets). */
  bullId: string
}

/** Clock position the wind blows FROM, facing the target: 12 is a headwind,
 *  6 a tailwind, 3 and 9 full crosswind from the right and left. Meaningless
 *  when wind is 'none'. */
export type WindDirection = '12' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11'

export type Wind = 'none' | 'light' | 'moderate' | 'strong'

/** Conditions worth recording on one bout, because they explain a lot of bad
 *  groups. Wind lives on the Workout instead — it doesn't change bout to
 *  bout inside one session, so it is entered once, not retyped every time. */
export interface Context {
  /** Did the athlete ski in, or shoot cold off the mat? */
  skiedIn: boolean
  /** Free notes: ammo lot, rifle, how it felt. */
  notes: string
}

/**
 * What a bout has to be scored against.
 *
 * The face and the bullet are properties of the bout, because the shot
 * coordinates were measured against that face's black. The click value is a
 * property of the rifle, so it comes from settings and a later calibration
 * corrects the advice on every past bout.
 */
export interface ScoringContext {
  faceId: string
  bulletDiameterMm: number
  mmPerClick: number
}

/** One precision bout: five or ten shots at one position, from one photo,
 *  scored against printed rings. Belongs to a Workout. */
export interface Bout {
  kind: 'precision'
  id: string
  /** The workout this bout was shot as part of. */
  workoutId: string
  /** ISO timestamp. */
  shotAt: string
  position: Position
  /** The face this was shot on. Fixed at capture; changing settings later
   *  must not rescore old paper against a target it was never shot at. */
  targetFaceId: string
  /** Bullet diameter used for the inward gauge, mm. Also fixed at capture. */
  bulletDiameterMm: number
  /** How many shots this bout was set up for: 5 for a normal bout, 10 for a
   *  precision test. A hint to the reader and to vision detection, not
   *  enforced — the actual count is whatever ends up in `shots`. Bouts saved
   *  before this existed have no value, so read it as `?? 5`. */
  expectedShots?: number
  /** Storage path of the photo, without extension — `<path>.jpg` is the
   *  full image, `<path>-thumb.jpg` the list thumbnail. Null once the
   *  athlete has deleted the photos but kept the scored bout. */
  imagePath: string | null
  shots: Shot[]
  context: Context
  /** Millimetres per normalised image unit, derived at calibration time. */
  mmPerUnit: number
  /** Metrics, computed once and cached so history views stay cheap. */
  metrics: BoutMetrics
}

/**
 * One metal bout: the biathlon range itself, five falling discs, prone or
 * standing. There is no photo and no shot position — a miss is a miss,
 * wherever on the plate it landed — so this cannot feed the shape-based
 * coaching diagnostics a precision bout can. What it tracks instead is hit
 * rate over time, which is the number that actually decides a race.
 */
/** The five metal targets, left to right as the shooter sees them downrange —
 *  standard biathlon call signs. */
export type MetalTarget = 'alpha' | 'beta' | 'charlie' | 'delta' | 'echo'

export interface MetalBout {
  kind: 'metal'
  id: string
  workoutId: string
  shotAt: string
  position: Position
  /** Which of the five targets fell (were hit), left to right. Recorded per
   *  target rather than as a bare count so a pattern — a target that keeps
   *  getting missed — can actually be found later. */
  hits: Record<MetalTarget, boolean>
  /** Heart rate coming off the range/ski, bpm. 0 = not recorded. Matters
   *  more here than on a precision bout — cold-vs-raced heart rate is
   *  exactly what separates a calm-range hit rate from a race one. */
  heartRate: number
  /** Ties this bout to others fired in the same ski-shoot combo — a
   *  repeated interval session (ski a loop, shoot, repeat) — so they read
   *  together as one round-by-round set instead of loose entries. Null for
   *  a standalone metal bout. */
  comboId: string | null
}

/** Either kind of bout a workout can hold. */
export type WorkoutEntry = Bout | MetalBout

/** One click adjustment actually dialed into the rifle during a workout's
 *  zero process — a log of what was done, distinct from the correction this
 *  app computes as a suggestion from a bout's group. */
export interface ClickAdjustment {
  id: string
  loggedAt: string
  vertical: number
  verticalDir: 'up' | 'down'
  horizontal: number
  horizontalDir: 'left' | 'right'
  /** Magazines fired afterward to confirm the new zero held, 0-9. */
  clips: number
  note: string
}

/** Feedback a coach left on an athlete's workout — the one thing a coach can
 *  write on data that is otherwise read-only to them. Shared across every
 *  coach linked to the athlete, not just the one who wrote it. */
export interface CoachNote {
  id: string
  coachId: string
  /** Captured at write time, since the athlete reading this has no way to
   *  look a coach's name up themselves. */
  coachName: string
  createdAt: string
  note: string
}

/** The four IBU race formats — each shot in a fixed prone/standing order,
 *  distinguishing a race workout from training beyond just a flag. */
export type RaceType = 'sprint' | 'individual' | 'mass-start' | 'pursuit'

/**
 * A training session: one or more precision bouts and metal bouts, shot
 * under one set of conditions. Wind is entered once here rather than per
 * bout, because it does not change bout to bout inside a session — and any
 * clicks dialed into the rifle along the way are logged here too, since a
 * zero correction is something you do between bouts, not a property of one.
 */
/** A range session shoots (precision and/or metal bouts, wind, zero
 *  clicks); a dryfire session is just time spent and how it went — no
 *  target, no range required. */
export type WorkoutType = 'range' | 'dryfire'

export interface Workout {
  id: string
  /** ISO timestamp of the first bout, or when the workout was started. */
  startedAt: string
  /** Optional label — falls back to the date wherever it's shown when empty. */
  name: string
  workoutType: WorkoutType
  wind: Wind
  /** Clock position the wind blew from. Only meaningful when wind is not 'none'. */
  windDirection: WindDirection
  clickLog: ClickAdjustment[]
  /** Free notes about the session as a whole — how it felt, what changed,
   *  anything worth remembering that isn't tied to one specific bout. */
  notes: string
  /** Feedback left by a coach who coaches this athlete, oldest first. Empty
   *  for an athlete with no linked coach, or a workout no coach has seen. */
  coachNotes: CoachNote[]
  /** Set when the whole workout was a race rather than training — the format
   *  raced, not just a yes/no, since a sprint and an individual read very
   *  differently. Null for an ordinary training session. Never set for a
   *  dryfire session. */
  raceType: RaceType | null
  /** Minutes spent, for a dryfire session. 0 and unused for a range session. */
  dryfireMinutes: number
}

export interface Ellipse {
  /** Semi-axis lengths in mm, major first. */
  major: number
  minor: number
  /** Major axis angle, degrees counter-clockwise from horizontal, -90..90. */
  angleDeg: number
  /** major / minor. 1 = round, >1 = strung out. */
  aspect: number
}

export interface BoutMetrics {
  /** Mean point of impact, mm from aiming centre. */
  mpi: Point
  /** Distance of the MPI from centre, mm. The zero error. */
  mpiOffset: number
  /** Mean distance of each shot from the MPI, mm. The honest group statistic. */
  meanRadius: number
  /** Largest distance between any two shots, mm. What everyone quotes. */
  extremeSpread: number
  /** Group shape from the shot covariance. */
  ellipse: Ellipse
  /** Shots inside the hit zone as actually fired. */
  hits: number
  /** Shots that would have hit if the rifle were zeroed perfectly.
   *  hitsIfZeroed > hits means the problem is the sight, not the shooter. */
  hitsIfZeroed: number
  /** Distance of shot 1 from the MPI of shots 2..n, mm. Cold-shot check. */
  firstShotDeviation: number
  /** Per-shot drift across the bout, mm per shot, from a least-squares fit. */
  drift: Point
  /** Index (0-based) of a shot that sits far outside the rest, or null. */
  flierIndex: number | null
  /** Sight correction to bring the MPI to centre. */
  correction: SightCorrection
  /** Ring value per shot, in firing order. */
  rings: RingScore[]
  /** Sum of the ring values. */
  ringTotal: number
  /** The most this bout could have scored. */
  ringPossible: number
  /**
   * What the same group would have scored with the sight corrected. The gap to
   * ringTotal is the price of the current zero, in points.
   */
  ringTotalIfZeroed: number
  /** Inner tens, the usual tiebreaker. */
  innerTens: number
  /** Shots close enough to a ring line that the reading could go either way. */
  borderlineShots: number
  /**
   * True for a shot whose hole straddles the true edge of the hit zone
   * (HIT_ZONE_MM) — a "splitter". On a real steel target, contact right at
   * the edge is a coin flip on whether the disc actually falls, the same way
   * a hole touching a printed ring line is a coin flip on which ring it
   * counts for. Parallel to shots, in firing order.
   */
  splitters: boolean[]
  /** Count of the above, the usual shorthand for a notice. */
  splitterShots: number
}

export interface SightCorrection {
  vertical: number
  verticalDir: 'up' | 'down'
  horizontal: number
  horizontalDir: 'left' | 'right'
}

export type FindingId =
  | 'zero_offset'
  | 'vertical_stringing'
  | 'horizontal_stringing'
  | 'trigger_bias'
  | 'wide_group'
  | 'flier'
  | 'cold_first_shot'
  | 'fatigue_drift'
  | 'standing_gap'
  | 'unstable_npa'
  | 'wind_sensitivity'
  | 'early_signs'
  | 'solid'

export interface Finding {
  id: FindingId
  title: string
  /** What the data actually says. */
  evidence: string
  /** The most likely cause, in coaching language. */
  cause: string
  severity: 'info' | 'watch' | 'priority'
  /** 0..1. Low when it rests on one bout. */
  confidence: number
  /** How many bouts contributed. */
  sampleSize: number
  position: Position | 'both'
}

export interface Drill {
  id: string
  name: string
  /** One line: what it fixes. */
  purpose: string
  /** Numbered steps. */
  steps: string[]
  minutes: number
  /** Sessions per week. */
  frequency: string
  /** Findings this drill answers. */
  addresses: FindingId[]
  /** Can be done without a range. */
  dryFire: boolean
}

export interface Settings {
  /** Anthropic API key, stored locally in this browser only. */
  apiKey: string
  /** Which printed target face you shoot. Sets the scoring rings and the ruler. */
  targetFaceId: string
  /** Bullet diameter, mm. Decides how much of a ring line a hole can break. */
  bulletDiameterMm: number
  /** Which Claude model reads the target photos. */
  model: 'claude-opus-5' | 'claude-sonnet-5'
  /** Sight click value, mm of movement at 50 m per click. Calibrate it. */
  mmPerClick: number
  /**
   * Diameter of the black on the paper you shoot, mm. Follows the chosen face,
   * and is editable for a face printed at a reduced size for short-range work.
   */
  aimingMarkMm: number
  /** Right- or left-handed, so bias diagnoses point the right way. */
  handedness: 'right' | 'left'
  /** Experimental: find shots with plain image processing instead of
   *  sending the crop to Claude — free and instant, but rougher, and a
   *  merged cluster is flagged rather than split for you. On by default;
   *  the ring itself is always found this way regardless of this setting. */
  localHoleDetection: boolean
}

/** A precision (paper, photo-scored) bout is always this many shots. A metal
 *  bout is DISCS_PER_METAL_BOUT (see metal.ts) — the two disciplines use
 *  different counts, but each is fixed, not a per-bout choice. */
export const PRECISION_SHOTS = 10

export const HIT_ZONE_MM: Record<Position, number> = {
  prone: 45,
  standing: 115,
}

export const RACE_TYPE_LABEL: Record<RaceType, string> = {
  sprint: 'Sprint',
  individual: 'Individual',
  'mass-start': 'Mass start',
  pursuit: 'Pursuit',
}

/** The shooting stages of each format, in order — a sprint is prone then
 *  standing; individual, mass start and pursuit are all four stages, mass
 *  start and pursuit sharing individual's order (prone, prone, standing,
 *  standing) rather than alternating. */
export const RACE_STAGES: Record<RaceType, Position[]> = {
  sprint: ['prone', 'standing'],
  individual: ['prone', 'standing', 'prone', 'standing'],
  'mass-start': ['prone', 'prone', 'standing', 'standing'],
  pursuit: ['prone', 'prone', 'standing', 'standing'],
}

/** How to score a bout that was saved before faces were per-bout. */
export function scoringContext(bout: Pick<Bout, 'targetFaceId' | 'bulletDiameterMm'>, settings: Settings): ScoringContext {
  return {
    faceId: bout.targetFaceId ?? settings.targetFaceId,
    bulletDiameterMm: bout.bulletDiameterMm ?? settings.bulletDiameterMm,
    mmPerClick: settings.mmPerClick,
  }
}

export const settingsContext = (settings: Settings): ScoringContext => ({
  faceId: settings.targetFaceId,
  bulletDiameterMm: settings.bulletDiameterMm,
  mmPerClick: settings.mmPerClick,
})

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'claude-opus-5',
  // Anschütz biathlon diopters vary; this is a starting guess, not gospel.
  // Use the calibration helper in Settings to replace it with your rifle's value.
  mmPerClick: 2.5,
  targetFaceId: 'issf-50m',
  // .22 Long Rifle. Air rifle pellets are 4.5 mm.
  bulletDiameterMm: 5.6,
  // Kept in step with the chosen face, and editable for an odd target.
  aimingMarkMm: 112.4,
  handedness: 'right',
  localHoleDetection: true,
}
