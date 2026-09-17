import { useState } from 'react'
import { signInWithGoogle } from '../lib/auth'

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
      <main className="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
          <svg viewBox="0 0 24 24" width="48" height="48" style={{ margin: '0 auto 12px' }}>
            <circle cx="12" cy="12" r="9" fill="none" stroke="#3987e5" strokeWidth="1.4" />
            <circle cx="12" cy="12" r="5" fill="none" stroke="#3987e5" strokeWidth="1.1" opacity="0.6" />
            <circle cx="9.8" cy="10.4" r="1.3" fill="#d95926" />
            <circle cx="13.4" cy="12.6" r="1.3" fill="#d95926" />
            <circle cx="11" cy="14.3" r="1.3" fill="#d95926" />
          </svg>
          <h1 style={{ marginTop: 0 }}>545 Coaching</h1>
          <p className="meta">Sign in to log workouts and see your training analytics from any device.</p>
          <button onClick={() => void start()} disabled={pending} style={{ marginTop: 12, width: '100%' }}>
            {pending ? 'Opening Google…' : 'Sign in with Google'}
          </button>
          {error && (
            <div className="notice error" style={{ marginTop: 12, textAlign: 'left' }}>
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
