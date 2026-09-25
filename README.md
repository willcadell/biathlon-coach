# 545 Coach

Precision and metal shooting analysis for biathletes, and the tools coaches need
to see how a whole club is training.

An athlete photographs a target and gets it scored, logs metal, dry-fire and race
sessions, and is told what to train. A coach runs a club: programs, a roster,
notes on workouts, announcements, and a feed of what athletes choose to share.
It's a phone-friendly web app (a PWA) with Google sign-in, backed by Supabase.

A plain-language version of the feature list, for athletes and for coaches, lives
in the app itself at `/features`.

## What it does

### For athletes

**Logs any kind of session.** Three start buttons — **Range**, **Dryfire**,
**Race** — each with its own icon and colour.

- A **range session** holds as many precision and metal bouts as you shoot. Wind
  and the clicks you dial into the rifle are logged once for the session, not
  retyped for every bout.
- A **dry-fire session** is minutes and a note.
- A **race** starts from a format — sprint, individual, mass start or pursuit — and
  lays out that format's stages in order, prone and standing, ready for hits.

Finishing a session ends on a short completion screen with the session's best
score, and a way to share it.

**Scores a precision bout.** You photograph the target and pick prone or
standing. With an API key set, Claude finds the bullet holes and hands you the
reading to confirm: the screen says how many shots it found, every marker is
draggable, and the button reads *Confirm and score*. Nothing is scored until you
say so. Without a key the same screen starts empty and you tap the shots in —
pinch or use the zoom buttons to see small or overlapping holes while you do.

Detection runs in two passes. The first finds where each aiming mark sits, using
classical image processing on the photo itself (`blackLocator.ts`: threshold, find
the largest solid dark region, fit an ellipse) — the same answer every time, no
API call. The second crops the original, full-resolution photo tightly around each
mark, out to its outermost scoring ring, not just the black, so a shot that landed
on the white paper is not cropped away, and asks Claude to read the holes from
those close-up views. Each hole ends up with far more real pixels behind it than a
whole-sheet photo could give it at the same image-size limit. Where holes overlap,
the model is told to place the ones it can separate first, working from the edge
of the group inward, then account for any remaining shots as a merged shape near
the group's own centre — since a tight group overlaps on itself, not at its edges.

The green ring is the origin every shot is measured from. Drag it onto the black,
by its centre or its edge handle, and the scores move with it. The holes stay
where they are on the photograph, because they are already right — it is the ring
that needs correcting.

Scoring uses the inward-gauge rule: a hole that touches or breaks a ring line
takes that ring's value, so what matters is the edge of the hole nearest the
centre, not its middle. A .22 hole is 5.6 mm across, which on a 50 m face is most
of the way from the ten ring to the nine. Ignoring it would cost real points.

It separates two things a scorecard hides. `39/50` with the note *your zero is
costing 9 points* means the shooting was fine and the rifle was not. The same
group centred on the ten would have scored 48.

Shots within a millimetre of a ring line are flagged rather than quietly rounded,
because that is about all this method can resolve from a photograph. Gauge those
on the paper.

**Logs a metal bout.** The biathlon range itself: five falling discs, prone or
standing, recorded per target — which ones fell — not just a count, so a pattern
in *which* target keeps getting missed can be found later. Repeated ski-and-shoot
rounds can be grouped as a combo. A metal bout has no shot positions to read
shape from, so it can't feed the coaching findings a precision bout can; what it
tracks instead is hit rate over time, split by position.

**Logs the zero.** Sight adjustments are counted by tapping arrows — up, down,
left, right, and clips to confirm. Tapping the opposite arrow takes a click back,
so the logged entry is the net movement.

**Analyses it.** The Analysis tab has four sections, each collapsible:

- **Precision** — score and group size, what your groups are saying, and a
  two-week plan. Trend charts step through weeks, months or years and draw the
  previous period's trend as a faint dotted line for context.
- **Metal** — hit rate by position and by target, for training, races or both.
- **Race performance** — this season against last (a season runs November to May),
  split by format, prone and standing.
- **Dry-fire** — minutes this week, this month, and in total.

**Recommends training.** The app reads the shape of your precision-bout groups
across the last 60 days and names what it finds: a vertical string, a walk across
the bout, a group centre that moves between bouts, a first shot that misses after
skiing in. Each finding carries the evidence it rests on and a confidence figure
that climbs as you log more bouts. It then ranks drills against those findings.

