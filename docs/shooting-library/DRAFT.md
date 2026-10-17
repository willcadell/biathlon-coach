# Shooting advice library: draft for review

Status: draft, written 2026-10-17. Nothing here is in the app yet. It is for you to cut,
correct and approve before any code is written.

Sources are the IBU Exercise Catalogue (2018) and the *Journal of Biathlon Coaching*,
Issues 1 to 6. The reading notes behind every entry are in `docs/ibu-journal/notes/`.
Summaries are in our own words and cite their source. Evidence is graded
**R** (research with data), **C** (catalogue exercise), **P** (practitioner or coach
opinion).

## 1. How the library would work

**Who sees it:** athletes and coaches. A coach viewing an athlete sees what the athlete
sees, plus a coach-only note where an entry has one.

**Season phase, from the date.** No setting. The app already runs a November to May
season, so the phase follows the month (northern hemisphere):

| Phase | Months | What shooting work is about |
|---|---|---|
| Transition | April, May | Recover, low-stakes technique, rifle service |
| General preparation | June to August | Foundations at rest and low intensity: balance, stability, trigger, breathing |
| Specific preparation | September, October | Shooting under load, range approach, camps and altitude, rifle settings |
| Early season | November, December | First races: routines, first shot, from experimenting to repeating |
| Competition | January to March | Repeat routines, taper, race tactics, last-standing-stage focus |

Today (17 October) is Specific preparation. Each entry lists the phases it suits.

**Pattern-triggered, not just seasonal.** An entry can be *surfaced* when the athlete's own
data shows a matching pattern (section 4 and 5). The Shooting advice section would show
two things: advice from the athlete's patterns (as now) with the library entry attached
to each finding ("Why this matters, and what to try"), and a short "This time of year"
list of 2 to 4 entries for the current phase. Seasonal entries that the athlete's data
already points to are shown once, under the pattern.

**One entry, one shape.** Fields: id, title, phases, focus, applies to (precision, metal,
both), position (prone, standing, both), level (novice, club, elite), surfaced-by
(pattern ids), summary, what to do (cue or steps), safety, coach note, source, evidence.

## 2. Drills already in the app (not repeated below)

zero-check, click-calibration, breathing-pause, npa-check, ball-and-dummy,
plateau-trigger, trigger-variations, follow-through, hold-build, balance-ladder,
unstable-support, resistance-pull, incline-shooting, position-build, range-entry,
combo-intervals, standing-volume, shot-plan, progression.

Entries below that extend one of these say so.

## 3. Draft entries

### Breathing and stability

**L01 Same breath, every shot (prone).** Phases: general, specific, early, competition.
Focus: breathing. Position: prone. Surfaced by: vertical stringing prone, unstable
prone groups, prone metal misses. The steadier the breathing pattern from shot to shot,
the higher the hit rate. Elites mostly released on the exhale (about three in four);
juniors mostly mid-breath. Choose the point in the cycle that works for you, then repeat
it exactly, shot after shot. Do: dry or live, five shots at one chosen point in the
breath, then check that the pause before each shot looks the same. Extends
`breathing-pause`. Source: Krüger, Harbour & Finkenzeller, Issue 5. Evidence: R (20
athletes, roller-ski, observational; the stability-accuracy link prone is strong).

**L02 Don't fire on the inhale (standing).** Phases: general, specific, early,
competition. Focus: breathing. Position: standing. Surfaced by: standing gap (precision
or metal), loose standing groups. Shots released at the top of an inhale were rare but
costly: roughly 13% lower accuracy overall and 23% lower among juniors. Inhaling
raises tension; breathing out settles the motor system. Do: in dry work, release only on
or after the exhale; if you notice you are on an inhale, come off and restart. Source:
Issue 5 as above. Evidence: R.

