import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ensureAthleteRow, getAthlete, signOut, updateDisplayName } from '../lib/auth'
import {
  becomeCoach, findClubByJoinCode, findProgramByJoinCode, getCoach, joinClubAsAthlete, joinProgramAsAthlete,
  leaveClub, leaveProgram, myClubCoaches, myCoachedClubs, myMemberships, updateCoachDisplayName,
  type Club, type ClubCoach, type Membership,
} from '../lib/coaching'
import { errorMessage } from '../lib/errors'
import { ClubLogo } from './ClubLogo'
import { CreateClub, JoinClubAsCoach } from './CoachView'
import { AdminPill, AdminShield, TrashIcon } from './icons'
import { setDevMode } from '../lib/dev'
import { Dropdown } from './Dropdown'
import { GoalsCard } from './GoalsCard'
import { NameField } from './NameField'
import { FollowAthleteCard } from './FollowAthleteCard'
import { RcmPledgeStatus, ResponsibilitiesGate } from './CoachResponsibilities'
import { PersonalCoachesCard } from './PersonalCoachesCard'
import { PlatformAccessCard } from './PlatformAccessCard'

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
  /** Granted in Supabase. Unlocks the dev mode switch under Session. */
  isDev?: boolean
  /** Dev mode is on for this tab: what's created is test data. */
  devMode?: boolean
  /** Granted in the database: shows the way into the read-only platform view. */
  isPlatformAdmin?: boolean
  onOpenPlatform?: () => void
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
/** "Member since: October 2026" — when the account (or, for a coach, the
 *  coaching identity) was made, in the reader's
 *  own locale. Nothing if the date is missing or unreadable. */
