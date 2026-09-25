import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Bout, MetalBout, Workout } from '../lib/types'
import { DEFAULT_SETTINGS } from '../lib/types'
import { DISCS_PER_METAL_BOUT, hitsOf, metalStats, missCount, targetStats } from '../lib/metal'
import {
  addCoachNote, assignAthleteToProgram, becomeCoach, coachesForClub, createClub, createProgram, deleteProgram, findClubByCoachCode, getCoach,
  getCoachJoinCode, joinClubAsCoach, myCoachedClubs, programsForClub, removeAthleteFromProgram, removeCoachFromClub, renameClub, setCoachAdmin, rosterBouts,
  rosterForClub, rosterMetalBouts, rosterWorkouts, uploadClubLogo,
  type Club, type ClubMatch, type CoCoach, type Coach, type Program, type RosterAthlete,
} from '../lib/coaching'
import { forLogo } from '../lib/imaging'
import { AnalysisView } from './AnalysisView'
import { ClubLogo } from './ClubLogo'
import { FeedView } from './FeedView'
import { errorMessage } from '../lib/errors'
import { AdminPill, PlusIcon, ShieldMinusIcon, ShieldPlusIcon, TrashIcon } from './icons'

interface Props {
  session: Session
  /** Refreshes the app's identity gate — called after setting up a coach
   *  identity here, so the Coach tab's own state matches immediately. */
  onIdentityChanged: () => void
}

/** Ring points scored as a percentage of what was possible, the same
 *  conversion HistoryView uses — puts precision and metal on one scale. */
function precisionPct(bouts: Bout[]): string {
  const shots = bouts.reduce((n, b) => n + b.shots.length, 0)
  if (!shots) return '—'
  const avg = bouts.reduce((n, b) => n + b.metrics.ringTotal, 0) / shots
  return `${Math.round((avg / 10) * 100)}%`
}

