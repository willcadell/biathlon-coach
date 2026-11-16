# Shooting advice library: draft for review

Status: draft, written 2026-10-17. Nothing here is in the app yet. It is for you to cut,
correct and approve before any code is written.

Updated 2026-11-15: section 8 added (season phase tags for drills, and phase notes for
advice findings). Also a draft, not yet in the app.

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

Term: athlete-facing text says **natural alignment** (Will's term, 2026-11-15) for what
the IBU sources call natural point of aim. Internal ids keep `npa` (`npa-check`, `unstable_npa`).

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
breaths before starting; check natural alignment and rifle settings; practise the
entry into the range at the venue. Source: Mazet, Issue 1; Chabloz and Köykkä et al.,
Issue 6. Evidence: P.

**L29 Fit the rifle to the athlete, with care.** Phases: transition, general, specific.
Focus: equipment. Cheekpiece, hand stop, grip, butt plate (and standing grip), sight
set-up and natural alignment, tuned to the athlete for comfort and alignment; zero in
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
| M2 one_disc_missed | One disc 25+ points under the rest | Aim or natural alignment (side) | L06, L29, L08 |
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
5. Section 8 (season phase for the advice): see the questions at the end of that section.

## 8. Season phase in the shooting advice

**Status: draft for review, 2026-11-15. Not in the app yet.**

Today the advice ignores the time of year. The findings ("what your groups are saying")
read only the shot data, the drills in "Your next two weeks" are picked by finding alone,
and each finding links to the same library entries in July and in February.

**What would change, and what would not.** What the data shows should not change with the season:
a vertical spread is a vertical spread in any month. What changes is what to *do* about it.
Three things:

1. **Drills get phase tags.** In "Your next two weeks", drills that suit the current
   phase rank first. Out-of-phase drills rank lower but are **not hidden**, because a
   real fault in January still needs an answer. When one does appear, it carries a short
   line saying so, e.g. "Best done in general preparation."
2. **Findings get a phase note.** One line under the cause, saying what this finding
   means for training at this time of year (8.2).
3. **Library links sort by phase.** A finding's library entries show the current
   phase's entries first. No new data is needed: entries already have phases.

Phase codes below: **T** transition (Apr–May), **G** general prep (Jun–Aug), **S**
specific prep (Sep–Oct), **E** early season (Nov–Dec), **C** competition (Jan–Mar).

### 8.1 Drill phase tags

The basis for these is the season structure entries in section 3: foundations at
rest first (L21), load added in steps (L22, L23), from experimenting to repeating
as racing nears (L24), keep shooting in the taper (L25), no big changes before key
races (L29).

| Drill | Phases | Why |
|---|---|---|
| zero-check | T G S E C | A sight error is never worth carrying. New venues and altitude change the zero (L28). |
| click-calibration | T G S | A one-off job, best done in calm conditions before winter. In race season, only after a new sight. |
| breathing-pause | G S E | Foundation work (L21). Still useful in early season, but by competition the breathing pattern should be set. |
| npa-check | T G S E C | A quick check, not a technique change. Do it at every new venue (L28). |
| ball-and-dummy | T G S | Exposes trigger anticipation and makes the athlete rework the trigger. That is technique change, so keep it to the build phases (L21, L24). |
| plateau-trigger | T G | A new trigger technique: learn it at rest, well before racing (L21, L29). |
| trigger-variations | G S | Cold, gloves, pressure: proof the trigger before winter arrives. |
| follow-through | T G S E C | An awareness habit, not a change. It helps in any phase. |
| hold-build | G S | Raw stability, built at rest (L21). |
| balance-ladder | T G S | Stance stability built up in small steps. Best started early. |
| unstable-support | T G | Exploratory work at rest. It unsettles the position on purpose, so not when racing. |
| resistance-pull | G S | Stability under a disturbing force: the step between rest and load (L22). |
| incline-shooting | S E | Course-specific. Fits camps and new venues (L28). |
| position-build | G S E | Repetition for a consistent position. Early season still allows small adjustments. In competition, only the existing position (L29). |
| range-entry | S E C | Range approach is this period's work (L17, L19). Rehearse it the day before races (L25). |
| combo-intervals | S E | Shooting under load (L23). In competition, races and the taper replace it (L25). |
| standing-volume | G S | Volume of precision shots is a general prep job (L21). |
| shot-plan | S E C | Routine to repeat under race pressure (L24). |
| progression | S E C | Clock, penalty loops, a competitor: race pressure once nothing is broken (L22, L20). |

So in competition the in-phase set is zero-check, npa-check, follow-through,
range-entry, shot-plan and progression: checks, routines and pressure, no rebuilds.
That matches L24 and the "don't rebuild mid-season" idea.

### 8.2 Phase notes on findings

A default note per phase, with overrides only where a finding reads differently.

**Defaults** (used for any finding not listed in the overrides):

| Phase | Note |
|---|---|
| T | Off-season: a good time to look at this calmly, with no race to protect. Keep sessions light. |
| G | Good time to fix this at the root: technique at rest, plenty of quiet precision shots, before load goes on (L21). |
| S | If this shows up only under load, go back to rest until it holds, then add load in steps (L22). |
| E | Racing has started: work on this in small steps, and avoid big changes in a race week (L24, L29). |
| C | Mid-season: don't rebuild technique now. Keep the routine you race with, manage this with the drills below, and note it to work on in April (L24). |

**Overrides:**

| Finding | Phase | Note |
|---|---|---|
| zero_offset | all | Fix this now, whatever the time of year. Re-check zero at every new venue (L28). |
| vertical_stringing | C | Don't rework your breathing pattern now. Use a respiratory pause you already know, and call every shot. |
| trigger_bias, flier | G | Best time of year to rework the trigger: plateau trigger, ball and dummy. |
| trigger_bias, flier | C | Don't change your trigger technique mid-season. A written shot plan and calling every shot help most now. |
| unstable_npa | E C | Check natural alignment at each new venue. Small adjustments only (L28, L29). |
| cold_first_shot, metal_first_disc | T G | Expected off-season, with little race-pace skiing into the range. It becomes the main job in specific prep. |
| cold_first_shot, metal_first_disc | S E | Right on time: the range approach is this period's main work (L17, L19). |
| cold_first_shot, metal_first_disc | C | Rehearse the range entry at race speed the day before each race (L25). Ease off over the last 200–300 m (L17). |
| fatigue_drift, metal_intensity_drop | G | Don't chase this at high intensity yet. Build steadiness at rest and low intensity first (L22). |
| fatigue_drift, metal_intensity_drop | S | This is the phase for it: shooting under load, a little beyond race intensity (L23). |
| fatigue_drift, metal_intensity_drop | E C | On race days, arrive with your breathing under control and ease off before the range (L17). |
| standing_gap, metal_standing_gap, metal_standing_volume | G | Best time to add standing volume, half of it dry at home (L21). |
| standing_gap, metal_standing_gap, metal_standing_volume | C | Standing decides sprints, and the last standing stage decides pursuits and mass starts (L27). Keep standing in every session through the taper (L25). |
| metal_race_gap | T G | Look back over last season's races and plan routine work for the autumn. |
| metal_race_gap | E | Normal early on, while you move from experimenting to repeating (L24). |
| metal_race_gap | C | Trust the routine. A written shot plan takes the decision out of the moment. |
| solid | T | Nothing stands out. Rest, service the rifle, keep it light (L30). |
| solid | G | Nothing stands out. Build precision volume, then start adding load (L21, L22). |
| solid | S | Nothing stands out. Add pressure: speed and heart rate (L23). |
| solid | E C | Nothing stands out. Keep the routine and work on range time (L20). |

### 8.3 Not changed

- **The diagnosis rules and their thresholds** stay as they are in every phase.
- **The 60-day window.** In November it still reaches back into specific prep. That
  seems fine, since the faults are the same. Revisit if early-season advice feels stale.
- **Metal and precision** use the same tags. Metal findings already share drills
  with precision ones.

### 8.4 Questions for you

1. **Drill tags:** anything you would move? The ones I am least sure of are
   ball-and-dummy (many coaches use it all year), breathing-pause (left out of C), and
   combo-intervals (left out of C).
2. **Out-of-phase drills:** rank them lower (as proposed), or leave them out of "Your
   next two weeks" and show them behind a "More drills" tap instead?
3. **Competition note:** is "note it to work on in April" the right tone, or too
   discouraging for a novice who has a real fault mid-season?
4. **Transition:** the notes there are thin, like L30. Keep them, or treat transition
   as general prep?
