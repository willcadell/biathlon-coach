const UPDATED = 'September 25, 2026'

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
          <p>
            <strong>Personal coaches.</strong> If you invite a personal coach, we store a short-lived
            invite code and, once it's accepted, a link between you and that person, so they can see
            your training. If you're a personal coach, we store the link to each athlete you follow.
          </p>
          <p>
            <strong>Coach notes.</strong> If a coach leaves a note on your workout, that note is stored
            and shared with every coach linked to you on that club, not just the one who wrote it.
          </p>
          <p>
            <strong>Club feed posts.</strong> If you choose to post a target or a workout to your
            club's feed, we store a copy of what you shared, with your name. For a target that's the shot
            positions, score, position and date; for a workout it's the name, date, type and headline
            results such as hits and best score. Your notes, coach notes, zero-click log, heart rate and
            target photos are never part of a post.
          </p>
          <p>
            <strong>Cowbells.</strong> When someone rings a cowbell for a post we record who did, so a
            person can only ring once and can take it back. Other people see only the count.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Announcements.</strong> If you're a coach and post an announcement to a club, we
            store its text and your name.
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
          <p>
            <strong>Personal coaches.</strong> You can also invite one individual — a parent, or a coach
            outside your club — to follow you, regardless of any club. Only you can start this: you make
            an invite code and give it to them, and they accept it. It works once and expires after seven
            days. A personal coach can see your sessions, analysis and posts, and announcements made by
            the coaches of your club, but not the rest of the club's feed and never your target photos.
            You can remove them at any time, and they can step away themselves.
          </p>
          <p>
            What a club coach sees depends on how they're assigned. A coach assigned to one program sees only
            that program's athletes; a coach who oversees the whole club, and its admins, see every
            athlete in it.
          </p>
          <p style={{ marginBottom: 0 }}>
            We don't sell your data, and we don't share it with advertisers. Nobody outside the app
            sees your training data except the specific coaches you've chosen to share it with, anything
            you choose to post to your club's feed (see below), and the infrastructure providers below
            who store it on our behalf.
          </p>
        </div>

        <h2>The club feed</h2>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <strong>Nothing is posted automatically.</strong> Posting is a separate, deliberate step
            from the Share button, and the sheet says who will see it before you tap.
          </p>
          <p>
            <strong>Who sees a post.</strong> Everyone in that club — its athletes and its coaches —
            sees it, with your name. Athletes in your club can therefore see your targets and workouts
            in a way they otherwise couldn't; that is different from sharing with your coaches, so it's
            its own choice each time.
          </p>
          <p>
            <strong>Announcements.</strong> Coaches can post text announcements to their club's feed.
            Everyone in the club can see them and ring a cowbell for them. An announcement belongs to
            the club rather than to the coach who wrote it, so it stays if that coach leaves, until a
            coach at the club removes it.
          </p>
          <p>
            <strong>Taking a post down.</strong> You can remove your own posts from the feed at any
            time, and that deletes the copy we hold. Deleting the target or workout it came from also
            deletes its post, and leaving a club deletes everything you posted to it. Leaving only a
            program keeps your posts, because you're still in the club. Any coach at a club can remove
            any post in it, including yours, to keep the feed appropriate.
          </p>
          <p style={{ marginBottom: 0 }}>
            Removing a post stops anyone seeing it from then on, but can't undo what someone has
            already seen, screenshotted or shared from their own device. Think about that before you
            post.
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
        <p>
          A young athlete's parent can follow their training as a personal coach. The athlete starts it by
          giving the parent an invite code, so it stays their decision, and it can be ended at any time.
        </p>
        <p>
          The club feed is worth a specific mention for young athletes: a post shows a name, scores and
          a target to everyone in the club, including other athletes. Posting is always the athlete's own
          choice and can be taken back, but a parent or guardian may want to talk it through first.
        </p>

        <h2>Your choices</h2>
        <div className="card" style={{ marginBottom: 0 }}>
          <p style={{ marginTop: 0 }}>You can, at any time:</p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--text-secondary)' }}>
            <li style={{ marginBottom: 5 }}>Delete individual bouts, metal rounds, or whole workouts from History.</li>
            <li style={{ marginBottom: 5 }}>Delete every stored photo while keeping your scored results, from Settings.</li>
            <li style={{ marginBottom: 5 }}>Export everything you've logged as a JSON file, from Settings.</li>
            <li style={{ marginBottom: 5 }}>Invite a personal coach, cancel an unused invite, or remove a personal coach at any time, from Profile.</li>
            <li style={{ marginBottom: 5 }}>Remove anything you've posted to a club's feed, at any time, from the feed itself.</li>
            <li style={{ marginBottom: 5 }}>Leave just a program while staying in the club, or leave the club altogether, from Profile. Leaving a club stops any new sharing with its coaches and removes what you posted to its feed.</li>
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