**L03 Change the breathing, not the technique.** Phases: specific, early, competition.
Focus: breathing, arrival. Position: both. Surfaced by: first-shot misses after skiing;
metal hit rate falling at higher heart rates. Position, rifle, aim, trigger control and
follow-through should be the same at every intensity; what adapts is the timing and
depth of the breathing, with the last part of the breath before the shot kept the same.
Do: at a higher heart rate take deeper or extra breaths before the pause, then run the
identical final sequence into the shot. Extends `breathing-pause` and `combo-intervals`.
Source: Köykkä, Sattlecker & Laaksonen, Issue 6 (coach interviews: Mazet, Hagström).
Evidence: P (five international coaches).

**L04 Breathing is a skill to train from early on.** Phases: general. Focus: breathing.
Level: all, especially juniors. Treat breathing as part of technical sessions, measure
or at least watch it, and start young athletes early. Coach note: wearable sensors were
used in the study; observation of a clear pause in the breathing curve is a start.
Source: Issue 5. Evidence: R (study) plus recommendation.

**L05 Core stability for standing.** Phases: general, specific. Focus: stability.
Position: standing. Surfaced by: standing gap, wide standing groups, rifle movement.
Athletes whose torso is less steady under disturbance showed more body and rifle
movement in the last half-second before the shot, and more so at a raised heart rate.
Build it: planks and variants in strength sessions, and dry-fire holds that take the
legs out of the picture (seated on an unstable surface, pulls across and along the line
of fire). Dry only. Coach note: can be tracked with an aim-trace device or a simple
balance test (Y-balance). Source: Becker & Cobb, Issue 1; IBU Exercise Catalogue. Evidence:
R (30 athletes, early research) and C.

**L06 Standing balance work (catalogue).** Phases: general. Focus: stability. Position:
standing. Surfaced by: standing gap, wide standing groups. Exercises: lateral offset
(front heel at the toes of the back foot, both ways), heel and toe variations, heels
on a low beam or pool noodle, unstable sole. Vary surface and distance; do it dry; hold
until it is steady for 30 to 45 seconds before making it harder. Extends
`balance-ladder`. Source: IBU Exercise Catalogue pp. 12-17. Evidence: C.

**L07 Rifle stability under load (catalogue).** Phases: general, specific. Focus:
stability. Position: both. Surfaced by: wide groups, vertical or sideways stringing.
Hold the aim on target while something disturbs the rifle: a band pulling from the
front or above, a weight on the barrel, shooting prone without the sling. Change the
pull once it is steady. Dry only, never with a band on the rifle and live ammunition.
Extends `resistance-pull` and `unstable-support`. Source: IBU Exercise Catalogue pp.
54-64. Evidence: C.

### Aiming (standing)

**L08 Know your aiming approach: hold or timing.** Phases: general, specific. Focus:
aiming. Position: standing. Surfaced by: loose or inconsistent standing groups or
standing metal misses. Two approaches both work. A holder settles the aim in the hit
area and triggers just after it stabilises. A timer comes in straight and triggers while
the aim is still moving to the centre, without fully settling. Neither was found better.
What matters is that the athlete knows which they use and practises that one, in light
and hard sessions alike, because switching to the other mid-race rarely works. Source:
Köykkä, Issue 2 (framework from Köykkä et al. 2021). Evidence: R (one framework study) and
coaching experience.

**L09 If you hold: settle, trigger, or come off.** Phases: general, specific. Focus:
aiming, timing. Position: standing. Surfaced by: long holds, late misses. Holding longer
and longer tends to make it worse, especially holding the breath under effort. Learn to
trigger just after the aim settles; if the picture is poor, come off, breathe, and
re-approach. Do: static-hold work with variations, and practise stopping the aim-point
movement. Source: Issue 2. Evidence: P/R.

**L10 If you time it: controlled approach.** Phases: general, specific. Focus: aiming,
timing. Position: standing. Surfaced by: first-shot misses, uncontrolled starts. Come
in straight, slow the aim as it nears the centre, and trigger when it is inside but
still moving. Do not "throw" the aim in and pull; do not start far from the target
(that leads to long breath holds). Practise: follow a line with the aim, speed up and
slow down the aim point, and practise timing with the rifle supported. Source: Issue 2.
Evidence: P/R.

