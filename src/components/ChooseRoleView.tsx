import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { displayNameFromSession, ensureAthleteRow } from '../lib/auth'
import { becomeCoach } from '../lib/coaching'

type Role = 'athlete' | 'coach'

interface Props {
  session: Session
  /** 'create' — neither identity exists yet, so choosing one sets it up.
   *  'select' — both already exist; this is a per-session choice of which
   *  one to use, with no database write at all. */
  variant: 'create' | 'select'
  onChosen: (role: Role) => void
}

/**
 * Two jobs depending on `variant`: the first-ever choice of which identity
 * to set up, or — for someone who already has both — which one to act as
 * for this session. Athlete and coach are independent identities (see
 * auth.ts), so this never forecloses the other: either side can still add
 * or switch to it later.
 */
export function ChooseRoleView({ session, variant, onChosen }: Props) {
  const [pending, setPending] = useState<Role | null>(null)

  async function choose(role: Role) {
    setPending(role)
    try {
      if (variant === 'create') {
        if (role === 'athlete') await ensureAthleteRow(session)
        else await becomeCoach(displayNameFromSession(session))
      }
      onChosen(role)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="app">
      <main className="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
          <h1 style={{ marginTop: 0 }}>
            {variant === 'create' ? 'How are you using 545 Coaching?' : 'Continue as…'}
          </h1>
          <p className="meta">
            {variant === 'create'
              ? "You can always set up the other later — an athlete can become a coach too, and a coach can log their own training."
              : 'You have both an athlete and a coach profile. Pick one for this session — switch anytime from Settings.'}
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="secondary"
              style={{ flex: 1 }}
              onClick={() => void choose('athlete')}
              disabled={pending !== null}
            >
              {pending === 'athlete' ? 'Setting up…' : variant === 'create' ? "I'm an athlete" : 'Athlete'}
            </button>
            <button
              className="primary"
              style={{ flex: 1 }}
              onClick={() => void choose('coach')}
              disabled={pending !== null}
            >
              {pending === 'coach' ? 'Setting up…' : variant === 'create' ? "I'm a coach" : 'Coach'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
