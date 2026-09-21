import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ensureAthleteRow, getAthlete, signOut, updateDisplayName } from '../lib/auth'
import {
  becomeCoach, findClubByJoinCode, findProgramByJoinCode, getCoach, joinClubAsAthlete, joinProgramAsAthlete,
  leaveClub, myCoachedClubs, myMemberships, updateCoachDisplayName,
  type Club, type Membership,
} from '../lib/coaching'
import { errorMessage } from '../lib/errors'
import { ClubLogo } from './ClubLogo'
import { CreateClub, JoinClubAsCoach } from './CoachView'

/** A code an athlete enters could be either kind — the input doesn't ask
 *  them to know which, it just tries a club code, then a program code. */
type JoinMatch =
  | { kind: 'club'; id: string; name: string }
  | { kind: 'program'; id: string; name: string; clubName: string }

interface Props {
  session: Session
  hasAthlete: boolean
  /** Whether a coach identity already exists — an athlete without one gets
   *  a way to set one up here, since the Coach tab itself is hidden until
   *  they're actually acting as a coach. */
  hasCoach: boolean
  /** Refreshes the app's identity gate — called after setting up an athlete
   *  or coach profile here, so the tabs and session choice reflect it
   *  immediately. */
  onIdentityChanged: () => void
  /** Which identity this session is acting as. */
  mode: 'athlete' | 'coach'
  /** Present only when the signed-in user has both an athlete and a coach
   *  identity — there's nothing to switch to otherwise. */
  onSwitchRole?: () => void
  /** Opens Settings — present only in athlete mode, since Settings is all
   *  athlete calibration fields and the Settings tab itself is hidden while
   *  coaching. */
  onOpenSettings?: () => void
}

function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ProfileHeader({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h1 style={{ margin: 0 }}>Profile</h1>
      {onOpenSettings && (
        <button
          className="link"
          aria-label="Settings"
          onClick={onOpenSettings}
          style={{ color: 'var(--text-secondary)' }}
        >
          <CogIcon />
        </button>
      )}
    </div>
  )
}

/** Shown only to an athlete without a coach identity yet — the Coach tab is
 *  hidden until mode actually switches to coach, so this is the only way in
 *  for someone starting from athlete-only. */
function BecomeCoachCard({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [settingUp, setSettingUp] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSettingUp(true)
    setError('')
    try {
      await becomeCoach(name.trim())
      onDone()
    } catch (e) {
      setError(errorMessage(e, 'Could not set up your coach profile. Check your connection and try again.'))
    } finally {
      setSettingUp(false)
    }
  }

  return (
    <>
      <h2>Coaching</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Set up a coaching identity too if you also want to create a club and see a roster's
          training — it doesn't replace your athlete profile, it sits alongside it.
        </p>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Your name<small>Shown to athletes on any club you create.</small></span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <div className="notice error" style={{ marginTop: 10 }}>{error}</div>}
        <button
          className="secondary" style={{ marginTop: 10 }}
          onClick={() => void submit()} disabled={settingUp || name.trim().length === 0}
        >
          {settingUp ? 'Setting up…' : 'Become a coach'}
        </button>
      </div>
    </>
  )
}

/** Shown whenever a coach identity exists — this is the only place besides
 *  the Coach tab itself that lists them, so switching to athlete mode (which
 *  hides that tab entirely) doesn't also hide the fact that these clubs
 *  exist. */
