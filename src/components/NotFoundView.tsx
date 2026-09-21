export function NotFoundView() {
  return (
    <div className="app">
      <main className="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <svg viewBox="0 0 24 24" width="52" height="52" style={{ margin: '0 auto 14px' }}>
            <circle cx="12" cy="12" r="9" fill="none" stroke="#3987e5" strokeWidth="1.4" opacity="0.5" />
            <circle cx="12" cy="12" r="5" fill="none" stroke="#3987e5" strokeWidth="1.1" opacity="0.3" />
          </svg>
          <h1 style={{ margin: '0 0 6px' }}>Off the paper</h1>
          <p className="lede" style={{ margin: '0 auto 20px' }}>
            There's nothing at this address — the page may have moved, or the link might be off by a
            character.
          </p>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '13px 24px', borderRadius: 10, background: 'var(--series-1)', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
            Back to 545 Coach
          </a>
        </div>
      </main>
    </div>
  )
}
