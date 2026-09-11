# Biathlon Coach

Photograph a precision target, get it scored, and get told what to train.

The app runs in a phone browser. It finds the bullet holes in the photo, converts
them to millimetres on the face, scores the rings, and builds a training plan from
what your groups look like over time. Everything stays on your device.

## What it does

**Runs a workout.** A workout is the unit of a training session: wind and its
direction are entered once at the start, not retyped per bout, and any clicks you
actually dial into the rifle during the zero process get logged there too. Inside
one workout you add as many precision bouts and metal bouts as you shoot, in any
order.

**Scores a precision bout.** Ten shots, always — that's the discipline. You
photograph the target and pick prone or standing. With an API key set, Claude
finds the black aiming areas and the holes, then hands you the reading to
confirm: the screen says how many shots it found, every marker is draggable, and
the button reads *Confirm and score*. Nothing is scored until you say so. Without
a key the same screen starts empty and you tap the shots in — pinch or use the
zoom buttons to see small or overlapping holes clearly while you do.

Detection runs in two passes. The first finds roughly where each aiming mark sits,
on a small overview of the whole photo. The second crops the original,
full-resolution photo tightly around each one — out to its outermost scoring ring,
not just the black, so a shot that landed on the white paper is not cropped away —
and reads holes from those close-up views. Each hole ends up with far more real
pixels behind it than a whole-sheet photo could ever give it at the same API
image-size limit. Where holes overlap, the model is told to place the ones it can
separate first, working from the edge of the group inward, then account for any
remaining shots as a merged shape near the group's own centre — since a tight
group overlaps on itself, not at its edges.

**Logs a metal bout.** The biathlon range itself: five falling discs, prone or
standing. There's no photo, just how many stayed up — a metal bout has no shot
positions to read shape from, so it can't feed the coaching findings a precision
bout can. What it tracks instead is hit rate over time, split by position, which
is the number a race actually turns on.

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

**Keeps a history.** Photos and results go into the browser's own database,
grouped by workout. Two charts: points per shot over time, and group size as a
percentage of the biathlon hit zone. Score says how you did; group size says
whether the shooting or the sight was responsible, because a group can tighten
while the score stays flat.

**Recommends training.** The app reads the shape of your precision-bout groups
across the last 60 days and names what it finds: a vertical string, a walk across
the bout, a group centre that moves between bouts, a first shot that misses after
skiing in. Each finding carries the evidence it rests on and a confidence figure
that climbs as you log more bouts. It then ranks drills against those findings.
Metal bouts get their own, simpler number alongside this: hit rate by position,
since there's no group shape to read a cause from.

## Run it

```bash
npm install
npm run dev
```

Open the address it prints. On a phone, use the network address on the same
wi-fi. Camera capture needs `https` or `localhost`, so for real use at a range,
build it and host the `dist/` directory somewhere with a certificate:

```bash
npm run build
```

## Set it up

Three settings decide whether the numbers are right.

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
page — there is no server in between, because there is no server.

**Test this key** in Settings says exactly what is wrong when a key does not
work. It checks the shape of the key first (a paste that wrapped or got cut off
is the usual cause, and costs nothing to catch), then makes a free request to
prove it authenticates, then a one-token message to prove the account can run the
chosen model. A rejected key, an Admin key, an empty credit balance and a blocked
connection each get their own answer. API credit is separate from any Claude
subscription — a Pro or Max plan buys you none.

## Delete things

History has a **Select** button. Tick any number of bouts and delete them with
their photos in one go. A single bout can also be deleted from its own page.

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

Metrics are derived at render time, never trusted from disk. Shot positions are
the only real measurement, and everything else follows from them.

## Test it

```bash
npm test
npm run typecheck
```

`npm test` checks the target-plane maths, the metrics, and the diagnostic rules
against known inputs.

To look at the History and Training screens without shooting anything, paste
[`scripts/demo-data.js`](scripts/demo-data.js) into the browser console with the
app open, then reload. Clear it again from your browser's site data.

## Layout

| Path | What is in it |
|---|---|
| `src/lib/geometry.ts` | Perspective correction, millimetre conversion, group metrics |
| `src/lib/scoring.ts` | Ring radii and the inward-gauge rule |
| `src/lib/diagnostics.ts` | Rules that turn metrics into findings |
| `src/lib/training.ts` | Drill library and the recommender |
| `src/lib/vision.ts` | The Claude call that reads the photo |
| `src/lib/db.ts` | IndexedDB storage and JSON export |
| `src/components/MarkupView.tsx` | The correction step |

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

Browser storage is not a backup. Clearing site data deletes every photo and every
bout. Export to JSON from Settings if the history matters to you.
