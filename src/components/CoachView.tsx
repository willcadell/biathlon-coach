import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Bout, MetalBout, Position, Workout } from '../lib/types'
import { DEFAULT_SETTINGS } from '../lib/types'
import { DISCS_PER_METAL_BOUT, hitsOf, metalStats, missCount } from '../lib/metal'
import {
  addCoachNote, assignAthleteToProgram, becomeCoach, clubCoachRequests, coachesForClub, createClub, createProgram, deleteProgram, findClubByCoachCode, getCoach,
  getCoachJoinCode, joinClubAsCoach, myCoachedClubs, programsForClub, removeAthleteFromProgram, removeCoachFromClub, renameClub, respondToCoachJoinRequest, setCoachAdmin, rosterBouts,
  rosterForClub, rosterMetalBouts, rosterWorkouts, uploadClubLogo,
  type Club, type ClubMatch, type CoCoach, type CoachJoinRequest, type Coach, type Program, type RosterAthlete,
} from '../lib/coaching'
import { forLogo } from '../lib/imaging'
import { AnalysisView, CollapsibleSection, MetalPositionStats, seasonLabel, seasonStartYear } from './AnalysisView'
import { Help } from './Help'
import { SharedGoals } from './GoalsProgress'
import { ClubLogo } from './ClubLogo'
import { Dropdown } from './Dropdown'
import { ProgramGoalsCard } from './ProgramGoalsCard'
import { logPlatformAccess, platformClubs, recentPlatformAccess, type AccessEntry } from '../lib/platformAdmin'
import { AnnounceSheet } from './AnnounceSheet'
import { FeedView } from './FeedView'
import { errorMessage } from '../lib/errors'
import { myPersonalAthletes, stopCoachingAthlete, type PersonalAthlete } from '../lib/personalCoach'
import { AdminPill, AdminShield, GoArrow, MegaphoneIcon, RaceMedalIcon, RangeIcon, PlusIcon, ShieldMinusIcon, ShieldPlusIcon, TrashIcon } from './icons'

interface Props {
  session: Session
  /** Refreshes the app's identity gate — called after setting up a coach
   *  identity here, so the Coach tab's own state matches immediately. */
  onIdentityChanged: () => void
}

/** Ring points scored as a percentage of what was possible, the same
 *  conversion HistoryView uses — puts precision and metal on one scale. */
function precisionRate(bouts: Bout[]): number | null {
  const shots = bouts.reduce((n, b) => n + b.shots.length, 0)
  if (!shots) return null
  const avg = bouts.reduce((n, b) => n + b.metrics.ringTotal, 0) / shots
  return Math.round((avg / 10) * 100)
}

const precisionPct = (bouts: Bout[]): string => {
  const rate = precisionRate(bouts)
  return rate === null ? '—' : `${rate}%`
}

/** Precision by position, prone and standing, only for those with bouts. */
function precisionByPosition(bouts: Bout[]): { position: Position; rate: number; bouts: number }[] {
  return (['prone', 'standing'] as Position[]).flatMap((position) => {
    const set = bouts.filter((b) => b.position === position)
    const rate = precisionRate(set)
    return rate === null ? [] : [{ position, rate, bouts: set.length }]
  })
}

function metalPct(bouts: MetalBout[]): string {
  const shots = bouts.length * DISCS_PER_METAL_BOUT
  if (!shots) return '—'
  const misses = bouts.reduce((n, b) => n + missCount(hitsOf(b)), 0)
  return `${Math.round(((shots - misses) / shots) * 100)}%`
}

/** Cumulative across every athlete a group's workouts were fetched for —
 *  the present calendar month only, in whoever's device is looking. Names
 *  that month too, so "so far" reads against something concrete. */
function dryfireMinutesThisMonth(workouts: Workout[]): { minutes: number; month: string } {
  const now = new Date()
  const minutes = workouts
    .filter((w) => {
      const d = new Date(w.startedAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((n, w) => n + w.dryfireMinutes, 0)
  return { minutes, month: now.toLocaleDateString(undefined, { month: 'long' }) }
}

/** The club's own name and branding — shown to everyone on the club,
 *  editable only by its admin coach. A logo is resized client-side before
 *  it ever reaches storage; a rename goes through rename_club so a
 *  duplicate name fails with a clear reason instead of a raw DB error. */
function ClubEditCard({ club, onChanged }: { club: Club; onChanged: (patch: Partial<Club>) => void }) {
  const [uploading, setUploading] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [name, setName] = useState(club.name)
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState('')

  async function onFile(file: File) {
    setUploading(true)
    setLogoError('')
    try {
      const logo = await forLogo(file)
      const path = await uploadClubLogo(club.id, logo)
      onChanged({ logoPath: path })
    } catch (e) {
      setLogoError(errorMessage(e, 'Could not upload this logo. Check your connection and try again.'))
    } finally {
      setUploading(false)
    }
  }

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === club.name) return
    setSavingName(true)
    setNameError('')
    try {
      await renameClub(club.id, trimmed)
      onChanged({ name: trimmed })
    } catch (e) {
      setNameError(errorMessage(e, 'Could not rename this club. Check your connection and try again.'))
    } finally {
      setSavingName(false)
    }
  }

  if (!club.isAdmin) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ClubLogo logoPath={club.logoPath} size={56} />
        <p className="meta" style={{ margin: 0 }}>Only the club's admin coach can edit its name or logo.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <ClubLogo logoPath={club.logoPath} size={56} />
        <label className="filelabel" style={{ display: 'inline-flex', width: 'auto', padding: '6px 12px', fontSize: 13 }}>
          {uploading ? 'Uploading…' : club.logoPath ? 'Change logo' : 'Add a logo'}
          <input
            type="file" accept="image/*" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }}
          />
        </label>
      </div>
      {logoError && <div className="notice error" style={{ marginBottom: 14 }}>{logoError}</div>}

      <label className="field" style={{ marginBottom: 0 }}>
        <span>Club name<small>You'll be its admin, and get a join code to give athletes.</small></span>
        <div className="row">
          <input type="text" style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
          <button
            className="secondary"
            style={{ flex: 'none', width: 'auto' }}
            disabled={savingName || !name.trim() || name.trim() === club.name}
            onClick={() => void saveName()}
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
      </label>
      {nameError && <div className="notice error" style={{ marginTop: 10 }}>{nameError}</div>}
    </div>
  )
}

