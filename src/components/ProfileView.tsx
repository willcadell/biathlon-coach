import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ensureAthleteRow, getAthlete, signOut, updateDisplayName } from '../lib/auth'
import { findClubByJoinCode, joinClubAsAthlete, leaveClub, myMemberships, type ClubMatch, type Membership } from '../lib/coaching'

interface Props {
  session: Session
  hasAthlete: boolean
  /** Refreshes the app's identity gate — called after setting up an athlete
   *  profile here, so the Shoot/History/Training tabs unlock immediately. */
  onIdentityChanged: () => void
}

export function ProfileView({ session, hasAthlete, onIdentityChanged }: Props) {
  const [name, setName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingUp, setSettingUp] = useState(false)

  const [memberships, setMemberships] = useState<Membership[]>([])
  const [code, setCode] = useState('')
  const [match, setMatch] = useState<ClubMatch | null>(null)
  const [joinError, setJoinError] = useState('')
  const [checking, setChecking] = useState(false)
  const [joining, setJoining] = useState(false)

  const refreshMemberships = () => void myMemberships().then(setMemberships)

  useEffect(() => {
    if (!hasAthlete) return
    void getAthlete(session.user.id).then((a) => {
      setName(a?.displayName ?? '')
      setLoaded(true)
    })
    refreshMemberships()
  }, [session.user.id, hasAthlete])

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
      const found = await findClubByJoinCode(code)
      if (found) setMatch(found)
      else setJoinError("That code doesn't match a club. Check it and try again.")
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
      await joinClubAsAthlete(code)
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
        <h1>Profile</h1>
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
          <p>Signed in as {session.user.email}.</p>
          <button className="secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <h1>Profile</h1>

      <h2>Athlete details</h2>
      <div className="card">
        <label className="field">
          <span>
            Name
            <small>Shown to a coach who adds you to their club or program.</small>
          </span>
          <input
            type="text"
            value={name}
            disabled={!loaded}
            onChange={(e) => {
              setName(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <button
          className="secondary"
          onClick={() => void save()}
          disabled={!loaded || saving || name.trim().length === 0}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="meta" style={{ marginLeft: 10 }}>Saved.</span>}
      </div>

      <h2>Your clubs</h2>
      <div className="card">
        {memberships.length === 0 ? (
          <p className="meta" style={{ marginTop: 0 }}>Not in a club yet.</p>
        ) : (
          memberships.map((m) => (
            <div key={m.clubId} className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
              <span style={{ flex: 1 }}>{m.clubName}</span>
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

        <label className="field" style={{ marginTop: memberships.length > 0 ? 14 : 0 }}>
          <span>
            Join with a code
            <small>Get this from your coach — joining lets them see your training in that club.</small>
          </span>
          <input
            type="text"
            placeholder="e.g. 7K4RXP"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setMatch(null)
              setJoinError('')
            }}
          />
        </label>
        {joinError && <div className="notice error">{joinError}</div>}
        {match ? (
          <>
            <p className="meta">Join <strong>{match.name}</strong>?</p>
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
          <button className="secondary" onClick={() => void checkCode()} disabled={checking || !code.trim()}>
            {checking ? 'Checking…' : 'Find club'}
          </button>
        )}
      </div>

      <h2>Account</h2>
      <div className="card">
        <p>Signed in as {session.user.email}.</p>
        <button className="secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </>
  )
}