function metalPct(bouts: MetalBout[]): string {
  const shots = bouts.length * DISCS_PER_METAL_BOUT
  if (!shots) return '—'
  const misses = bouts.reduce((n, b) => n + missCount(hitsOf(b)), 0)
  return `${Math.round(((shots - misses) / shots) * 100)}%`
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
        <span>Club name</span>
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

  async function checkCode() {
    setError('')
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
    try {
      await joinClubAsCoach(code)
      setMatch(null)
      setCode('')
      onJoined()
    } catch {
      setError('Could not join that club. Check your connection and try again.')
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
            onChange={(e) => { setCode(e.target.value); setMatch(null); setError('') }}
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
      {match && (
        <>
          <p className="meta">Join <strong>{match.name}</strong> as a coach?</p>
          <div className="row">
            <button className="secondary" onClick={() => { setMatch(null); setCode('') }} disabled={joining}>
              Cancel
            </button>
            <button className="primary" onClick={() => void confirmJoin()} disabled={joining}>
              {joining ? 'Joining…' : 'Join'}
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
function AthleteDetail({ athlete }: { athlete: RosterAthlete }) {
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
    <AnalysisView
      bouts={bouts} metalBouts={metalBouts} settings={DEFAULT_SETTINGS} workouts={workouts}
      onChanged={refresh}
      readOnly
      onAddCoachNote={async (workoutId, note) => {
        await addCoachNote(workoutId, note)
        refresh()
      }}
    />
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
  const targets = targetStats(group.metalBouts)
  const metal = metalStats(group.metalBouts)
  const [pickingId, setPickingId] = useState<string | null>(null)

  return (
    <>
      {group.label && <h3 style={{ marginTop: 20 }}>{group.label}</h3>}
      {group.athletes.length === 0 ? (
        <p className="meta">No athletes here yet.</p>
      ) : (
        <>
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
                    {' '}
                    <span aria-hidden="true" style={{ color: 'var(--series-1)' }}>→</span>
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

          <div className="stats" style={{ marginTop: 10 }}>
            <div className="stat">
              <div className="k">Precision</div>
              <div className="v">{precisionPct(group.bouts)}</div>
              <div className="n">{group.bouts.length} bout{group.bouts.length === 1 ? '' : 's'}</div>
            </div>
            <div className="stat">
              <div className="k">Metal</div>
              <div className="v">{metalPct(group.metalBouts)}</div>
              <div className="n">{group.metalBouts.length} bout{group.metalBouts.length === 1 ? '' : 's'}</div>
            </div>
          </div>

          {metal.length > 0 && (
            <div className="stats" style={{ marginTop: 8 }}>
              {metal.map((s) => (
                <div className="stat" key={s.position}>
                  <div className="k">{s.position}</div>
                  <div className="v">{s.hitRatePct.toFixed(0)}<small>%</small></div>
                  <div className="n">{s.bouts} bout{s.bouts === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
          )}

          {targets.length > 0 && (
            <>
              <p className="meta" style={{ marginTop: 8, marginBottom: 4 }}>Which targets get missed</p>
              <div className="stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                {targets.map((t) => (
                  <div className="stat" key={t.target}>
                    <div className="k">{t.target}</div>
                    <div className="v">{t.missRatePct}<small>%</small></div>
                    <div className="n">{t.misses}/{t.bouts}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

function ClubRosterSection({ club }: { club: Club }) {
  const [athletes, setAthletes] = useState<RosterAthlete[] | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [groupData, setGroupData] = useState<Map<string, { bouts: Bout[]; metalBouts: MetalBout[] }>>(new Map())
  const [openAthleteId, setOpenAthleteId] = useState<string | null>(null)
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
            const [b, m] = await Promise.all([rosterBouts(ids), rosterMetalBouts(ids)])
            return [key, { bouts: b, metalBouts: m }] as const
          }),
        )
        if (cancelled) return
        setGroupData(new Map(entries))
      })
      .catch((e) => console.error('Could not load this club’s roster', e))
    return () => { cancelled = true }
  }, [club.id, reloadKey])

  const openAthlete = athletes?.find((a) => a.athleteId === openAthleteId)
  if (openAthlete) {
    return (
      <>
        <button className="link" onClick={() => setOpenAthleteId(null)}>← Roster</button>
        <h1 style={{ marginTop: 10 }}>{openAthlete.displayName || 'Unnamed athlete'}</h1>
        <AthleteDetail athlete={openAthlete} />
      </>
    )
  }

  if (athletes === null) {
    return (
      <>
        <h2>Roster</h2>
        <p className="meta">Loading…</p>
      </>
    )
  }
  if (athletes.length === 0) {
    return (
      <>
        <h2>Roster</h2>
        <p className="meta">Nobody's joined with this club's code yet.</p>
      </>
    )
  }

  const byProgram = new Map<string, RosterAthlete[]>()
  for (const a of athletes) {
    const key = a.programId ?? NO_PROGRAM_KEY
    byProgram.set(key, [...(byProgram.get(key) ?? []), a])
  }
  const emptyData = { bouts: [] as Bout[], metalBouts: [] as MetalBout[] }

  // No programs at this club at all yet — one flat, unlabelled group, same
  // as the roster looked before programs existed.
  if (programs.length === 0) {
    return (
      <>
        <h2>Roster</h2>
        <RosterGroup
          group={{ key: NO_PROGRAM_KEY, label: '', athletes, ...(groupData.get(NO_PROGRAM_KEY) ?? emptyData) }}
          onOpenAthlete={setOpenAthleteId}
        />
      </>
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
      <h2>Roster</h2>
      {actionError && <div className="notice error">{actionError}</div>}
      {groups.map((g) => (
        <RosterGroup
          key={g.key} group={g} onOpenAthlete={setOpenAthleteId}
          onRemove={g.key === NO_PROGRAM_KEY ? undefined : (a, name) => void removeFromProgram(a, name)}
          programs={g.key === NO_PROGRAM_KEY ? programs : undefined}
          onAssign={g.key === NO_PROGRAM_KEY ? (a, programId) => void assignToProgram(a, programId) : undefined}
        />
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

export function CoachView({ session, onIdentityChanged }: Props) {
  const { coach, setCoach, clubs, loadError, refreshClubs } = useCoachAndClubs(session)
  const [openClubId, setOpenClubId] = useState<string | null>(null)

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

  const openClub = clubs.find((c) => c.id === openClubId)
  if (openClub) {
    return (
      <>
        <button className="link" onClick={() => setOpenClubId(null)}>← All clubs</button>
        <h1 style={{ marginTop: 10 }}>{openClub.name}</h1>
        <ClubRosterSection club={openClub} />
      </>
    )
  }

  return (
    <>
      <h1 style={{ marginBottom: 8 }}>Coach your clubs</h1>
      {clubs.length === 0 && <p className="meta">Nothing yet — create or join one from your Profile.</p>}
      {clubs.map((c) => (
        <button key={c.id} className="boutrow" onClick={() => setOpenClubId(c.id)}>
          <ClubLogo logoPath={c.logoPath} size={40} />
          <div className="grow">
            <div className="title">{c.name}</div>
            <div className="meta">
              Join code <strong style={{ fontFamily: 'var(--mono, monospace)', letterSpacing: '0.05em' }}>{c.joinCode}</strong>
            </div>
          </div>
          <span className="meta" aria-hidden="true">›</span>
        </button>
      ))}

      {clubs.length > 0 && <FeedView role="coach" clubCount={clubs.length} />}
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
      `and athletes' training. They can rejoin with the coach invite code.`,
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
        </p>
        <p className="meta" style={{ marginBottom: 0 }}>Give this to an athlete — they enter it in their own Profile to join.</p>
      </div>

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
              Only admins can see this — share it to invite another coach to this club.
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
        <h1 style={{ marginTop: 10 }}>{openClub.name}</h1>
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
                <div className="title">{c.name}</div>
              </div>
              <span className="meta" aria-hidden="true">›</span>
            </button>
          ))}
        </>
      )}
    </>
  )
}