### Trigger

**L11 Trigger plateau.** Already a drill (`plateau-trigger`). Library entry adds why: a
plateau at about 80 to 90% takes out the extra force and movement before the break.
Source: IBU Exercise Catalogue pp. 65-66. Evidence: C. Phases: general, specific.

**L12 Trigger variations and eyes-closed feel.** Already a drill (`trigger-variations`).
Library entry adds the eyes-closed version and "end every trigger session with a few
normal triggers". Source: IBU Exercise Catalogue pp. 67-68. Evidence: C.

### Attention and composure

**L13 Narrow external focus.** Phases: general, specific, early, competition. Focus:
attention. Position: both. Surfaced by: fliers, early misses, "composure" patterns in
metal. Look at the target, not at your own movements. Find the first target before the
rifle comes to the eye; find it again straight away through the sight; blink during
bolting, not during the aim; keep peak focus on the target through the trigger and
keep your eye on it through follow-through until the paddle falls. Use a cue word on the
bolt ("go", "now", "black") to start the focus. Works live or dry. Source: Heinrich,
Ahrens & Finkenzeller, Issue 3. Evidence: R (mixed research base) and practice.

**L14 Re-focus: breath, then back on the target.** Phases: all but transition. Focus:
attention. Surfaced by: miss streaks, fliers. After a blink, a lapse, an eye wobble or
several misses: hold longer or reset. A deliberate breath brings attention back. On
days when focus comes easily you may shoot a little faster; on days it does not, take a
little longer. Source: Issue 3. Evidence: P/R.

**L15 Practise acceptance.** Phases: specific, early, competition. Focus: composure.
Surfaced by: miss streaks, a big drop after one miss. Rehearse setbacks on purpose (a
miss, a wind shift, an early mistake) so an athlete can acknowledge it, let go and
re-engage fully for the next bout. Remind athletes of similar situations they handled
before; one miss is allowed. Coach note: say little; the aim is to give security with
short clear instructions. Source: Chabloz (Issue 6); Mazet (Issue 1). Evidence: P.

**L16 Mental pre-start routine and imagery.** Phases: specific, early, competition.
Focus: composure. A written plan for focus (wide or narrow), arousal and tools (self-talk,
breathing, music, imagery) from warm-up to the start line. Imagery: rehearse the first
shooting bout from the last 50 metres onto the mat and off it, in first person, in real
time, using all the senses. Practise it in test events, review it, adapt it. Source:
Heinrich, Issue 1. Evidence: P (applied psychology).

### Range approach and efficiency

**L17 The range approach is a skill.** Phases: specific, early, competition. Focus:
arrival. Position: both. Surfaced by: first-shot misses after skiing, metal hit rate
falling at higher heart rates. Arrive with your breathing feeling normal and under
control. Ease the speed over the last 200 to 300 metres; skiing in too hard raised rifle
movement, lengthened aiming time and slowed heart-rate recovery. Make a short mental
shift to the present and read the conditions. Extends `range-entry`. Source: Issue 6
(Amat, Torneus-Kulstad). Evidence: P.

**L18 Find your own entry speed.** Phases: specific, early, competition. Focus: arrival.
Some athletes shoot best entering fast, others with a controlled entry. Identify which,
and hold your own plan when racing head to head instead of reacting to the other
athlete. Coach note: the data to see it is shot results against heart rate on entry.
Source: Chabloz, Issue 6. Evidence: P.

**L19 Practise entry and exit until each step is controlled.** Phases: specific, early.
Rifle adjusted to you and the range, zero in calm and windless conditions, then
repeated range entry and exit procedures until every step is under control. Target the
team Mazet coached: first prone shot within about 15 seconds of arriving and the first
standing shot within about 12. Sources: Issue 6 (Hagström); Issue 1 (Mazet). Evidence: P.