function CoachedClubsCard() {
  const [clubs, setClubs] = useState<Club[] | null>(null)
  const [error, setError] = useState('')

  const refreshClubs = () =>
    void myCoachedClubs()
      .then(setClubs)
      .catch((e) => setError(errorMessage(e, 'Could not load the clubs you coach. Check your connection and try again.')))

  useEffect(refreshClubs, [])

  if (error) {
    return (
      <>
        <h2>Clubs you coach</h2>
        <div className="notice error">{error}</div>
      </>
    )
  }
  if (clubs === null) return null

  return (
    <>
      <h2>Clubs you coach</h2>
      <div className="card">
        {clubs.length === 0 ? (
          <p className="meta" style={{ marginTop: 0 }}>Not coaching any clubs yet.</p>
        ) : (
          clubs.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: 'center', marginBottom: 8, gap: 10 }}>
              <ClubLogo logoPath={c.logoPath} size={32} />
              <span style={{ flex: 1 }}>
                {c.name}
                {c.isAdmin && <span className="pill" style={{ marginLeft: 6 }}>Admin</span>}
              </span>
              <span className="meta">
                Join code <strong style={{ fontFamily: 'var(--mono, monospace)', letterSpacing: '0.05em' }}>{c.joinCode}</strong>
              </span>
            </div>
          ))
        )}
      </div>

      <h3 style={{ marginTop: 16 }}>New club</h3>
      <CreateClub onCreated={(c) => setClubs((prev) => [...(prev ?? []), c])} />

      <h3 style={{ marginTop: 16 }}>Join an existing club</h3>
      <JoinClubAsCoach onJoined={refreshClubs} />
    </>
  )
}

/** Shown only for someone with both identities — switching is the one
 *  reason a session-mode control needs to exist at all. */
function SessionCard({ mode, onSwitchRole }: { mode: 'athlete' | 'coach'; onSwitchRole?: () => void }) {
  if (!onSwitchRole) return null
  return (
    <>
      <h2>Session</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Signed in as {mode === 'athlete' ? 'an athlete' : 'a coach'} this session.
        </p>
        <button className="secondary" onClick={onSwitchRole}>
          Switch to {mode === 'athlete' ? 'coach' : 'athlete'}
        </button>
      </div>
    </>
  )
}