**Keeps a history.** Every workout, newest first, with each bout and its photo.
Delete one workout or many at once, drop just the photos and keep the scores, or
export everything as JSON.

**Shares.** The Share button on a target offers *Share as image* — a graded
trading card (Elite, Sharp, Solid or Logged) with a QR code back to the app, drawn
in the browser and sent through the phone's share sheet or downloaded — or *Post
to* a club's feed.

**Belongs to a club.** Enter a club's or a program's join code in Profile. Before
joining, a notice says what you're agreeing to — the club's coaches will see your
training — and asks for consent, which matters where athletes are minors. An
athlete is in one program at a time and can leave a program, or the club, whenever
they like.

**Invites a personal coach.** One individual — a parent, or a coach outside the
club — can follow an athlete regardless of any club. It always starts with the
athlete: in Profile they make a single-use invite code (valid for seven days) and
hand it over; the coach accepts it from their own account. A personal coach sees
the athlete's sessions, analysis and posts, plus announcements made by the
coaches of the athlete's clubs, but not the rest of those clubs' feeds, and never
the athlete's target photos. Either side can end it at any time.

**Reads and posts to the club feed.** Under *Start a session* is the club's feed:
targets and workouts clubmates chose to share, marked with the same icon and colour
as the session type, and announcements from coaches. Ring a **cowbell** for
anything; each post shows its count, and your own total of bells earned appears
above the feed. Nothing is posted automatically — sharing is a deliberate step,
and notes and target photos are never included.

### For coaches

**Runs clubs and programs.** Create a club with a name and logo. Athletes join with
a join code; **programs** are squads within a club ("Juniors", "Masters"), each with
its own code. From the roster you can add an unassigned athlete to a program, take
one out, or delete a program — its athletes stay in the club.

**Manages coaches.** A separate coach invite code brings in other coaches. Every
coach at a club can see who else coaches there. An **admin** can make another
coach an admin, take that back, and remove coaches; a club always keeps at least
one admin. Coach and athlete are separate identities on one account, so a coach can
log their own training and switch between the two.

**Sees the roster.** Athletes are grouped by program, with anyone not yet placed
under *No program yet*. Open an athlete to see their analysis and history,
read-only, and leave **notes on their workouts** that the athlete and the club's
other coaches can read.

**Talks to the club.** The megaphone beside a club's name posts a text
**announcement** (up to 500 characters) to that club's feed. The **Combo Feed** on
the coach home gathers what athletes in every club you coach have shared, plus
announcements. Any coach can remove a post, and a total of bells earned on your own
announcements sits above the feed.

**Coaches athletes personally.** Enter an athlete's invite code under *Coach your
athletes* to follow them outside any club: open them for the same read-only view
of their analysis and history, leave notes on their workouts, and see their posts
and their club's announcements in your feed.

**Sees only what athletes agreed to share.** An athlete's training is visible to a
coach only once they've joined the coach's club or program and accepted the notice.
A coach assigned to one program sees just that program; admins and whole-club
coaches see everyone. If an athlete leaves, the coach stops seeing them.

## How it's built

| Piece | What |
|---|---|
| App | React 18 + TypeScript, built with Vite; installable as a PWA (`public/sw.js` caches the app shell) |
| Accounts | Google sign-in through Supabase Auth |
| Data | Supabase Postgres — workouts, precision and metal bouts, click log, clubs, programs, memberships, coach assignments, coach notes, feed posts and cowbells |
| Photos | Supabase Storage — a full image and a thumbnail per bout |
| Access control | Postgres row-level security, plus `security definer` functions for anything a policy can't express safely |
| Reading photos | The Anthropic API, called straight from the browser with the athlete's own key |
| Share cards | Drawn on a `<canvas>` in the browser; QR codes from the `qrcode` package |
| Hosting | Netlify (`netlify.toml`, with an SPA fallback in `public/_redirects`) |