function memberSince(createdAt: string | undefined): string | undefined {
  const d = createdAt ? new Date(createdAt) : null
  if (!d || Number.isNaN(d.getTime())) return undefined
  return `Member since: ${d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
}

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
    <Dropdown title="Become a coach">
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Set up a coaching identity too if you also want to create a club and see a roster's
          training — it doesn't replace your athlete profile, it sits alongside it. Before you can
          coach you'll be asked to agree to the coach responsibilities, which start with Canadian Safe Sport.
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
    </Dropdown>
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
                {c.isAdmin && <AdminPill style={{ marginLeft: 6 }} />}
              </span>
              <span className="meta">
                Join code <strong style={{ fontFamily: 'var(--mono, monospace)', letterSpacing: '0.05em' }}>{c.joinCode}</strong>
              </span>
            </div>
          ))
        )}
      </div>

      <Dropdown title="New club">
        <CreateClub onCreated={(c) => setClubs((prev) => [...(prev ?? []), c])} />
      </Dropdown>

      <Dropdown title="Join an existing club">
        <JoinClubAsCoach onJoined={refreshClubs} />
      </Dropdown>

      <Dropdown title="Follow an athlete">
        <FollowAthleteCard />
      </Dropdown>
    </>
  )
}

/** The way into the read-only platform view, for the app's operator. Says
 *  plainly what it is: nothing here is hidden from the people being looked at. */
function PlatformAdminCard({ hasCoach, onOpen }: { hasCoach: boolean; onOpen: () => void }) {
  return (
    <>
      <h2>Platform admin</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Look at any club, read-only. You're on no club's coach list and can't change anything, and each
          club or athlete you open is logged where the athlete can see it.
        </p>
        {hasCoach ? (
          <button className="secondary" onClick={onOpen}>Open the platform view</button>
        ) : (
          <p className="meta" style={{ marginBottom: 0 }}>Set up a coaching identity first, and agree to the coach responsibilities, to use this.</p>
        )}
      </div>
    </>
  )
}

/** Shown for someone with both identities — switching is the one reason a
 *  session-mode control needs to exist at all — and for a dev account, which
 *  can also enter dev mode. Dev mode is separate from athlete/coach: the
 *  role switch still works inside it. */
function SessionCard({
  mode, onSwitchRole, isDev, devMode,
}: { mode: 'athlete' | 'coach'; onSwitchRole?: () => void; isDev?: boolean; devMode?: boolean }) {
  if (!onSwitchRole && !isDev) return null
  return (
    <Dropdown title="Session">
      {onSwitchRole && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Signed in as {mode === 'athlete' ? 'an athlete' : 'a coach'} this session.
          </p>
          <button className="secondary" onClick={onSwitchRole}>
            Switch to {mode === 'athlete' ? 'coach' : 'athlete'}
          </button>
        </div>
      )}
      {isDev && (
        <div className="card" style={{ borderColor: 'var(--critical)' }}>
          <p style={{ marginTop: 0 }}>
            <strong style={{ color: 'var(--critical)' }}>Dev mode</strong> is for testing.{' '}
            {devMode
              ? 'It is on: everything you create is test data, hidden from the club, and you see only test data.'
              : 'While it is on, everything you create is test data, hidden from the club, and you see only test data. Athlete and coach still work inside it.'}
          </p>
          <button className="secondary dev-switch" onClick={() => setDevMode(!devMode)}>
            {devMode ? 'Leave dev mode' : 'Enter dev mode'}
          </button>
        </div>
      )}
    </Dropdown>
  )
}

export function ProfileView({ session, hasAthlete, hasCoach, onIdentityChanged, mode, onSwitchRole, onOpenSettings, isDev, devMode, isPlatformAdmin, onOpenPlatform }: Props) {
  const [name, setName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [settingUp, setSettingUp] = useState(false)

  const [coachName, setCoachName] = useState('')
  const [coachLoaded, setCoachLoaded] = useState(false)

  const [memberships, setMemberships] = useState<Membership[]>([])
  const [coachSince, setCoachSince] = useState<string | undefined>(undefined)
  const [clubCoaches, setClubCoaches] = useState<ClubCoach[]>([])
  const [membershipsError, setMembershipsError] = useState('')
  const [code, setCode] = useState('')
  const [match, setMatch] = useState<JoinMatch | null>(null)
  const [joinError, setJoinError] = useState('')
  const [checking, setChecking] = useState(false)
  const [joining, setJoining] = useState(false)

  const refreshMemberships = () => {
    setMembershipsError('')
    void myClubCoaches().then(setClubCoaches).catch(() => undefined) // a nicety: the clubs list works without it
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
        setCoachSince(c?.createdAt)
        setCoachLoaded(true)
      })
      .catch((e) => console.error('Could not load coach profile', e))
  }, [session.user.id, hasCoach])

  async function saveCoachName(next: string) {
    await updateCoachDisplayName(session.user.id, next)
    setCoachName(next)
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

  async function save(next: string) {
    await updateDisplayName(session.user.id, next)
    setName(next)
  }

  if (!hasAthlete) {
    return (
      <>
        <ProfileHeader onOpenSettings={onOpenSettings} />
        <SessionCard mode={mode} onSwitchRole={onSwitchRole} isDev={isDev} devMode={devMode} />
        {isPlatformAdmin && onOpenPlatform && <PlatformAdminCard hasCoach={hasCoach} onOpen={onOpenPlatform} />}
        {mode === 'coach' && <CoachedClubsCard />}

        <h2>Coach details</h2>
        <div className="card">
          <NameField hint={memberSince(coachSince)} value={coachName} loaded={coachLoaded} onSave={saveCoachName} />
            <RcmPledgeStatus coachId={session.user.id} />
        </div>

        <Dropdown title="Set up an athlete profile">
          <div className="card">
            <p style={{ marginTop: 0 }}>
              You're signed in as a coach only. Set up an athlete profile too if you also want to log
              your own training — it doesn't replace your coaching identity, it sits alongside it.
            </p>
            <button className="secondary" onClick={() => void setUpAthlete()} disabled={settingUp}>
              {settingUp ? 'Setting up…' : 'Set up an athlete profile'}
            </button>
          </div>
        </Dropdown>

        <Dropdown title="Account">
          <div className="card">
            <p>{session.user.email}</p>
            <button className="secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </Dropdown>
        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '24px 0 20px' }} />
        <p className="meta" style={{ textAlign: 'center' }}>
          <a href="/features" className="link" style={{ color: 'inherit' }}>What it does</a>
          {' · '}
          <a href="/privacy" className="link" style={{ color: 'inherit' }}>Privacy Policy</a>
          {' · '}
          <a href="/terms" className="link" style={{ color: 'inherit' }}>Terms and Conditions</a>
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
            <NameField hint={memberSince(session.user.created_at)} value={name} loaded={loaded} onSave={save} />
          </div>

          <h2>Your clubs</h2>
          <div className="card">
            {membershipsError && <div className="notice error" style={{ marginTop: 0 }}>{membershipsError}</div>}
            {!membershipsError && memberships.length === 0 ? (
              <p className="meta" style={{ marginTop: 0 }}>Not in a club yet.</p>
            ) : (
              memberships.map((m) => (
                <div key={m.clubId} style={{ marginBottom: 12 }}>
                  <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                    <ClubLogo logoPath={m.logoPath} size={32} />
                    <span style={{ flex: 1, minWidth: 0 }}>{m.clubName}</span>
                    <button
                      className="link danger" style={{ flex: 'none' }}
                      aria-label={`Leave ${m.clubName}`} title="Leave club"
                      onClick={async () => {
                        if (!confirm(
                          `Leave ${m.clubName}?\n\nYou'll leave the club and its program. Its coaches will no longer see your ` +
                          `training, and anything you've posted to its feed will be removed. You can rejoin with a join code.`,
                        )) return
                        await leaveClub(m.clubId)
                        refreshMemberships()
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  {clubCoaches.some((c) => c.clubId === m.clubId) && (
                    <div style={{ margin: '6px 0 0', paddingLeft: 42, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                      <span className="meta">Coaches </span>
                      {clubCoaches.filter((c) => c.clubId === m.clubId).map((c) => (
                        <span
                          key={c.coachId} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          title={c.isAdmin ? 'Club admin' : undefined}
                        >
                          {c.isAdmin && (
                            <span role="img" aria-label="Club admin" style={{ color: 'var(--series-1)', display: 'inline-flex' }}>
                              <AdminShield size={12} />
                            </span>
                          )}
                          {c.displayName || 'Unnamed coach'}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.programName && (
                    <div className="row" style={{ alignItems: 'center', gap: 10, marginTop: 6, paddingLeft: 42 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="meta">Program </span>
                        <span className="pill">{m.programName}</span>
                      </span>
                      <button
                        className="link danger" style={{ flex: 'none' }}
                        aria-label={`Leave the ${m.programName} program`} title="Leave program"
                        onClick={async () => {
                          if (!confirm(
                            `Leave the ${m.programName} program?\n\nYou'll stay in ${m.clubName}, and its coaches who oversee the whole ` +
                            `club can still see your training. Coaches assigned only to ${m.programName} won't. ` +
                            `You can rejoin with the program's join code.`,
                          )) return
                          await leaveProgram(m.clubId)
                          refreshMemberships()
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <Dropdown title="Join a club or program">
            <div className="card">
              <label className="field" style={{ marginBottom: 0 }}>
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
          </Dropdown>

          {match && (
            <div className="modal-overlay" role="dialog" aria-modal="true">
              <div className="modal-card">
                <h2 style={{ marginTop: 0 }}>Share your training?</h2>
                <p className="meta">
                  Joining{' '}
                  {match.kind === 'club'
                    ? <><strong>{match.name}</strong></>
                    : <><strong>{match.name}</strong> in <strong>{match.clubName}</strong></>}
                  {' '}shares your workouts and scores with its coach(es) going forward — they'll be able to see
                  your training, and any coach's notes on it, for as long as you're a member. Your target photos
                  stay private.
                </p>
                <p className="meta">
                  545 Coach's own team can also open your training, read-only, for support and safety. Each time
                  they do, it's recorded for you to see in your Profile.
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

          <GoalsCard />

          <PersonalCoachesCard />
          <PlatformAccessCard />
        </>
      )}

      {mode === 'coach' && (
        <>
          <h2>Coach details</h2>
          <div className="card">
            <NameField hint={memberSince(coachSince)} value={coachName} loaded={coachLoaded} onSave={saveCoachName} />
            <RcmPledgeStatus coachId={session.user.id} />
          </div>

          <ResponsibilitiesGate coachId={session.user.id} enabled={hasCoach}>
            <CoachedClubsCard />
          </ResponsibilitiesGate>
        </>
      )}

      <SessionCard mode={mode} onSwitchRole={onSwitchRole} isDev={isDev} devMode={devMode} />
      {isPlatformAdmin && onOpenPlatform && <PlatformAdminCard hasCoach={hasCoach} onOpen={onOpenPlatform} />}
      {!hasCoach && <BecomeCoachCard onDone={onIdentityChanged} />}

      <Dropdown title="Account">
        <div className="card">
          <p>{session.user.email}</p>
          <button className="secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </Dropdown>
      <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '24px 0 20px' }} />
      <p className="meta" style={{ textAlign: 'center' }}>
        <a href="/features" className="link" style={{ color: 'inherit' }}>What it does</a>
        {' · '}
        <a href="/privacy" className="link" style={{ color: 'inherit' }}>Privacy Policy</a>
        {' · '}
        <a href="/terms" className="link" style={{ color: 'inherit' }}>Terms and Conditions</a>
      </p>
    </>
  )
}
