import { useState } from 'react'
import { signInWithGoogle } from '../lib/auth'

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

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginTop: 12, display: 'flex', gap: 14, textAlign: 'left' }}>
      <div style={{ flex: 'none', color: 'var(--series-1)' }}>{icon}</div>
      <div>
        <h3 style={{ margin: '0 0 4px' }}>{title}</h3>
        <p className="meta" style={{ margin: 0 }}>{children}</p>
      </div>
    </div>
  )
}

export function SignInView() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setPending(true)
    setError(null)
    const { error } = await signInWithGoogle()
    if (error) {
      setError(error.message)
      setPending(false)
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
          <h1 style={{ margin: '0 0 6px' }}>545 Coaching</h1>
          <p className="lede" style={{ margin: '0 auto' }}>
            Precision and metal shooting analysis for biathletes and the coaches who train them.
          </p>
        </div>

        <div style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
          <Feature icon={<TargetIcon />} title="Log every bout">
            Score a target photo automatically, log metal hits round by round, and see where your
            groups drift and which targets you miss — a coaching read built from your own data, not a
            generic tip.
          </Feature>
          <Feature icon={<CoachIcon />} title="Coach a whole club">
            Create a club, hand out a join code, and see every athlete's training without digging
            through spreadsheets — leave notes right on their workouts, and switch between coaching
            and your own training in one profile.
          </Feature>

          <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
            <button className="primary" onClick={() => void start()} disabled={pending} style={{ width: '100%' }}>
              {pending ? 'Opening Google…' : 'Sign in with Google'}
            </button>
            {error && (
              <div className="notice error" style={{ marginTop: 12, textAlign: 'left' }}>
                {error}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