export function ProfileView({ session, hasAthlete, hasCoach, onIdentityChanged, mode, onSwitchRole, onOpenSettings }: Props) {
  const [name, setName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingUp, setSettingUp] = useState(false)

  const [coachName, setCoachName] = useState('')
  const [coachLoaded, setCoachLoaded] = useState(false)
  const [coachSaving, setCoachSaving] = useState(false)
  const [coachSaved, setCoachSaved] = useState(false)

  const [memberships, setMemberships] = useState<Membership[]>([])
  const [membershipsError, setMembershipsError] = useState('')
  const [code, setCode] = useState('')
  const [match, setMatch] = useState<JoinMatch | null>(null)
  const [joinError, setJoinError] = useState('')
  const [checking, setChecking] = useState(false)
  const [joining, setJoining] = useState(false)

  const refreshMemberships = () => {
    setMembershipsError('')
    void myMemberships()
      .then(setMemberships)
      .catch((e) => setMembershipsError(errorMessage(e, 'Could not load your clubs. Check your connection and try again.')))
  }

  useEffect(() => {
    if (!hasAthlete) return
    void getAthlete(session.user.id)
      .then((a) => {
        setName(a?.displayName ?? '')
        setLoaded(true)
      })
      .catch((e) => console.error('Could not load athlete profile', e))
    refreshMemberships()
  }, [session.user.id, hasAthlete])

  useEffect(() => {
    if (!hasCoach) return
    void getCoach(session.user.id)
      .then((c) => {
        setCoachName(c?.displayName ?? '')
        setCoachLoaded(true)
      })
      .catch((e) => console.error('Could not load coach profile', e))
  }, [session.user.id, hasCoach])

  async function saveCoachName() {
    setCoachSaving(true)
    try {
      await updateCoachDisplayName(session.user.id, coachName.trim())
      setCoachSaved(true)
    } finally {
      setCoachSaving(false)
    }
  }

  async function setUpAthlete() {
    setSettingUp(true)
    try {
      await ensureAthleteRow(session)
      onIdentityChanged()
    } finally {
      setSettingUp(false)
    }
  }

  async function checkCode() {
    setJoinError('')
    setMatch(null)
    if (!code.trim()) return
    setChecking(true)
    try {
      const club = await findClubByJoinCode(code)
      if (club) {
        setMatch({ kind: 'club', id: club.id, name: club.name })
        return
      }
      const program = await findProgramByJoinCode(code)
      if (program) {
        setMatch({ kind: 'program', id: program.id, name: program.name, clubName: program.clubName })
        return
      }
      setJoinError("That code doesn't match a club or program. Check it and try again.")
    } catch {
      setJoinError('Could not check that code. Check your connection and try again.')
    } finally {
      setChecking(false)
    }
  }

  async function confirmJoin() {
    if (!match) return
    setJoining(true)
    try {
      if (match.kind === 'club') await joinClubAsAthlete(code)
      else await joinProgramAsAthlete(code)
      setMatch(null)
      setCode('')
      refreshMemberships()
    } catch {
      setJoinError('Could not join that club. Check your connection and try again.')
    } finally {
      setJoining(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      await updateDisplayName(session.user.id, name.trim())
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!hasAthlete) {
    return (
      <>
        <ProfileHeader onOpenSettings={onOpenSettings} />
        <SessionCard mode={mode} onSwitchRole={onSwitchRole} />
        {mode === 'coach' && <CoachedClubsCard />}

        <h2>Coach details</h2>
        <div className="card">
          <label className="field" style={{ marginBottom: 0 }}>
            <span>
              Name
              <small>Shown to athletes and other coaches on any club you're part of.</small>
            </span>
            <div className="row">
              <input
                type="text"
                style={{ flex: 1 }}
                value={coachName}
                disabled={!coachLoaded}
                onChange={(e) => {
                  setCoachName(e.target.value)
                  setCoachSaved(false)
                }}
              />
              <button
                className="secondary"
                style={{ flex: 'none', width: 'auto' }}
                onClick={() => void saveCoachName()}
                disabled={!coachLoaded || coachSaving || coachName.trim().length === 0}
              >
                {coachSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </label>
          {coachSaved && <span className="meta">Saved.</span>}
        </div>

        <h2>Athlete details</h2>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            You're signed in as a coach only. Set up an athlete profile too if you also want to log
            your own training — it doesn't replace your coaching identity, it sits alongside it.
          </p>
          <button className="secondary" onClick={() => void setUpAthlete()} disabled={settingUp}>
            {settingUp ? 'Setting up…' : 'Set up an athlete profile'}
          </button>
        </div>

        <h2>Account</h2>
        <div className="card">
          <p>{session.user.email}</p>
          <button className="secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        <p className="meta" style={{ textAlign: 'center' }}>
          <a href="/privacy" className="link">Privacy Policy</a>
          {' · '}
          <a href="/terms" className="link">Terms and Conditions</a>
        </p>
      </>
    )
  }

  return (
    <>
      <ProfileHeader onOpenSettings={onOpenSettings} />

      {mode === 'athlete' && (
        <>
          <h2>Athlete details</h2>
          <div className="card">
            <label className="field" style={{ marginBottom: 0 }}>
              <span>
                Name
                <small>Shown to a coach who adds you to their club or program.</small>
              </span>
              <div className="row">
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={name}
                  disabled={!loaded}
                  onChange={(e) => {
                    setName(e.target.value)
                    setSaved(false)
                  }}
                />
                <button
                  className="secondary"
                  style={{ flex: 'none', width: 'auto' }}
                  onClick={() => void save()}
                  disabled={!loaded || saving || name.trim().length === 0}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </label>
            {saved && <span className="meta">Saved.</span>}
          </div>

          <h2>Your clubs</h2>
          <div className="card">
            {membershipsError && <div className="notice error" style={{ marginTop: 0 }}>{membershipsError}</div>}
            {!membershipsError && memberships.length === 0 ? (
              <p className="meta" style={{ marginTop: 0 }}>Not in a club yet.</p>
            ) : (
              memberships.map((m) => (
                <div key={m.clubId} className="row" style={{ alignItems: 'center', marginBottom: 8, gap: 10 }}>
                  <ClubLogo logoPath={m.logoPath} size={32} />
                  <span style={{ flex: 1 }}>
                    {m.clubName}
                    {m.programName && <span className="pill" style={{ marginLeft: 6 }}>{m.programName}</span>}
                  </span>
                  <button
                    className="link"
                    onClick={async () => {
                      if (!confirm(`Leave ${m.clubName}? Your coach there will no longer see your training.`)) return
                      await leaveClub(m.clubId)
                      refreshMemberships()
                    }}
                  >
                    Leave
                  </button>
                </div>
              ))
            )}

            <label className="field" style={{ marginTop: memberships.length > 0 ? 14 : 0, marginBottom: 0 }}>
              <span>
                Join with a code
                <small>
                  Get this from your coach — a program code (for a specific squad) joins its club too;
                  a plain club code joins with no program yet.
                </small>
              </span>
              <div className="row">
                <input
                  type="text"
                  style={{ flex: 1 }}
                  placeholder="e.g. 7K4RXP"
                  autoCapitalize="characters"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value)
                    setMatch(null)
                    setJoinError('')
                  }}
                />
                <button
                  className="secondary" style={{ flex: 'none', width: 'auto' }}
                  onClick={() => void checkCode()} disabled={checking || !code.trim()}
                >
                  {checking ? 'Checking…' : 'Find'}
                </button>
              </div>
            </label>
            {joinError && <div className="notice error" style={{ marginTop: 10 }}>{joinError}</div>}
          </div>

          {match && (
            <div className="modal-overlay" role="dialog" aria-modal="true">
              <div className="modal-card">
                <h2 style={{ marginTop: 0 }}>Share your training?</h2>
                <p className="meta">
                  Joining{' '}
                  {match.kind === 'club'
                    ? <><strong>{match.name}</strong></>
                    : <><strong>{match.name}</strong> in <strong>{match.clubName}</strong></>}
                  {' '}shares your workouts, scores, and target photos with its coach(es) going forward — they'll
                  be able to see your training, and any coach's notes on it, for as long as you're a member.
                </p>
                <p className="meta">If you're under 18, check with a parent or guardian before continuing.</p>
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="secondary" onClick={() => { setMatch(null); setCode('') }} disabled={joining}>
                    Cancel
                  </button>
                  <button className="primary" onClick={() => void confirmJoin()} disabled={joining}>
                    {joining ? 'Joining…' : 'Yes, share and join'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'coach' && (
        <>
          <h2>Coach details</h2>
          <div className="card">
            <label className="field" style={{ marginBottom: 0 }}>
              <span>
                Name
                <small>Shown to athletes and other coaches on any club you're part of.</small>
              </span>
              <div className="row">
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={coachName}
                  disabled={!coachLoaded}
                  onChange={(e) => {
                    setCoachName(e.target.value)
                    setCoachSaved(false)
                  }}
                />
                <button
                  className="secondary"
                  style={{ flex: 'none', width: 'auto' }}
                  onClick={() => void saveCoachName()}
                  disabled={!coachLoaded || coachSaving || coachName.trim().length === 0}
                >
                  {coachSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </label>
            {coachSaved && <span className="meta">Saved.</span>}
          </div>

          <CoachedClubsCard />
        </>
      )}

      <SessionCard mode={mode} onSwitchRole={onSwitchRole} />
      {!hasCoach && <BecomeCoachCard onDone={onIdentityChanged} />}

      <h2>Account</h2>
      <div className="card">
        <p>{session.user.email}</p>
        <button className="secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      <p className="meta" style={{ textAlign: 'center' }}>
        <a href="/privacy" className="link">Privacy Policy</a>
        {' · '}
        <a href="/terms" className="link">Terms and Conditions</a>
      </p>
    </>
  )
}
