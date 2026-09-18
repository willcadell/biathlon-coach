import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Bout, MetalBout, Workout } from '../lib/types'
import { DEFAULT_SETTINGS } from '../lib/types'
import { DISCS_PER_METAL_BOUT, hitsOf, metalStats, missCount, targetStats } from '../lib/metal'
import {
  addCoachNote, becomeCoach, coachesForClub, createClub, findClubByCoachCode, getCoach, getCoachJoinCode,
  joinClubAsCoach, myCoachedClubs, rosterBouts, rosterForClub, rosterMetalBouts, rosterWorkouts,
  type Club, type ClubMatch, type CoCoach, type Coach, type RosterAthlete,
} from '../lib/coaching'
import { AnalysisView } from './AnalysisView'
import { errorMessage } from '../lib/errors'

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

function CreateClub({ onCreated }: { onCreated: (club: Club) => void }) {
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
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}
      <button className="secondary" style={{ marginTop: 10 }} onClick={() => void submit()} disabled={saving || name.trim().length === 0}>
        {saving ? 'Creating…' : '+ Create a club'}
      </button>
    </div>
  )
}

function JoinClubAsCoach({ onJoined }: { onJoined: () => void }) {
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
        <input
          type="text"
          placeholder="e.g. 7K4RXP"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => { setCode(e.target.value); setMatch(null); setError('') }}
        />
      </label>
      {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}
      {match ? (
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
      ) : (
        <button className="secondary" style={{ marginTop: 10 }} onClick={() => void checkCode()} disabled={checking || !code.trim()}>
          {checking ? 'Checking…' : 'Join with a code'}
        </button>
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

function ClubRoster({ club }: { club: Club }) {
  const [athletes, setAthletes] = useState<RosterAthlete[] | null>(null)
  const [bouts, setBouts] = useState<Bout[]>([])
  const [metalBouts, setMetalBouts] = useState<MetalBout[]>([])
  const [coaches, setCoaches] = useState<CoCoach[]>([])
  const [coachCode, setCoachCode] = useState<string | null>(null)
  const [openAthleteId, setOpenAthleteId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setAthletes(null)
    void rosterForClub(club.id).then(async (roster) => {
      if (cancelled) return
      setAthletes(roster)
      const ids = roster.map((a) => a.athleteId)
      const [b, m] = await Promise.all([rosterBouts(ids), rosterMetalBouts(ids)])
      if (cancelled) return
      setBouts(b)
      setMetalBouts(m)
    }).catch((e) => console.error('Could not load this club’s roster', e))
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

  const targets = targetStats(metalBouts)
  const metal = metalStats(metalBouts)

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

  return (
    <>
      <div className="card">
        <p style={{ margin: 0 }}>
          Join code <strong style={{ fontFamily: 'var(--mono, monospace)', letterSpacing: '0.05em' }}>{club.joinCode}</strong>
        </p>
        <p className="meta" style={{ marginBottom: 0 }}>Give this to an athlete — they enter it in their own Profile to join.</p>
      </div>

      <h2>Coaches</h2>
      <div className="card">
        {coaches.map((c) => (
          <div key={c.coachId} className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
            <span style={{ flex: 1 }}>{c.displayName || 'Unnamed coach'}</span>
            {c.isAdmin && <span className="pill">Admin</span>}
          </div>
        ))}
        {club.isAdmin && (
          <>
            <p className="meta" style={{ marginTop: coaches.length > 0 ? 14 : 0, marginBottom: 4 }}>
              Only you, as admin, can see this — share it to invite another coach to this club.
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

      <h2>Roster</h2>
      {athletes === null && <p className="meta">Loading…</p>}
      {athletes?.length === 0 && <p className="meta">Nobody's joined with this club's code yet.</p>}
      {athletes && athletes.length > 0 && (
        <>
          {athletes.map((a) => (
            <button key={a.athleteId} className="boutrow" onClick={() => setOpenAthleteId(a.athleteId)}>
              <div className="grow">
                <div className="title">{a.displayName || 'Unnamed athlete'}</div>
              </div>
              <span className="meta" aria-hidden="true">›</span>
            </button>
          ))}

          <h3 style={{ marginTop: 16 }}>Whole roster</h3>
          <div className="stats">
            <div className="stat">
              <div className="k">Precision</div>
              <div className="v">{precisionPct(bouts)}</div>
              <div className="n">{bouts.length} bout{bouts.length === 1 ? '' : 's'}</div>
            </div>
            <div className="stat">
              <div className="k">Metal</div>
              <div className="v">{metalPct(metalBouts)}</div>
              <div className="n">{metalBouts.length} bout{metalBouts.length === 1 ? '' : 's'}</div>
            </div>
          </div>

          {metal.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>By position</h3>
              <div className="stats">
                {metal.map((s) => (
                  <div className="stat" key={s.position}>
                    <div className="k">{s.position}</div>
                    <div className="v">{s.hitRatePct.toFixed(0)}<small>%</small></div>
                    <div className="n">{s.bouts} bout{s.bouts === 1 ? '' : 's'}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {targets.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Which targets get missed, across the roster</h3>
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

export function CoachView({ session, onIdentityChanged }: Props) {
  const [coach, setCoach] = useState<Coach | null | undefined>(undefined)
  const [clubs, setClubs] = useState<Club[]>([])
  const [openClubId, setOpenClubId] = useState<string | null>(null)
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
        <ClubRoster club={openClub} />
      </>
    )
  }

  return (
    <>
      <h1>Coach</h1>
      <p className="lede">Coaching as {coach.displayName || session.user.email}.</p>

      <h2>Your clubs</h2>
      {clubs.length === 0 && <p className="meta">Nothing yet — create a club below to get a join code.</p>}
      {clubs.map((c) => (
        <button key={c.id} className="boutrow" onClick={() => setOpenClubId(c.id)}>
          <div className="grow">
            <div className="title">{c.name}</div>
            <div className="meta">Join code {c.joinCode}</div>
          </div>
          <span className="meta" aria-hidden="true">›</span>
        </button>
      ))}

      <h2 style={{ marginTop: 16 }}>New club</h2>
      <CreateClub onCreated={(c) => setClubs((prev) => [...prev, c])} />

      <h2 style={{ marginTop: 16 }}>Join an existing club</h2>
      <JoinClubAsCoach onJoined={refreshClubs} />
    </>
  )
}