The data model in one paragraph: an **athlete** and a **coach** are two identities
under one auth account. An athlete has **memberships** in clubs (one per club,
carrying the athlete's program or none); a coach has **assignments** to a club or a
single program, and an admin flag. A **personal coach** link ties a coach to one athlete outside any club. Who can
see whose training is decided entirely by those rows, in one function
(`is_coach_of`), reused by every table's policy.

Rules that matter are enforced in the database, not the client, and each is tested
against the live schema as an admin, a non-admin coach, an athlete and an outsider,
inside transactions that roll back. Feed posts are built **server-side** as
snapshots by `post_to_feed`, so what a post can contain is decided in one place: the
ring diagram data, score, position and date for a target; the name, date, type and
headline numbers for a workout — never notes, coach notes, the zero log, heart rate
or photos.

## Run it

You need a Supabase project. Copy `.env.example` to `.env.local` and fill in your
project's URL and anon key:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

```bash
npm install
npm run dev
```

Open the address it prints. On a phone, use the network address on the same wi-fi.
Camera capture needs `https` or `localhost`, so for real use at a range, build it
and host `dist/` somewhere with a certificate:

```bash
npm run build
```

**Database.** The schema lives in `supabase/migrations/`, one file per change, in
order. With the Supabase CLI linked to your project:

```bash
npx supabase db push
```

**Sign-in.** Enable the Google provider in Supabase (Authentication → Providers),
and under Authentication → URL Configuration set the Site URL to your app's address
and add it — and `http://localhost:5180/**` for local work — to the **Redirect
URLs**. If that list is missing your address, sign-in appears to succeed and then
lands on a blank screen.

**Hosting.** On Netlify the build command and publish directory come from
`netlify.toml`. `public/_redirects` sends every path to `index.html`, which is what
lets `/privacy`, `/terms` and `/features` load directly.

## Set it up

Three settings decide whether the numbers are right. They're stored in the browser
on each device, not in your account.

**Target face.** ISSF 50 m rifle or ISSF 10 m air rifle. The face sets the
scoring rings and, through its black diameter, the ruler for everything else —
the app has no other way to know how big the target is. Edit the black diameter
only if you shoot the face printed at a reduced size for short range; the app
then scales every distance to match and says so.

**Bullet diameter.** 5.6 mm for .22 Long Rifle, 4.5 mm for air. This is what
decides how much of a ring line a hole can break.

**Sight click value.** How far the impact moves at 50 m for one click. The
default of 2.5 mm is a guess, because biathlon diopter sights differ. Settings
has the drill for measuring your own: shoot a group, wind 10 clicks, shoot
another, divide the gap by 10.

An Anthropic API key is optional. Without one, you tap the holes in yourself and
every other feature works unchanged. With one, each photo costs a few cents to
read. The key is stored in this browser and sent straight to Anthropic from the
page — it never goes to this app's own database.

**Test this key** in Settings says exactly what is wrong when a key does not
work. It checks the shape of the key first (a paste that wrapped or got cut off
is the usual cause, and costs nothing to catch), then makes a free request to
prove it authenticates, then a one-token message to prove the account can run the
chosen model. A rejected key, an Admin key, an empty credit balance and a blocked
connection each get their own answer. API credit is separate from any Claude
subscription — a Pro or Max plan buys you none.

## Delete things

History has a **Select** button. Tick any number of workouts and delete them with
their bouts and photos in one go. A single workout or bout can also be deleted from
its own page.

Settings has **Delete all photos, keep the scores**. Photos are nearly all of the
space this app uses, and once a bout is scored the shot positions are the record,
so dropping the pictures costs you nothing but the evidence.

## Photograph the target well

- Square-on. The app corrects for angle by measuring how squashed the aiming
  mark looks, but a steep angle still loses accuracy.
- Fill the frame with the target.
- Even light. Glare across the black is the most common failure.
- Patch old holes before you shoot again, or the app counts them.
- One sheet of several faces is fine. Each hole is measured against its own
  black, and the faces are overlaid into a single group.

## How the maths works

**One unit system.** Every normalised coordinate is a fraction of the image
*width*, on both axes. The obvious alternative — x over width, y over height —
makes a vertical millimetre a different size from a horizontal one on any photo
that is not square, which stretches every group by the aspect ratio and invents
vertical stringing out of a round one. On a 4:3 photo that is a 33% error. There
is a test for it.

A circle photographed off-axis lands on the sensor as an ellipse. The ratio of
its axes says how much the image was squashed and in which direction, so
stretching the short axis back out restores the target plane. The aiming mark's
known diameter then converts pixels to millimetres.
See [`src/lib/geometry.ts`](src/lib/geometry.ts).

Multi-face sheets are overlaid. Five faces with one shot each become one
five-shot group, because each hole is measured against its own black. That is how
a coach reads a practice card.

Ring radii are built from the ten ring outwards, one ring spacing at a time. A
shot's ring is the highest-value line its hole edge touches or crosses, where the
edge sits at `distance from centre − bullet radius`. Nudging the shot by the
measurement tolerance decides whether it is reported as borderline.
See [`src/lib/scoring.ts`](src/lib/scoring.ts).

The face and bullet diameter are stored on each bout, not read from settings at
display time. Shot coordinates were measured against the black that was on the
paper that day, so changing the face later must not rescore old cards against a
target they were never fired at. The click value is the exception: it belongs to
the rifle, so calibrating it corrects the advice on every past bout.

Group shape comes from the covariance of the shot positions. The long and short
axes of that cloud separate a timing fault (tall and narrow) from an unstable
hold (round and wide).

Two thresholds in the diagnostics were set by simulation rather than taste, in
[`src/lib/diagnostics.ts`](src/lib/diagnostics.ts). Calling a shot a flier at
2.5× the mean radius of the others flagged 54% of ordinary five-shot groups. At
4× it flags 9% and still catches 58% of genuinely thrown shots. The drift rule
went the same way.

For an athlete's own bouts, metrics are derived at render time, never trusted
from disk: shot positions are the only real measurement, and everything else
follows from them and from your settings. A coach reading an athlete's bouts, and
a post in the club feed, use the metrics as they were when the bout was scored —
a scored bout is not recalculated for someone else.

## Test it

```bash
npm test
npm run typecheck
```

`npm test` checks the target-plane maths, the metrics, the diagnostic rules, the
metal statistics and the hole locator against known inputs.

## Layout

| Path | What is in it |
|---|---|
| `src/App.tsx` | Sign-in, role choice, the tab shell, and the public pages' routing |
| `src/components/WorkoutView.tsx` | Starting, running and finishing a session; the completion screen |
| `src/components/CaptureView.tsx`, `MarkupView.tsx` | Photographing a target and the correction step |
| `src/components/AnalysisView.tsx`, `TrendChart.tsx` | The four Analysis sections and the trend charts |
| `src/components/HistoryView.tsx` | Workout history, deleting, sharing |
| `src/components/CoachView.tsx` | Coach home, club pages, roster, programs, coaches and admins |
| `src/components/FeedView.tsx`, `ShareSheet.tsx`, `AnnounceSheet.tsx` | The club feed, sharing to it, and announcements |
| `src/components/ProfileView.tsx` | Identity, joining and leaving clubs and programs |
| `src/components/FeaturesView.tsx`, `PrivacyPolicyView.tsx`, `TermsView.tsx` | The public pages |
| `src/lib/geometry.ts` | Perspective correction, millimetre conversion, group metrics |
| `src/lib/scoring.ts` | Ring radii and the inward-gauge rule |
| `src/lib/diagnostics.ts`, `training.ts` | Rules that turn metrics into findings, and the drill recommender |
| `src/lib/vision.ts`, `blackLocator.ts`, `holeLocator.ts`, `imaging.ts` | Finding the aiming mark and holes; the Claude call |
| `src/lib/metal.ts` | Metal-bout statistics |
| `src/lib/db.ts` | Workouts, bouts and photos in Supabase; JSON export |
| `src/lib/coaching.ts` | Clubs, programs, roster and coaches |
| `src/lib/feed.ts`, `share.ts` | Feed posts, cowbells and announcements; the trading-card image |
| `supabase/migrations/` | The schema, its row-level security and its functions |

## Limits

The app sees one photograph. It cannot see your position, your breathing, your
heart rate between shots, or your skis. It will tell you which question to ask a
coach; it will not replace one.

**No decimal scoring.** The measurement chain resolves to roughly a millimetre.
On a 50 m face one decimal is 0.8 mm and on an air face 0.25 mm, so decimals
would be noise dressed as precision. Integer rings are what a photograph can
honestly support, and shots too close to a line to call are marked.

The sight-click default is a guess until you measure yours. Every correction the
app gives you is wrong by the same factor until you do.

Findings from one or two bouts are hints. The confidence figure says so.

**Saving needs a connection.** Sessions, bouts and posts are written straight to
Supabase; there is no offline queue yet, so logging at a range with no signal will
not save. The app shell opens offline, but the data does not.

Settings, including your API key, live in the browser on each device and do not
follow you to another. Export to JSON from Settings if the history matters to you.
