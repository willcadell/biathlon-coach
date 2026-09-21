const UPDATED = 'September 20, 2026'

export function PrivacyPolicyView() {
  return (
    <div className="app">
      <main className="main" style={{ paddingBottom: 48 }}>
        <a href="/" className="link" style={{ display: 'inline-block', marginBottom: 16 }}>← 545 Coach</a>
        <h1>Privacy Policy</h1>
        <p className="meta">Last updated {UPDATED}.</p>

        <p>
          545 Coach ("the app") is a shooting-analysis tool for biathletes and their coaches. This
          page explains what information the app collects, why, and who can see it. It's written in
          plain language rather than dense legal text — if anything here is unclear, get in touch
          using the contact details at the bottom.
        </p>

        <h2>What we collect</h2>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <strong>Account info.</strong> When you sign in with Google, we receive your email address
            and the display name Google gives us. That's the only way to sign in — there's no separate
            password to store.
          </p>
          <p>
            <strong>Training data.</strong> Anything you log yourself: precision bout photos and their
            scored results, metal-target hit/miss records, wind and zero-click notes, workout names and
            free-text notes, and (if you choose to enter it) heart rate.
          </p>
          <p>
            <strong>Club and coaching relationships.</strong> If you join a club or program, or coach
            one, we store that membership — which club, which program, and whether you're an admin
            coach — so the right people can see the right rosters.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Coach notes.</strong> If a coach leaves a note on your workout, that note is stored
            and shared with every coach linked to you on that club, not just the one who wrote it.
          </p>
        </div>

        <h2>Who can see it</h2>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Your training data is private to you by default. A coach can only see it once you
            explicitly join their club or program with a code they give you — joining shows a
            confirmation naming exactly what you're agreeing to share before it happens. Leaving a
            club stops that coach from seeing anything new; it doesn't retroactively delete what they
            already saw.
          </p>
          <p style={{ marginBottom: 0 }}>
            We don't sell your data, and we don't share it with advertisers. Nobody outside the app
            sees your training data except the specific coaches you've chosen to share it with, and
            the infrastructure providers below who store it on our behalf.
          </p>
        </div>

        <h2>Automatic shot scoring</h2>
        <div className="card" style={{ marginBottom: 0 }}>
          <p style={{ marginTop: 0, marginBottom: 0 }}>
            If you turn on automatic reading of target photos, the cropped photo is sent to
            Anthropic's Claude API using an API key you provide yourself. That key is stored only in
            your own browser and the photo is sent directly from your device to Anthropic — it never
            passes through our own servers, because we don't operate one for this. You can turn this
            off entirely and mark shots by hand instead; everything else in the app still works.
          </p>
        </div>

        <h2>Where it's stored</h2>
        <p>
          Account data, training records, and target photos are stored with Supabase (Postgres
          database and file storage). Some settings — like your calibration values and whether
          automatic scoring is on — are kept only in your browser's local storage and aren't sent to
          us at all.
        </p>

        <h2>Minors</h2>
        <p>
          Biathlon rosters commonly include junior athletes. If you're a coach adding a minor to your
          club, or a parent helping a young athlete sign in, treat that as a real data-sharing
          decision, not a formality — the app shows a consent screen before any club membership takes
          effect for exactly this reason. If you're under the age where you can consent to this kind
          of data sharing on your own in your country, a parent or guardian should review this policy
          and set up the account with you.
        </p>

        <h2>Your choices</h2>
        <div className="card" style={{ marginBottom: 0 }}>
          <p style={{ marginTop: 0 }}>You can, at any time:</p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--text-secondary)' }}>
            <li style={{ marginBottom: 5 }}>Delete individual bouts, metal rounds, or whole workouts from History.</li>
            <li style={{ marginBottom: 5 }}>Delete every stored photo while keeping your scored results, from Settings.</li>
            <li style={{ marginBottom: 5 }}>Export everything you've logged as a JSON file, from Settings.</li>
            <li style={{ marginBottom: 5 }}>Leave a club at any time, which stops any new sharing with that club's coaches.</li>
            <li>Sign out, which ends your session without deleting your data.</li>
          </ul>
        </div>

        <h2>Contact</h2>
        <p style={{ marginBottom: 0 }}>
          Questions about this policy or your data can be sent to{' '}
          <a href="mailto:will@sparkgeo.com">will@sparkgeo.com</a>.
        </p>
      </main>
    </div>
  )
}