**L20 Shooting efficiency, not only accuracy.** Phases: specific, early, competition.
Focus: efficiency. Range time is now a decisive factor; the best combine accuracy with
short range times. Build speed into the shot process from an early age, alongside
stability and accuracy, so it holds under race stress rather than being added later.
Coach note: do not rush an unstable shot; efficiency comes after steadiness (see L22).
Source: Chabloz, Issue 6; Laaksonen, Issue 5. Evidence: P/R.

### Season structure

**L21 Foundations first, at rest.** Phases: general. Focus: technique. Technical shooting
at rest comes first, with a high number of precision shots, then physical load is added
step by step. Senior biathletes fire about 12,000 to 22,000 shots a year, 60 to 70% of
them combined with endurance training; precision shot numbers stay similar from junior
to senior, so quiet technical shooting never stops being important. Source: Kock, Issue 4.
Evidence: R (18 former elite athletes, retrospective).

**L22 Build load only when it is steady.** Phases: general to specific. Focus: progression.
Move from rest to low-intensity to race-intensity shooting in steps. If a drill cannot be
held steady for 30 to 45 seconds after a few tries, it is too hard today; make it easier.
After six to eight weeks of real progress, make it harder. Extends `progression`. Sources:
IBU Exercise Catalogue pp. 9-11; Kähkönen's line in Issue 6 ("easy and long, intense and
short, recovery as well"). Evidence: C/P.

**L23 Shooting under load.** Phases: specific. Focus: load. Once the basics are stable,
add combo training with shooting a little beyond race intensity, and find ways to
challenge the athlete that still combine skiing and shooting at a high level. Extends
`combo-intervals`. Sources: Flunger, Issue 2; Köykkä et al., Issue 6. Evidence: P.

**L24 From experimenting to repeating.** Phases: early, competition. Focus: routine. As
racing nears, the emphasis moves from trying things to repeating established routines
and building confidence under race conditions. Source: Issue 6 coach interviews.
Evidence: P.

**L25 Taper and race week.** Phases: competition. Focus: routine. A taper cuts volume
(about 41 to 60%) but keeps intensity and keeps frequency within about 20% of normal, so
technique and movement stay sharp: keep shooting in the taper, do not stop. The day
before a race is the key day: hold a short strategy meeting, test the track and the
range entry at race speed, and check what heart rate still allows good shooting. Sources:
Mujika, Issue 3; Mazet, Issue 1. Evidence: R (taper) and P (shooting day).

**L26 Race day: say little, trust the routine.** Phases: early, competition. Coach-facing.
Give only the essentials (zero, wind), because the important information was given the
day before. Reassure after a miss with earlier similar races the athlete handled. Source:
Mazet, Issue 1. Evidence: P.

**L27 Which shooting counts most in each race.** Phases: early, competition. Focus:
tactics. Sprint: standing shooting and standing range time. Individual: overall accuracy
(a miss costs a minute). Pursuit and mass start: the last standing stage has the
strongest link to the podium; do not use up spare rounds in prone and need them in
standing; do not speed up because a rival is faster. Relay: reliable shooting and short
range times matter most on legs 2 and 4 for women. Sources: Laaksonen, Issue 5; Mazet,
Issue 1. Evidence: R (review).

**L28 New venue or altitude.** Phases: specific, early. Focus: conditions. Expect the
range to feel different; accept more movement in the rifle and take two or three extra
breaths before starting; check natural point of aim and rifle settings; practise the
entry into the range at the venue. Source: Mazet, Issue 1; Chabloz and Köykkä et al.,
Issue 6. Evidence: P.

**L29 Fit the rifle to the athlete, with care.** Phases: transition, general, specific.
Focus: equipment. Cheekpiece, hand stop, grip, butt plate (and standing grip), sight
set-up and natural point of aim, tuned to the athlete for comfort and alignment; zero in
calm, windless conditions. Test a change where improvement is expected and in small
steps; avoid big changes before key races. Coach note: this is a checklist for athlete
and coach; the app cannot see rifle setup. Source: Issue 6. Evidence: P.

