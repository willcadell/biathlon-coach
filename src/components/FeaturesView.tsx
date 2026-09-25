import { useState, type ReactNode } from 'react'
import { CowbellIcon, DryfireIcon, MegaphoneIcon, RaceMedalIcon, RangeIcon } from './icons'

type Who = 'athlete' | 'coach'

function Feature({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {icon && <div style={{ flex: 'none', color: 'var(--series-1)', paddingTop: 2 }}>{icon}</div>}
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: '0 0 4px' }}>{title}</h3>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{children}</div>
      </div>
    </div>
  )
}

const p = { style: { margin: '0 0 8px' } } as const

function AthleteFeatures() {
  return (
    <>
      <h2>Log your training</h2>
      <Feature icon={<span style={{ display: 'inline-flex', gap: 4 }}><RangeIcon size={22} /></span>} title="Range sessions">
        <p {...p}>
          One session holds as many precision and metal bouts as you shoot. Wind and the clicks you
          dial into the rifle are logged once for the whole session, not retyped for every bout.
        </p>
      </Feature>
      <Feature icon={<DryfireIcon size={22} />} title="Dry-fire">
        <p {...p}>Log the minutes you put in and a note on how it went. Nothing else to fill in.</p>
      </Feature>
      <Feature icon={<RaceMedalIcon size={22} />} title="Races">
        <p {...p}>
          Pick the format — sprint, individual, mass start or pursuit — and the app lays out the stages
          in order, prone and standing. Log the hits at each stage, and it feeds your race performance in Analysis.
        </p>
      </Feature>

      <h2>Shooting and scoring</h2>
      <Feature title="Score a target from a photo">
        <p {...p}>
          Photograph the target, pick prone or standing, and the app measures where every hole sits and
          scores the rings. Scoring uses the inward-gauge rule: a hole that touches a ring line takes
          that ring, so what counts is the edge of the hole nearest the centre.
        </p>
        <p {...p}>
          With your own Anthropic API key, Claude finds the holes for you and you confirm the reading
          before anything is scored. Without one, you tap the holes in yourself — everything else works
          the same. Shots too close to a ring line to call are flagged, not quietly rounded.
        </p>
        <p {...p}>
          It separates the shooting from the rifle: "39/50, your zero is costing 9 points" means the
          group was fine and the sight was not.
        </p>
      </Feature>
      <Feature title="Metal bouts and combos">
        <p {...p}>
          Five discs, prone or standing: tap each one that fell. Over time you see your hit rate by
          position and which target you miss most. A combo groups repeated ski-and-shoot rounds so they
          read together.
        </p>
      </Feature>
      <Feature title="Zero clicks, by tapping">
        <p {...p}>
          Log a sight adjustment by tapping the arrows: up, down, left, right, and clips to confirm. Tap
          the opposite arrow to take a click back — the entry records the net movement.
        </p>
      </Feature>

      <h2>See how you're doing</h2>
      <Feature title="Analysis">
        <p {...p}>Four sections you can open and close:</p>
        <p {...p}>
          <strong>Precision</strong> — score and group size, what your groups are saying (a vertical
          string, a zero that's off, a cold first shot after skiing in) and a two-week plan.{' '}
          <strong>Metal</strong> — hit rate by position and by target.{' '}
          <strong>Race performance</strong> — this season against last, split by format, prone and
          standing.{' '}
          <strong>Dry-fire</strong> — minutes this week, this month and in total.
        </p>
        <p {...p}>
          Trend charts step through weeks, months or years, with the previous period's trend drawn as a
          faint dotted line for context. The advice gets more confident the more you log — findings
          from one or two bouts are hints, and it says so.
        </p>
      </Feature>
      <Feature title="History">
        <p {...p}>
          Every workout, newest first, with each bout and its photo. Delete one workout or many, drop the
          photos and keep the scores, or export everything as JSON.
        </p>
      </Feature>

      <h2>Share and belong</h2>
      <Feature title="A trading card for every target">
        <p {...p}>
          Turn a target into a graded card — Elite, Sharp, Solid or Logged — with a QR code back to the
          app, and share it from your phone's share sheet.
        </p>
      </Feature>
      <Feature title="Join a club or a program">
        <p {...p}>
          Enter a club's or a program's code from your Profile. Before you join, the app tells you what
          you're agreeing to: your coaches will see your training. You're in one program at a time, and
          you can leave a program, or the club, whenever you like.
        </p>
      </Feature>
      <Feature title="Personal coaches">
        <p {...p}>
          Invite one person to follow you — a parent, or a coach outside your club. You make an invite code
          in your Profile and give it to them; they enter it in their own account. They can then see your
          sessions, analysis and posts, plus announcements from your club's coaches. They can't see the
          rest of your club's feed, or your target photos, and you can remove them at any time.
        </p>
      </Feature>
      <Feature icon={<CowbellIcon size={22} />} title="The club feed">
        <p {...p}>
          Under Start a session you'll find your club's feed: targets and workouts your clubmates chose to
          share, and announcements from your coaches. Ring a cowbell for anything you like — and see how
          many bells your own posts have earned.
        </p>
        <p {...p}>
          Nothing is posted unless you choose to. Sharing a target or workout is a deliberate step from
          the Share button, and your notes and target photos are never included.
        </p>
      </Feature>
    </>
  )
}

function CoachFeatures() {
  return (
    <>
      <h2>Run a club</h2>
      <Feature title="Clubs and programs">
        <p {...p}>
          Create a club with its own name and logo. Athletes join with a join code, and can be organised
          into programs — squads like "Juniors" or "Masters" — each with a code of its own. Add, move or
          take athletes out of a program, or delete a program: its athletes stay in the club.
        </p>
      </Feature>
      <Feature title="Coaches and admins">
        <p {...p}>
          Invite other coaches with a separate coach code. Every coach at a club can see who else coaches
          there; an admin can make another coach an admin, take that back, and remove coaches. A club
          always keeps at least one admin.
        </p>
      </Feature>
      <Feature title="Coach an athlete personally">
        <p {...p}>
          Not every athlete you follow is in your club. If an athlete — or a young athlete's parent —
          gives you an invite code from their Profile, enter it under <em>Coach your athletes</em> and you
          can see that athlete's sessions, analysis and posts, and leave notes on their workouts. You also
          see announcements from their club's coaches, but never the rest of their club's feed.
        </p>
      </Feature>
      <Feature title="You can still train">
        <p {...p}>
          Coaching and training are separate identities in one account, so you can log your own sessions
          too and switch between the two.
        </p>
      </Feature>

      <h2>See your athletes' training</h2>
      <Feature title="The roster, by program">
        <p {...p}>
          Your athletes are grouped by program, with anyone not yet placed under "No program yet" — tap
          the plus to add them to one. Open any athlete to see their analysis and full history, read-only.
        </p>
      </Feature>
      <Feature title="Notes on a workout">
        <p {...p}>
          Leave feedback on an athlete's workout. The athlete and the club's other coaches can read it.
        </p>
      </Feature>
      <Feature title="Only what athletes agreed to share">
        <p {...p}>
          An athlete's training is visible to you only after they join your club or program and accept the
          sharing notice. A coach assigned to a single program sees just that program; admins and
          whole-club coaches see everyone. If an athlete leaves, you stop seeing them.
        </p>
      </Feature>

      <h2>Talk to the club</h2>
      <Feature icon={<MegaphoneIcon size={22} />} title="Announcements">
        <p {...p}>
          Tap the megaphone beside a club's name to post a text announcement (up to 500 characters). It
          appears in the club feed with the coach mark and a light tint, and athletes can ring a cowbell
          for it. You can take one down at any time.
        </p>
      </Feature>
      <Feature icon={<CowbellIcon size={22} />} title="One combined feed">
        <p {...p}>
          Your Combo Feed brings together everything the athletes in all your clubs have chosen to share.
          Any coach can remove a post, and you can see how many bells your own announcements have earned.
        </p>
      </Feature>
    </>
  )
}

/**
 * What the app does, for the two people who use it. Public, like Privacy and
 * Terms — a prospective athlete or a parent should be able to read it before
 * signing in. `?for=coach` opens straight to the coach view, so the two halves
 * can be linked to separately.
 */
export function FeaturesView() {
  const [who, setWho] = useState<Who>(() => (new URLSearchParams(window.location.search).get('for') === 'coach' ? 'coach' : 'athlete'))

  return (
    <div className="app">
      <main className="main" style={{ paddingBottom: 48 }}>
        <a href="/" className="link" style={{ display: 'inline-block', marginBottom: 16 }}>← 545 Coach</a>
        <h1>What 545 Coach does</h1>
        <p className="lede">
          Precision and metal shooting analysis for biathletes, and the tools coaches need to see how a
          whole club is training.
        </p>

        <div className="seg" role="group" aria-label="Show features for" style={{ margin: '4px 0 4px' }}>
          <button aria-pressed={who === 'athlete'} onClick={() => setWho('athlete')}>For athletes</button>
          <button aria-pressed={who === 'coach'} onClick={() => setWho('coach')}>For coaches</button>
        </div>

        {who === 'athlete' ? <AthleteFeatures /> : <CoachFeatures />}

        <h2>Good to know</h2>
        <div className="card">
          <p style={{ margin: '0 0 8px' }}>
            Scoring comes from a photograph, which resolves to about a millimetre, so shots within a
            millimetre of a ring line are flagged for you to gauge on the paper. The advice is a hint, not
            a verdict — it names the question to ask a coach.
          </p>
          <p style={{ margin: 0 }}>
            Saving needs a connection. See the <a href="/privacy" className="link">Privacy Policy</a> for
            what's stored and who can see it.
          </p>
        </div>

        <p className="meta" style={{ marginTop: 20, textAlign: 'center' }}>
          <a href="/" className="link">Sign in</a>
          {' · '}
          <a href="/privacy" className="link" style={{ color: 'inherit' }}>Privacy Policy</a>
          {' · '}
          <a href="/terms" className="link" style={{ color: 'inherit' }}>Terms and Conditions</a>
        </p>
      </main>
    </div>
  )
}
