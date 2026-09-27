const UPDATED = 'September 27, 2026'

export function TermsView() {
  return (
    <div className="app">
      <main className="main" style={{ paddingBottom: 48 }}>
        <a href="/" className="link" style={{ display: 'inline-block', marginBottom: 16 }}>← 545 Coach</a>
        <h1>Terms and Conditions</h1>
        <p className="meta">Last updated {UPDATED}.</p>

        <p>
          These are the terms for using 545 Coach ("the app"). By signing in, you agree to them. They're
          kept short on purpose — this is a small, independently-run tool, not a large company's
          product, and the terms reflect that.
        </p>

        <h2>What the app does</h2>
        <p>
          545 Coach helps biathletes log and analyse precision and metal-target shooting, dry-fire
          practice, and race results, and lets coaches follow their athletes' training through clubs
          and programs. It's a training aid, not a certified scoring system — always trust an official
          scorer or a plug gauge over this app for anything that actually counts, like a sanctioned
          competition result.
        </p>

        <h2>Your account</h2>
        <div className="card" style={{ marginBottom: 0 }}>
          <p style={{ marginTop: 0 }}>
            You sign in with Google — there's no separate password for us to manage. You're
            responsible for whatever happens under your Google account, so keep it secure the way you
            normally would.
          </p>
          <p style={{ marginBottom: 0 }}>
            You can hold an athlete identity, a coach identity, or both. As a coach, you're responsible
            for getting real consent from an athlete (or their parent/guardian, if they're a minor)
            before adding them to your club — the app's join flow is built to make that consent
            explicit, but it can't verify who's actually agreeing on the other end.
          </p>
        </div>

        <h2>Your content</h2>
        <p>
          You own the photos, scores, and notes you log. By using the app you give us permission to
          store and display that content back to you and to any coach you've explicitly shared it
          with — nothing more. You're responsible for making sure you have the right to share anything
          you upload (a photo of your own target is fine; a photo of someone else's paperwork without
          asking probably isn't).
        </p>

        <h2>Contributing targets</h2>
        <p>
          You can choose to contribute the targets you score to help improve the app's hole detection.
          It's optional: you're asked once, nothing is contributed until you say yes, and you can turn it
          off at any time in Settings. If you turn it on, each target you score afterwards is sent
          automatically: a reduced copy of the photo and your confirmed hole positions, with no account
          or personal details attached (see the Privacy Policy for exactly what). By turning it on you
          confirm that the target photos you take are of your own targets and show no one else's
          information, and you give us a worldwide, permanent, royalty-free licence to use those
          anonymous submissions to develop, test and improve the app, including training detection
          models. This is separate from the permission in "Your content" above. Because a contribution
          can't be linked back to you, it can't be withdrawn once sent; turning the setting off stops
          further ones.
        </p>

        <h2>No warranty</h2>
        <div className="card" style={{ marginBottom: 0 }}>
          <p style={{ marginTop: 0, marginBottom: 0 }}>
            The app is provided "as is." Shot detection, scoring, and the coaching suggestions in
            Analysis are automated best-efforts, not guaranteed accurate — the app itself says as much
            wherever it gives you a read on your groups. We're not liable for training decisions made
            based on the app, lost data from a bug or an outage, or anything else arising from using a
            free tool built by one person rather than a funded product with an SLA.
          </p>
        </div>

        <h2>Acceptable use</h2>
        <p>
          Use the app for its actual purpose: logging and reviewing your own (or your athletes')
          shooting training. Don't try to break into other people's accounts or clubs, don't upload
          anything illegal or that you don't have the right to share, and don't use a coach identity to
          add someone to your roster without their real consent.
        </p>

        <h2>Changes</h2>
        <p>
          Both the app and these terms may change as it develops — this is an actively evolving,
          independently-run project, not a finished product. Material changes will be reflected here
          with an updated date at the top.
        </p>

        <h2>Contact</h2>
        <p style={{ marginBottom: 0 }}>
          Questions about these terms can be sent to <a href="mailto:will@sparkgeo.com">will@sparkgeo.com</a>.
        </p>
      </main>
    </div>
  )
}