/** A club's own sub-groups — a squad within it, not the whole roster. Any
 *  coach assigned to the club can add one, not just its admin. */
function ProgramsCard({ club }: { club: Club }) {
  const [programs, setPrograms] = useState<Program[] | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void programsForClub(club.id)
      .then((p) => { if (!cancelled) setPrograms(p) })
      .catch((e) => console.error('Could not load this club’s programs', e))
    return () => { cancelled = true }
  }, [club.id])

  async function remove(program: Program) {
    if (!confirm(
      `Delete the program "${program.name}"?\n\nAthletes in it stay in the club but move to "No program yet". ` +
      `Its join code stops working, and any coach assigned only to this program loses that assignment. This can't be undone.`,
    )) return
    setError('')
    try {
      await deleteProgram(program.id)
      setPrograms((prev) => (prev ?? []).filter((p) => p.id !== program.id))
    } catch (e) {
      setError(errorMessage(e, 'Could not delete this program. Check your connection and try again.'))
    }
  }

  async function add() {
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    setError('')
    try {
      const program = await createProgram(club.id, trimmed)
      setPrograms((prev) => [...(prev ?? []), program].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
    } catch (e) {
      setError(errorMessage(e, 'Could not create this program. Check your connection and try again.'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <h2>Programs</h2>
      <div className="card">
        {programs === null && <p className="meta" style={{ marginTop: 0 }}>Loading…</p>}
        {programs?.length === 0 && (
          <p className="meta" style={{ marginTop: 0 }}>
            No programs yet — a squad within this club, like "U18" or "Elite".
          </p>
        )}
        {programs && programs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {programs.map((p) => (
              <div key={p.id} className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
                <span style={{ flex: 1 }}>{p.name}</span>
                <span className="meta">
                  Join code <strong style={{ fontFamily: 'var(--mono, monospace)', letterSpacing: '0.05em' }}>{p.joinCode}</strong>
                </span>
                <button
                  className="link danger" style={{ flex: 'none' }}
                  aria-label={`Delete ${p.name}`} onClick={() => void remove(p)}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Program name</span>
          <div className="row">
            <input
              type="text" style={{ flex: 1 }} placeholder="e.g. U18 or Elite" value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="secondary" style={{ flex: 'none', width: 'auto' }}
              disabled={creating || !name.trim()} onClick={() => void add()}
            >
              {creating ? 'Adding…' : 'Add'}
            </button>
          </div>
        </label>
        {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </>
  )
}

function SetUpCoach({ onDone }: { onDone: (coach: Coach) => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      onDone(await becomeCoach(name.trim()))
    } catch (e) {
      setError(errorMessage(e, 'Could not set up your coach profile. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h1>Coach</h1>
      <p className="lede">
        Set up a coaching identity to create a club and see a roster's training — separate from your
        own athlete profile, since plenty of coaches log their own bouts too.
      </p>
      <div className="card">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Your name<small>Shown to athletes on the club they join.</small></span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      {error && <div className="notice error">{error}</div>}
      <button className="primary" onClick={() => void submit()} disabled={saving || name.trim().length === 0}>
        {saving ? 'Setting up…' : 'Set up as a coach'}
      </button>
    </>
  )
}

/** Also used from Profile, right alongside the clubs a coach already has —
 *  creating a club is a coach-identity action, not something tied to
 *  drilling into a specific one, the way the rest of the Coach tab is. */
export function CreateClub({ onCreated }: { onCreated: (club: Club) => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      onCreated(await createClub(name.trim()))
      setName('')
    } catch (e) {
      setError(errorMessage(e, 'Could not create that club. Check your connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Club name</span>
        <div className="row">
          <input type="text" style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
          <button
            className="secondary" style={{ flex: 'none', width: 'auto' }}
            onClick={() => void submit()} disabled={saving || name.trim().length === 0}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </label>
      {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  )
}

/** Also used from Profile, alongside CreateClub — see its own export
 *  comment for why. */
export function JoinClubAsCoach({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState('')
  const [match, setMatch] = useState<ClubMatch | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [joining, setJoining] = useState(false)
  const [requested, setRequested] = useState('')

  async function checkCode() {
    setError('')
    setRequested('')
    setMatch(null)
    if (!code.trim()) return
    setChecking(true)
    try {
      const found = await findClubByCoachCode(code)
      if (found) setMatch(found)
      else setError("That code doesn't match a club's coach invite.")
    } catch {
      setError('Could not check that code. Check your connection and try again.')
    } finally {
      setChecking(false)
    }
  }

  async function confirmJoin() {
    if (!match) return
    setJoining(true)
    setError('')
    try {
      await joinClubAsCoach(code)
      setRequested(match.name)
      setMatch(null)
      setCode('')
      onJoined()
    } catch (e) {
      setError(errorMessage(e, 'Could not send that request. Check your connection and try again.'))
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="card">
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Coach invite code<small>From a club's admin coach — different from the code athletes use.</small></span>
        <div className="row">
          <input
            type="text"
            style={{ flex: 1 }}
            placeholder="e.g. 7K4RXP"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => { setCode(e.target.value); setMatch(null); setError(''); setRequested('') }}
          />
          <button
            className="secondary" style={{ flex: 'none', width: 'auto' }}
            onClick={() => void checkCode()} disabled={checking || !code.trim()}
          >
            {checking ? 'Checking…' : 'Find'}
          </button>
        </div>
      </label>
      {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}
      {requested && (
        <div className="notice" style={{ marginTop: 10 }}>
          Request sent to <strong>{requested}</strong>. One of its admins has to approve it before you can see
          anything.
        </div>
      )}
      {match && (
        <>
          <p className="meta">Ask to join <strong>{match.name}</strong> as a coach? A club admin will need to approve you.</p>
          <div className="row">
            <button className="secondary" onClick={() => { setMatch(null); setCode('') }} disabled={joining}>
              Cancel
            </button>
            <button className="primary" onClick={() => void confirmJoin()} disabled={joining}>
              {joining ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * One roster athlete's own data, reusing the exact views the athlete sees of
 * themselves — History and Analysis — fed by what the roster query already
 * fetched rather than the coach's own bouts. Read-only throughout except for
 * coach notes, the one write a coach can make on data that isn't theirs.
 *
 * Diagnostics run against DEFAULT_SETTINGS rather than the coach's own — the
 * coach's rifle's click value has nothing to do with this athlete's sight,
 * and there is nowhere to read the athlete's own settings from (they live on
 * their device, never synced).
 */
function AthleteDetail({ athlete, platform = false }: { athlete: RosterAthlete; platform?: boolean }) {
  const [bouts, setBouts] = useState<Bout[]>([])
  const [metalBouts, setMetalBouts] = useState<MetalBout[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => {
    void Promise.all([
      rosterBouts([athlete.athleteId]),
      rosterMetalBouts([athlete.athleteId]),
      rosterWorkouts([athlete.athleteId]),
    ]).then(([b, m, w]) => {
      setBouts(b)
      setMetalBouts(m)
      setWorkouts(w)
      setLoaded(true)
    }).catch((e) => setError(errorMessage(e, 'Could not load this athlete’s training. Check your connection and try again.')))
  }

  useEffect(() => {
    setLoaded(false)
    setError('')
    refresh()
  }, [athlete.athleteId])

  if (error) return <div className="notice error">{error}</div>
  if (!loaded) return <p className="meta">Loading…</p>

  return (
    <>
      <SharedGoals athleteId={athlete.athleteId} data={{ workouts, bouts, metalBouts }} />
      <AnalysisView
        bouts={bouts} metalBouts={metalBouts} settings={DEFAULT_SETTINGS} workouts={workouts}
        onChanged={refresh}
        readOnly
        onAddCoachNote={platform ? undefined : async (workoutId, note) => {
          await addCoachNote(workoutId, note)
          refresh()
        }}
      />
    </>
  )
}

/** Athletes not yet assigned to a program group under this key, so a club
 *  that hasn't adopted programs still gets one (unlabelled) group. */
const NO_PROGRAM_KEY = 'none'

interface RosterGroupData {
  key: string
  label: string
  athletes: RosterAthlete[]
  bouts: Bout[]
  metalBouts: MetalBout[]
  workouts: Workout[]
}

function RosterGroup({
  group, onOpenAthlete, onRemove, programs, onAssign,
}: {
  group: RosterGroupData
  onOpenAthlete: (id: string) => void
  /** Only for the "No program yet" group, and only once the club has
   *  programs to choose from — a plus on each athlete opens a picker. */
  programs?: Program[]
  onAssign?: (athlete: RosterAthlete, programId: string) => void
  /** Only for a real program's group — the "No program yet" group has no
   *  program to take someone out of. */
  onRemove?: (athlete: RosterAthlete, programName: string) => void
}) {
  // Metal here is range-session shooting, as in an athlete's own Metal section;
  // race bouts are shown separately, under Season race performance.
  const raceWorkoutIds = new Set(group.workouts.filter((w) => w.raceType).map((w) => w.id))
  const rangeMetal = group.metalBouts.filter((b) => !raceWorkoutIds.has(b.workoutId))
  const metal = metalStats(rangeMetal)
  const precisionPos = precisionByPosition(group.bouts)
  // Metal shot in races this season, by the same season definition as an
  // athlete's own Race performance, so the two read against each other.
  const thisSeason = seasonStartYear(new Date())
  const seasonRaceWorkouts = new Set(
    group.workouts.filter((w) => w.raceType && seasonStartYear(new Date(w.startedAt)) === thisSeason).map((w) => w.id),
  )
  const seasonRaceBouts = group.metalBouts.filter((b) => seasonRaceWorkouts.has(b.workoutId))
  const dryfire = dryfireMinutesThisMonth(group.workouts)
  const [pickingId, setPickingId] = useState<string | null>(null)

  return (
    <>
      {group.athletes.length === 0 ? (
        <p className="meta">No athletes here yet.</p>
      ) : (
        <>
          <div className="stats three">
            <div className="stat range">
              <div className="k">Precision</div>
              <div className="v">{precisionPct(group.bouts)}</div>
              <div className="n">{group.bouts.length} bout{group.bouts.length === 1 ? '' : 's'}</div>
            </div>
            <div className="stat range">
              <div className="k">Metal</div>
              <div className="v">{metalPct(rangeMetal)}</div>
              <div className="n">{rangeMetal.length} bout{rangeMetal.length === 1 ? '' : 's'}</div>
            </div>
            <div className="stat dryfire">
              <div className="k">Dry-fire</div>
              <div className="v">{dryfire.minutes}<small>min</small></div>
              <div className="n">{dryfire.month}, so far</div>
            </div>
          </div>

          {/* Metal's prone and standing, then precision's, as four boxes in one row:
              each measure's heading sits over its own pair. */}
          {(metal.length > 0 || precisionPos.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              {[
                { label: 'Metal', tiles: metal.map((m) => ({ position: m.position, rate: Math.round(m.hitRatePct), bouts: m.bouts })) },
                { label: 'Precision', tiles: precisionPos },
              ].filter((pair) => pair.tiles.length > 0).map((pair) => (
                <div key={pair.label} style={{ minWidth: 0 }}>
                  <p className="meta" style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--series-1)', display: 'inline-flex' }}><RangeIcon size={14} /></span>
                    {pair.label}
                  </p>
                  <div className="stats">
                    {pair.tiles.map((t) => (
                      <div className="stat range" key={t.position} style={{ padding: '8px 8px' }}>
                        <div className="k">{t.position}</div>
                        <div className="v">{t.rate}<small>%</small></div>
                        <div className="n">{t.bouts} bout{t.bouts === 1 ? '' : 's'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {seasonRaceBouts.length > 0 && (
            <>
              <p className="meta" style={{ margin: '16px 0 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: 'var(--series-2)', display: 'inline-flex' }}><RaceMedalIcon size={14} /></span>
                Season race performance ({seasonLabel(thisSeason)})
              </p>
              <MetalPositionStats
                bouts={seasonRaceBouts}
                races={new Set(seasonRaceBouts.map((b) => b.workoutId)).size}
                raceWord="athlete race"
              />
            </>
          )}

          <p className="meta" style={{ marginTop: 16, marginBottom: 4 }}>Athletes</p>
          {group.athletes.map((a) => (
            <div key={a.athleteId} className="boutrow" style={{ cursor: 'default' }}>
              <button
                onClick={() => onOpenAthlete(a.athleteId)}
                style={{
                  display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0,
                  background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit',
                  textAlign: 'left', cursor: 'pointer',
                }}
              >
                <div className="grow">
                  <div className="title">
                    {a.displayName || 'Unnamed athlete'}
                    <GoArrow />
                  </div>
                </div>
              </button>
              {onAssign && programs && programs.length > 0 && (
                pickingId === a.athleteId ? (
                  <select
                    autoFocus
                    aria-label={`Add ${a.displayName || 'this athlete'} to a program`}
                    defaultValue=""
                    style={{ flex: 'none', width: 'auto', maxWidth: '50%', padding: '6px 8px' }}
                    onBlur={() => setPickingId(null)}
                    onChange={(e) => {
                      if (!e.target.value) return
                      onAssign(a, e.target.value)
                      setPickingId(null)
                    }}
                  >
                    <option value="" disabled>Add to…</option>
                    {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                ) : (
                  <button
                    className="link" style={{ flex: 'none' }}
                    aria-label={`Add ${a.displayName || 'this athlete'} to a program`}
                    onClick={() => setPickingId(a.athleteId)}
                  >
                    <PlusIcon />
                  </button>
                )
              )}
              {onRemove && (
                <button
                  className="link danger" style={{ flex: 'none' }}
                  aria-label={`Remove ${a.displayName || 'this athlete'} from ${group.label}`}
                  onClick={() => onRemove(a, group.label)}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </>
  )
}

function ClubRosterSection({
  club, openAthleteId, setOpenAthleteId, platform = false,
}: {
  club: Club
  /** A platform admin looking in: no program changes, no notes, and opening an
   *  athlete is logged. */
  platform?: boolean
  /** Owned by CoachView, so the club header can step aside while one athlete is open. */
  openAthleteId: string | null
  setOpenAthleteId: (id: string | null) => void
}) {
  const [athletes, setAthletes] = useState<RosterAthlete[] | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [groupData, setGroupData] = useState<Map<string, { bouts: Bout[]; metalBouts: MetalBout[]; workouts: Workout[] }>>(new Map())
  const [reloadKey, setReloadKey] = useState(0)
  const [actionError, setActionError] = useState('')

  async function removeFromProgram(athlete: RosterAthlete, programName: string) {
    if (!athlete.programId) return
    const who = athlete.displayName || 'This athlete'
    if (!confirm(
      `Remove ${who} from "${programName}"?\n\nThey stay in the club but won't be in this program any more, ` +
      `and coaches assigned only to this program will stop seeing their training. ` +
      `They can rejoin with the program's join code.`,
    )) return
    setActionError('')
    try {
      await removeAthleteFromProgram(athlete.athleteId, athlete.programId)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setActionError(errorMessage(e, 'Could not remove this athlete from the program. Check your connection and try again.'))
    }
  }

  async function assignToProgram(athlete: RosterAthlete, programId: string) {
    setActionError('')
    try {
      await assignAthleteToProgram(athlete.athleteId, programId)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setActionError(errorMessage(e, 'Could not add this athlete to the program. Check your connection and try again.'))
    }
  }

  useEffect(() => {
    let cancelled = false
    setAthletes(null)
    Promise.all([rosterForClub(club.id), programsForClub(club.id)])
      .then(async ([roster, progs]) => {
        if (cancelled) return
        setAthletes(roster)
        setPrograms(progs)

        const idsByKey = new Map<string, string[]>()
        for (const a of roster) {
          const key = a.programId ?? NO_PROGRAM_KEY
          idsByKey.set(key, [...(idsByKey.get(key) ?? []), a.athleteId])
        }

        const entries = await Promise.all(
          [...idsByKey.entries()].map(async ([key, ids]) => {
            const [b, m, w] = await Promise.all([rosterBouts(ids), rosterMetalBouts(ids), rosterWorkouts(ids)])
            return [key, { bouts: b, metalBouts: m, workouts: w }] as const
          }),
        )
        if (cancelled) return
        setGroupData(new Map(entries))
      })
      .catch((e) => console.error('Could not load this club’s roster', e))
    return () => { cancelled = true }
  }, [club.id, reloadKey])

  const openAthlete = athletes?.find((a) => a.athleteId === openAthleteId)
  const openedId = openAthlete?.athleteId
  useEffect(() => {
    if (platform && openedId) void logPlatformAccess('open_athlete', club.id, openedId).catch(() => undefined)
  }, [platform, openedId, club.id])
  // An athlete who has left the club (or been removed) can't stay open.
  useEffect(() => {
    if (openAthleteId && athletes && !openAthlete) setOpenAthleteId(null)
  }, [openAthleteId, athletes, openAthlete, setOpenAthleteId])
  if (openAthlete) {
    return (
      <>
        <button className="link" onClick={() => setOpenAthleteId(null)}>← Roster</button>
        <hr className="detail-rule" />
        <h1 style={{ marginTop: 14 }}>{openAthlete.displayName || 'Unnamed athlete'}</h1>
        <p className="lede">{club.name}</p>
        <AthleteDetail athlete={openAthlete} platform={platform} />
      </>
    )
  }

  if (athletes === null) {
    return <p className="meta">Loading…</p>
  }
  if (athletes.length === 0) {
    return <p className="meta">Nobody's joined with this club's code yet.</p>
  }

  const byProgram = new Map<string, RosterAthlete[]>()
  for (const a of athletes) {
    const key = a.programId ?? NO_PROGRAM_KEY
    byProgram.set(key, [...(byProgram.get(key) ?? []), a])
  }
  const emptyData = { bouts: [] as Bout[], metalBouts: [] as MetalBout[], workouts: [] as Workout[] }

  // No programs at this club at all yet — one flat, unlabelled group, same
  // as the roster looked before programs existed.
  if (programs.length === 0) {
    return (
      <RosterGroup
        group={{ key: NO_PROGRAM_KEY, label: '', athletes, ...(groupData.get(NO_PROGRAM_KEY) ?? emptyData) }}
        onOpenAthlete={setOpenAthleteId}
      />
    )
  }

  const groups: RosterGroupData[] = [
    ...programs.map((p) => ({
      key: p.id,
      label: p.name,
      athletes: byProgram.get(p.id) ?? [],
      ...(groupData.get(p.id) ?? emptyData),
    })),
    ...(byProgram.has(NO_PROGRAM_KEY)
      ? [{
          key: NO_PROGRAM_KEY,
          label: 'No program yet',
          athletes: byProgram.get(NO_PROGRAM_KEY) ?? [],
          ...(groupData.get(NO_PROGRAM_KEY) ?? emptyData),
        }]
      : []),
  ]

  return (
    <>
      {actionError && <div className="notice error">{actionError}</div>}
      {groups.map((g) => (
        <CollapsibleSection
          key={g.key} title={`${g.label} (${g.athletes.length})`} defaultOpen={false}
        >
          <RosterGroup
            group={g} onOpenAthlete={setOpenAthleteId}
            onRemove={platform || g.key === NO_PROGRAM_KEY ? undefined : (a, name) => void removeFromProgram(a, name)}
            programs={!platform && g.key === NO_PROGRAM_KEY ? programs : undefined}
            onAssign={!platform && g.key === NO_PROGRAM_KEY ? (a, programId) => void assignToProgram(a, programId) : undefined}
          />
          {g.key !== NO_PROGRAM_KEY && <ProgramGoalsCard programId={g.key} programName={g.label} readOnly={platform} />}
        </CollapsibleSection>
      ))}
    </>
  )
}

/** Shared by the Coach and Club tabs — both start from the same coach
 *  identity and club list, they just show different things once a club is
 *  open. Each tab calls this independently rather than sharing state across
 *  tabs, so switching tabs re-fetches rather than carrying a stale list —
 *  consistent with every other tab in this app being remounted on switch. */
function useCoachAndClubs(session: Session) {
  const [coach, setCoach] = useState<Coach | null | undefined>(undefined)
  const [clubs, setClubs] = useState<Club[]>([])
  const [loadError, setLoadError] = useState('')

  const refreshClubs = () =>
    void myCoachedClubs()
      .then(setClubs)
      .catch((e) => setLoadError(errorMessage(e, 'Could not load your clubs. Check your connection and try again.')))

  useEffect(() => {
    setLoadError('')
    void getCoach(session.user.id)
      .then((c) => {
        setCoach(c)
        if (c) refreshClubs()
      })
      .catch((e) => setLoadError(errorMessage(e, 'Could not load your coach profile. Check your connection and try again.')))
  }, [session.user.id])

  return { coach, setCoach, clubs, setClubs, loadError, refreshClubs }
}

/** Athletes this coach follows personally — a parent's child, or someone
 *  outside any club they coach — listed under their clubs. Following someone
 *  starts in Profile (the athlete's invite code goes there); this just shows
 *  who you follow, and only once you follow someone. */
function PersonalAthletesSection({
  athletes, onOpen, onChanged,
}: {
  athletes: PersonalAthlete[]
  onOpen: (athleteId: string) => void
  onChanged: () => void
}) {
  const [error, setError] = useState('')
  if (athletes.length === 0) return null

  async function stop(a: PersonalAthlete) {
    const who = a.displayName || 'this athlete'
    if (!confirm(
      `Stop coaching ${who}?\n\nYou'll no longer see their sessions, analysis or posts. ` +
      `They can invite you again with a new code.`,
    )) return
    setError('')
    try {
      await stopCoachingAthlete(a.athleteId)
      onChanged()
    } catch (e) {
      setError(errorMessage(e, 'Could not stop coaching this athlete. Check your connection and try again.'))
    }
  }

  return (
    <>
      <h1 style={{ margin: '28px 0 8px' }}>Coach your individual athletes</h1>
      {error && <div className="notice error">{error}</div>}
      {athletes.map((a) => (
        <div key={a.athleteId} className="boutrow" style={{ cursor: 'default' }}>
          <button
            onClick={() => onOpen(a.athleteId)}
            style={{
              display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0,
              background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit',
              textAlign: 'left', cursor: 'pointer',
            }}
          >
            <div className="grow">
              <div className="title">{a.displayName || 'Unnamed athlete'}<GoArrow /></div>
            </div>
          </button>
          <button
            className="link danger" style={{ flex: 'none' }}
            aria-label={`Stop coaching ${a.displayName || 'this athlete'}`} title="Stop coaching"
            onClick={() => void stop(a)}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
    </>
  )
}

export function CoachView({ session, onIdentityChanged }: Props) {
  const { coach, setCoach, clubs, loadError, refreshClubs } = useCoachAndClubs(session)
  const [openClubId, setOpenClubId] = useState<string | null>(null)
  const [rosterAthleteId, setRosterAthleteId] = useState<string | null>(null)
  useEffect(() => setRosterAthleteId(null), [openClubId])
  const [personal, setPersonal] = useState<PersonalAthlete[] | null>(null)
  const [openPersonalId, setOpenPersonalId] = useState<string | null>(null)

  const refreshPersonal = () =>
    void myPersonalAthletes().then(setPersonal).catch((e) => console.error('Could not load personal athletes', e))
  useEffect(() => { if (coach) refreshPersonal() }, [coach])

  if (loadError) {
    return (
      <>
        <h1>Coach</h1>
        <div className="notice error">{loadError}</div>
      </>
    )
  }
  if (coach === undefined) return null
  if (coach === null) {
    return (
      <SetUpCoach
        onDone={(c) => {
          setCoach(c)
          refreshClubs()
          onIdentityChanged()
        }}
      />
    )
  }

  const openPersonal = (personal ?? []).find((a) => a.athleteId === openPersonalId)
  if (openPersonal) {
    return (
      <>
        <button className="link" onClick={() => setOpenPersonalId(null)}>← All athletes</button>
        <hr className="detail-rule" />
        <h1 style={{ marginTop: 14 }}>{openPersonal.displayName || 'Unnamed athlete'}</h1>
        <AthleteDetail athlete={{ athleteId: openPersonal.athleteId, displayName: openPersonal.displayName, programId: null }} />
      </>
    )
  }

  const openClub = clubs.find((c) => c.id === openClubId)
  if (openClub) {
    return (
      <>
        {!rosterAthleteId && (
          <>
            <button className="link" onClick={() => setOpenClubId(null)}>← All clubs</button>
            <hr className="detail-rule" />
            <ClubTitle club={openClub} suffix="Roster" />
          </>
        )}
        <ClubRosterSection club={openClub} openAthleteId={rosterAthleteId} setOpenAthleteId={setRosterAthleteId} />
      </>
    )
  }

  return (
    <>
      <h1 style={{ marginBottom: 8 }}>Coach your clubs</h1>
      {clubs.length === 0 && (personal ?? []).length === 0 && (
        <p className="meta">Nothing yet — create or join a club, or follow an athlete, from your Profile.</p>
      )}
      {clubs.map((c) => (
        <button key={c.id} className="boutrow" onClick={() => setOpenClubId(c.id)}>
          <ClubLogo logoPath={c.logoPath} size={40} />
          <div className="grow">
            <div className="title">{c.name}<GoArrow /></div>
            <div className="meta">
              Join code <strong style={{ fontFamily: 'var(--mono, monospace)', letterSpacing: '0.05em' }}>{c.joinCode}</strong>
            </div>
          </div>
        </button>
      ))}

      <PersonalAthletesSection
        athletes={personal ?? []}
        onOpen={setOpenPersonalId}
        onChanged={refreshPersonal}
      />

      {(clubs.length > 0 || (personal ?? []).length > 0) && <FeedView role="coach" clubs={clubs} />}
    </>
  )
}

/** A club page's title: the club's logo, its name, and a megaphone for
 *  posting an announcement to the club's feed. */
function ClubTitle({ club, suffix }: { club: Club; suffix?: string }) {
  const [announcing, setAnnouncing] = useState(false)
  // Bumped after a post so the title's megaphone shakes: keyed, so it plays
  // again for a second announcement.
  const [shakes, setShakes] = useState(0)
  return (
    <>
      <h1 style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <ClubLogo logoPath={club.logoPath} size={34} />
        <span style={{ minWidth: 0 }}>{club.name}{suffix && ` ${suffix}`}</span>
        <button
          className="link" style={{ flex: 'none', display: 'inline-flex' }}
          aria-label={`Post an announcement to ${club.name}`} title="Announce to the club"
          onClick={() => setAnnouncing(true)}
        >
          <span key={shakes} className={shakes > 0 ? 'megaphone-shake' : undefined} style={{ display: 'inline-flex' }}>
            <MegaphoneIcon size={22} />
          </span>
        </button>
      </h1>
      {announcing && <AnnounceSheet club={club} onClose={() => setAnnouncing(false)} onPosted={() => setShakes((n) => n + 1)} />}
    </>
  )
}

/** The admin-editable side of a club: its name and logo, and both invite
 *  codes — separate from ClubRosterSection so the Coach tab (clubs and
 *  roster) and the Club tab (identity and sharing) can each show only what
 *  they're about. */
function ClubAdminSection({ club, myCoachId, onChanged }: { club: Club; myCoachId: string; onChanged: (patch: Partial<Club>) => void }) {
  const [coaches, setCoaches] = useState<CoCoach[]>([])
  const [coachCode, setCoachCode] = useState<string | null>(null)
  const [coachError, setCoachError] = useState('')
  const [requests, setRequests] = useState<CoachJoinRequest[]>([])
  const [responding, setResponding] = useState<string | null>(null)

  async function respond(r: CoachJoinRequest, approve: boolean) {
    setResponding(r.coachId)
    setCoachError('')
    try {
      await respondToCoachJoinRequest(club.id, r.coachId, approve)
      setRequests((prev) => prev.filter((x) => x.coachId !== r.coachId))
      if (approve) setCoaches(await coachesForClub(club.id))
    } catch (e) {
      setCoachError(errorMessage(e, 'Could not do that. Check your connection and try again.'))
    } finally {
      setResponding(null)
    }
  }

  async function changeAdmin(coach: CoCoach) {
    const name = coach.displayName || 'this coach'
    const message = coach.isAdmin
      ? `Remove admin rights from ${name}?\n\nThey stay on the club as a coach.`
      : `Make ${name} an admin of ${club.name}?\n\nAdmins can rename the club, invite and remove coaches, and make other coaches admins.`
    if (!confirm(message)) return
    setCoachError('')
    try {
      await setCoachAdmin(club.id, coach.coachId, !coach.isAdmin)
      setCoaches((prev) => prev.map((c) => (c.coachId === coach.coachId ? { ...c, isAdmin: !coach.isAdmin } : c)))
    } catch (e) {
      setCoachError(errorMessage(e, 'Could not change admin rights. Check your connection and try again.'))
    }
  }

  async function removeCoach(coach: CoCoach) {
    if (!confirm(
      `Remove ${coach.displayName || 'this coach'} from ${club.name}?\n\nThey'll lose access to the club's roster ` +
      `and athletes' training. To come back they'd need to ask again and be approved.`,
    )) return
    setCoachError('')
    try {
      await removeCoachFromClub(club.id, coach.coachId)
      setCoaches((prev) => prev.filter((c) => c.coachId !== coach.coachId))
    } catch (e) {
      setCoachError(errorMessage(e, 'Could not remove this coach. Check your connection and try again.'))
    }
  }

  useEffect(() => {
    let cancelled = false
    void coachesForClub(club.id)
      .then((c) => { if (!cancelled) setCoaches(c) })
      .catch((e) => console.error('Could not load co-coaches', e))
    if (club.isAdmin) {
      void clubCoachRequests(club.id)
        .then((r) => { if (!cancelled) setRequests(r) })
        .catch((e) => console.error('Could not load coach requests', e))
      void getCoachJoinCode(club.id)
        .then((code) => { if (!cancelled) setCoachCode(code) })
        .catch((e) => console.error('Could not load the coach invite code', e))
    }
    return () => { cancelled = true }
  }, [club.id, club.isAdmin])

  return (
    <>
      <ClubEditCard club={club} onChanged={onChanged} />

      <div className="card">
        <p style={{ margin: 0 }}>
          Join code <strong style={{ fontFamily: 'var(--mono, monospace)', letterSpacing: '0.05em' }}>{club.joinCode}</strong>
          <Help>Give this to an athlete — they enter it in their own Profile to join.</Help>
        </p>
      </div>

      {club.isAdmin && requests.length > 0 && (
        <>
          <h2>Coaches asking to join</h2>
          <div className="card" style={{ borderColor: 'var(--series-1)', borderWidth: 2 }}>
            {requests.map((r, i) => (
              <div key={r.coachId} style={i > 0 ? { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' } : undefined}>
                <p style={{ margin: '0 0 4px' }}>
                  <strong>{r.coachName || 'A coach'}</strong> used your coach invite code.
                </p>
                <p className="meta" style={{ margin: '0 0 10px' }}>
                  Approving lets them see every athlete in {club.name} and their training, and write notes and
                  announcements. Check you know them, and that they meet the club's safe sport requirements.
                </p>
                <div className="row">
                  <button className="secondary" disabled={responding !== null} onClick={() => void respond(r, false)}>Decline</button>
                  <button className="primary" disabled={responding !== null} onClick={() => void respond(r, true)}>Approve</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Coaches</h2>
      <div className="card">
        {coaches.map((c) => (
          <div key={c.coachId} className="row" style={{ alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 0 }}>{c.displayName || 'Unnamed coach'}</span>
            {c.isAdmin && <AdminPill style={{ flex: 'none' }} />}
            {club.isAdmin && c.coachId !== myCoachId && (
              <span style={{ flex: 'none', display: 'flex', gap: 12 }}>
                <button
                  className="link"
                  aria-label={c.isAdmin ? `Remove admin rights from ${c.displayName || 'this coach'}` : `Make ${c.displayName || 'this coach'} an admin`}
                  title={c.isAdmin ? 'Remove admin' : 'Make admin'}
                  onClick={() => void changeAdmin(c)}
                >
                  {c.isAdmin ? <ShieldMinusIcon /> : <ShieldPlusIcon />}
                </button>
                <button
                  className="link danger"
                  aria-label={`Remove ${c.displayName || 'this coach'} from the club`}
                  title="Remove from club"
                  onClick={() => void removeCoach(c)}
                >
                  <TrashIcon />
                </button>
              </span>
            )}
          </div>
        ))}
        {coachError && <div className="notice error" style={{ marginBottom: 10 }}>{coachError}</div>}
        {club.isAdmin && (
          <>
            <p className="meta" style={{ marginTop: coaches.length > 0 ? 14 : 0, marginBottom: 4 }}>
              Only admins can see this. A coach who uses it sends a request, which you approve before they can see anything.
            </p>
            <p style={{ margin: 0 }}>
              Coach invite code{' '}
              <strong style={{ fontFamily: 'var(--mono, monospace)', letterSpacing: '0.05em' }}>
                {coachCode ?? '…'}
              </strong>
            </p>
          </>
        )}
      </div>

      <ProgramsCard club={club} />
    </>
  )
}

/** The Club tab: a club's own identity and sharing, as opposed to the Coach
 *  tab's clubs-and-roster view. Fetches its own coach/club list rather than
 *  sharing state with CoachView, same reasoning as useCoachAndClubs above. */
export function ClubSettingsView({ session }: { session: Session }) {
  const { coach, clubs, setClubs, loadError } = useCoachAndClubs(session)
  const [openClubId, setOpenClubId] = useState<string | null>(null)

  if (loadError) {
    return (
      <>
        <h1>Club</h1>
        <div className="notice error">{loadError}</div>
      </>
    )
  }
  if (coach === undefined) return null
  if (coach === null) {
    return (
      <>
        <h1>Club</h1>
        <p className="lede">Set up a coaching identity in the Coach tab first.</p>
      </>
    )
  }

  const openClub = clubs.find((c) => c.id === openClubId)
  if (openClub) {
    return (
      <>
        <button className="link" onClick={() => setOpenClubId(null)}>← All clubs</button>
        <hr className="detail-rule" />
        <ClubTitle club={openClub} />
        <ClubAdminSection
          club={openClub}
          myCoachId={coach.id}
          onChanged={(patch) =>
            setClubs((prev) => prev.map((c) => (c.id === openClub.id ? { ...c, ...patch } : c)))
          }
        />
      </>
    )
  }

  return (
    <>
      <h1>Club</h1>
      {clubs.length === 0 ? (
        <p className="lede">No clubs yet — create or join one from the Coach tab first.</p>
      ) : (
        <>
          <p className="lede">Pick a club to edit its name, logo, and invite codes.</p>
          {clubs.map((c) => (
            <button key={c.id} className="boutrow" onClick={() => setOpenClubId(c.id)}>
              <ClubLogo logoPath={c.logoPath} size={40} />
              <div className="grow">
                <div className="title">{c.name}<GoArrow /></div>
              </div>
            </button>
          ))}
        </>
      )}
    </>
  )
}

/**
 * The platform admin's read-only look at any club: its coaches, roster and
 * athletes' training, with nothing to change. It is not a coaching view: the
 * admin isn't a coach here, appears on no coach list, and every club or athlete
 * opened is logged, where the athlete can see it.
 */
export function PlatformAdminView({ onBack }: { onBack: () => void }) {
  const [clubs, setClubs] = useState<Club[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [athleteId, setAthleteId] = useState<string | null>(null)
  const [coaches, setCoaches] = useState<CoCoach[]>([])
  const [log, setLog] = useState<AccessEntry[]>([])
  const [error, setError] = useState('')

  const loadLog = () => void recentPlatformAccess().then(setLog).catch(() => undefined)
  useEffect(() => {
    void platformClubs().then(setClubs).catch((e) => setError(errorMessage(e, 'Could not load the clubs. Check your connection and try again.')))
    loadLog()
  }, [])

  const club = clubs?.find((c) => c.id === openId)
  useEffect(() => {
    setAthleteId(null)
    if (!club) { setCoaches([]); return }
    void logPlatformAccess('open_club', club.id, null).then(loadLog).catch(() => undefined)
    void coachesForClub(club.id).then(setCoaches).catch(() => setCoaches([]))
  }, [club?.id])

  if (club) {
    return (
      <>
        {!athleteId && (
          <>
            <button className="link" onClick={() => setOpenId(null)}>← All clubs</button>
            <hr className="detail-rule" />
            <h1 style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <ClubLogo logoPath={club.logoPath} size={34} />
              <span style={{ minWidth: 0 }}>{club.name}</span>
            </h1>
            {coaches.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '0 0 12px' }}>
                <span className="meta">Coaches </span>
                {coaches.map((c) => (
                  <span key={c.coachId} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {c.isAdmin && <span role="img" aria-label="Club admin" style={{ color: 'var(--series-1)', display: 'inline-flex' }}><AdminShield size={12} /></span>}
                    {c.displayName || 'Unnamed coach'}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        <ClubRosterSection club={club} openAthleteId={athleteId} setOpenAthleteId={setAthleteId} platform />
      </>
    )
  }

  return (
    <>
      <button className="link" onClick={onBack}>← Profile</button>
      <hr className="detail-rule" />
      <h1 style={{ marginTop: 14 }}>Platform admin</h1>
      <div className="notice">
        <strong>Read-only.</strong> You're looking in as the platform's operator, not as a coach: you're on no
        club's coach list and you can't change anything. Each club or athlete you open is logged, and the
        athlete can see that it happened.
      </div>
      {error && <div className="notice error">{error}</div>}
      {clubs === null && !error && <p className="meta">Loading…</p>}
      {clubs?.map((c) => (
        <button key={c.id} className="boutrow" onClick={() => setOpenId(c.id)}>
          <ClubLogo logoPath={c.logoPath} size={40} />
          <div className="grow">
            <div className="title">{c.name}<GoArrow /></div>
          </div>
        </button>
      ))}
      <Dropdown title="Access log">
        <div className="card">
          {log.length === 0 ? (
            <p className="meta" style={{ margin: 0 }}>Nothing opened yet.</p>
          ) : (
            log.map((e) => (
              <p key={e.id} className="meta" style={{ margin: '0 0 6px' }}>
                {new Date(e.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {' · '}
                {e.action === 'open_athlete' ? `Opened ${e.athleteName || 'an athlete'}` : 'Opened the club'}
                {e.clubName ? ` · ${e.clubName}` : ''}
              </p>
            ))
          )}
        </div>
      </Dropdown>
    </>
  )
}