**L30 Transition: recovery and low-stakes technique.** Phases: transition. Focus:
recovery. Shooting practice needs recovery periods too. Keep it light, fun and
technique-focused; use the time for rifle service and fit. Source: Kähkönen in Issue 6
(recovery), Mujika (Issue 3, transition phase). Evidence: P. (Thin: no shooting-specific
source on transition, flagged for review.)

**L31 Feedback style (coach-facing).** Phases: all. Combine objective feedback (the app's
numbers) with athlete autonomy: some athletes want detail and demonstration, others do
better with room to reflect; intervene on style only when it hurts stability, wind
management or consistency. Source: Issue 6. Evidence: P.

## 4. Pattern rules that surface entries: precision

These are the existing findings, now each pointing at library entries.

| Finding | Surfaces |
|---|---|
| zero_offset | zero-check (drill); L29 (rifle fit) |
| vertical_stringing | L01, L07, L13 |
| horizontal_stringing | L07, L06, L05 (standing) |
| trigger_bias | L11, L12, L13 |
| wide_group | L05, L06, L07, L08 |
| flier | L13, L14, L11 |
| cold_first_shot | L03, L17, L18, L19 |
| fatigue_drift | L05, L07, L22 |
| unstable_npa | L06, L29 |
| standing_gap | L02, L05, L06, L08 |
| wind_sensitivity | L28, L29 |
| no_standout | L21, L22, L13 |

## 5. Pattern rules that would be new: metal (your point about stability and timing)

The advice engine reads precision photos only today, so metal bouts produce no advice at
all. A metal bout has five discs (alpha to echo), hit or miss, with position, heart rate
(optional), zone, combo and race or range. Candidate rules, each needing a minimum
number of bouts before it speaks (suggest 8 per position, 6 in a comparison):

| Id | What the data shows | Reads as | Surfaces |
|---|---|---|---|
| M1 standing_vs_prone | Standing hit rate 20+ points under prone | Stability | L02, L05, L06, L08 |
| M2 one_disc_missed | One disc 25+ points under the rest | Aim or natural point of aim (side) | L06, L29, L08 |
| M3 scattered_misses | Misses spread evenly across all discs, low rate | Stability or hold (not aim) | L01, L05, L07 |
| M4 late_discs | Last two discs miss far more than the first two | Timing, rushing, fatigue | L09, L10, L14 |
| M5 first_disc | First disc misses clearly | Arrival, timing | L17, L19, L03 |
| M6 miss_streaks | A miss makes the next one more likely | Composure, timing | L14, L15, L13 |
| M7 heart_rate_drop | Hit rate falls at higher heart rate or zone | Arrival, breathing | L03, L17, L18 |
| M8 race_vs_range | Race hit rate 15+ points under range | Pressure | L15, L16, L24 |
| M9 standing_volume | Few standing bouts next to prone | Practice volume | L21, standing-volume |

**Shot order, M4 to M6:** answered. Athletes set Alpha to Echo or Echo to Alpha in Settings (stored on their athlete row, readable by their coaches), and `shotOrder()` in `src/lib/metal.ts` turns that into the firing order. The app still records which discs fell but not the order, so M4 to M6 rest on that stated preference. M1, M2, M3, M7, M8 and M9 do not need it.

## 6. Not yet read

Issue 2 altitude article, Issue 5 day-to-day load, Issue 6 "Evolution of training" and
Antholz altitude articles, Issue 1 core and pacing pieces beyond those listed, and the
rest of the 2018 catalogue (pages 18 to 53, 57 to 61, 69 to 75). They may add or sharpen
entries, especially for altitude and the transition phase (L30 is thin).

## 7. Questions for you

1. Phases: settled for now (April and May transition, June to August general, September
   and October specific, November and December early season, January to March
   competition). To be refined later. Implemented in `src/lib/seasonPhase.ts`.
2. Entries: anything to cut or soften? L30 is the thinnest and L29 touches on equipment.
3. Metal: which of M1 to M9 would you want first?
4. Wording and reading level: these are written for an informed athlete and a coach.
   Should athlete-facing text be shorter, with the detail one tap away?
