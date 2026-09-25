import { useState } from 'react'
import { setRoleIntent, signInWithGoogle } from '../lib/auth'

type Role = 'athlete' | 'coach'

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  )
}

function CoachIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="26" height="26">
      <circle cx="9" cy="8.5" r="2.6" />
      <path d="M3.5 19c0.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5" />
      <path d="M15.5 6.5a2.6 2.6 0 1 1 0 5.2" />
      <path d="M15.6 14c2.2 0.4 3.7 2 4.4 5" />
    </svg>
  )
}

function Feature({
  icon, title, cta, children,
}: {
  icon: React.ReactNode
  title: string
  cta: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="card" style={{ marginTop: 12, textAlign: 'left' }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 'none', color: 'var(--series-1)' }}>{icon}</div>
        <div>
          <h3 style={{ margin: '0 0 4px' }}>{title}</h3>
          <p className="meta" style={{ margin: 0 }}>{children}</p>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>{cta}</div>
    </div>
  )
}

export function SignInView() {
  const [pending, setPending] = useState<Role | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function start(role: Role) {
    setPending(role)
    setError(null)
    setRoleIntent(role)
    const { error } = await signInWithGoogle()
    if (error) {
      setError(error.message)
      setPending(null)
    }
    // On success the page navigates away to Google, so no need to clear pending.
  }

  return (
    <div className="app">
      {/* No tab bar on this screen, so the app-wide bottom padding meant to
          clear it would just leave a dead gap here. */}
      <main className="main" style={{ paddingBottom: 32 }}>
        <div style={{ maxWidth: 420, width: '100%', margin: '0 auto', padding: '32px 0 8px', textAlign: 'center' }}>
          <svg viewBox="0 0 24 24" width="52" height="52" style={{ margin: '0 auto 14px' }}>
            <circle cx="12" cy="12" r="9" fill="none" stroke="#3987e5" strokeWidth="1.4" />
            <circle cx="12" cy="12" r="5" fill="none" stroke="#3987e5" strokeWidth="1.1" opacity="0.6" />
            <circle cx="9.8" cy="10.4" r="1.3" fill="#d95926" />
            <circle cx="13.4" cy="12.6" r="1.3" fill="#d95926" />
            <circle cx="11" cy="14.3" r="1.3" fill="#d95926" />
          </svg>
          <h1 style={{ margin: '0 0 6px' }}>545, Coach!</h1>
          <p className="lede" style={{ margin: '0 auto' }}>
            What every athlete wants to say.
            <br />
            What every coach wants to hear.
            <br />
            Precision and metal shooting analysis for biathletes and the coaches who train them.
          </p>
        </div>

        <div style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
          <Feature
            icon={<TargetIcon />}
            title="Log every bout"
            cta={
              <button className="primary" style={{ width: '100%' }} onClick={() => void start('athlete')} disabled={pending !== null}>
                {pending === 'athlete' ? 'Opening Google…' : 'Sign in as an athlete'}
              </button>
            }
          >
            Score a target photo automatically, log metal hits round by round, and see where your
            groups drift and which targets you miss — a coaching read built from your own data, not a
            generic tip.
          </Feature>
          <Feature
            icon={<CoachIcon />}
            title="Coach a whole club"
            cta={
              <button className="primary" style={{ width: '100%' }} onClick={() => void start('coach')} disabled={pending !== null}>
                {pending === 'coach' ? 'Opening Google…' : 'Sign in as a coach'}
              </button>
            }
          >
            Create a club, hand out a join code, and see every athlete's training without digging
            through spreadsheets — leave notes right on their workouts, and switch between coaching
            and your own training in one profile.
          </Feature>

          <p className="meta" style={{ marginTop: 14, textAlign: 'center' }}>
            You can always add the other later — an athlete can become a coach too, and a coach can
            log their own training.
          </p>
          {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}

          <p className="meta" style={{ marginTop: 20, textAlign: 'center' }}>
            <a href="/features" className="link" style={{ color: 'inherit' }}>What it does</a>
            {' · '}
            <a href="/privacy" className="link" style={{ color: 'inherit' }}>Privacy Policy</a>
            {' · '}
            <a href="/terms" className="link" style={{ color: 'inherit' }}>Terms and Conditions</a>
          </p>
        </div>
      </main>
    </div>
  )
}
