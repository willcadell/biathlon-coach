# Athlete feedback that informs the advice: design for review

Status: draft, 2026-11-15. Nothing here is built. For Will to cut, correct and approve.

## Where things stand

Today the advice reads shot data only: group shape and position for precision
(`src/lib/diagnostics.ts`), and which discs fell, in which position and under what load
for metal (`src/lib/metalAdvice.ts`). Athletes can write free-text notes on a bout or a
workout, and coaches can add coach notes, but the advice reads none of that.

The data is good at *what* happened and weak at *why*. A low-left group could be a
trigger jerk or lost natural alignment, and a bad standing stage could be tiredness
or nerves. The athlete often knows. This design gets that knowledge in with taps, not
typing, and lets it sharpen the advice without ever overruling the targets.

## Who this is for

**The athlete without regular coaching.** Will's aim (2026-11-15) is for 545 to give real
advice to athletes who have no coach watching them shoot. So the feedback cannot only be
data for a coach to read later. The app has to do what a coach would do with it:

- **Ask the next question.** A coach who hears "that's not me" asks "then what does it
  feel like?" and moves to the next likely cause. The app should do the same, not just
  mark the finding down.
- **Run the check.** Many findings already end with a test ("load a dummy round; if the
  rifle dips on the empty click, this is it"). Today that is advice text. It should be a
  question the app asks afterwards, and the answer should settle the cause.
- **Close the loop.** A coach checks in a week later on whether the drill worked. The
  app should too, and change the plan if it didn't.

Coaches still see everything (item "What coaches see"), but every part of this design
has to work for an athlete with no coach.

## Three kinds of feedback

Agreed with Will: all three, and coaches see all of it.

### A. How the session felt (check-in on Finish)

Shown on the "Session logged" screen after every session, above the share buttons.
Three one-tap rows on a three-point scale (quick with cold hands), each row skippable,
plus one **Skip** for the lot:

| Row | 1 | 2 | 3 |
|---|---|---|---|
| Energy | Fresh | OK | Tired |
| Head | Calm, focused | OK | Rattled, distracted |
| Hold | Steady | OK | Wobbly |

The check-in covers range, race and dry-fire sessions. For a race, "Head" is the row that matters most.
Stored on the workout.

### B. What the athlete noticed (tags on a bout)

Optional chips when saving a precision or metal bout (and a race stage). Pick any:

| Tag | Points at findings |
|---|---|
| Jerked the trigger | trigger_bias, flier, metal_scattered |
| Rushed it | flier, cold_first_shot, metal_late_discs, metal_first_disc |
| Held too long | vertical_stringing, fatigue_drift, metal_late_discs |
| Breathing off | vertical_stringing, fatigue_drift, metal_intensity_drop |
| Had to steer the rifle on | unstable_npa, horizontal_stringing, metal_one_disc |
| Arrived hot | cold_first_shot, metal_first_disc, metal_intensity_drop |
| Distracted | flier, metal_miss_streaks, metal_race_gap |
| Wind / gust | wind_sensitivity (and see "Wind-tagged bouts" below) |
| Felt good | none. It marks a reference bout to compare against. |

The list is per bout, not per shot. That keeps it to one tap after a bout, and a shot-level
tag would need the shot order the app does not record for metal.

### C. Feedback on the advice itself

- **On each finding:** "Sounds like me" / "Not me", with an optional line of why.
- **On each drill in "Your next two weeks":** after it has been on the list for a week,
  "Helped" / "Didn't help" / "Haven't tried it".

## How each one changes the advice

The ground rule: **the targets stay primary.** Feedback re-ranks, re-words and adds context.
It never silently hides a finding, and it never makes a priority out of nothing.

1. **Tags confirm or question the cause.**
   - A finding whose tags agree in at least a third of its bouts gets a confidence boost
     (capped), and an extra line: "You noticed *jerked the trigger* on 4 of these 6 bouts."
   - A tag that recurs on 3 or more of the last 8 bouts in a position, with no matching
     finding from the data, shows as a low-key **"You've noticed"** card (severity
     *watch*, never *priority*), with that tag's drills. This is the one way feedback can
     add something, and it is labelled as coming from the athlete.
2. **Wind-tagged bouts count less for technique findings.** A bout tagged *Wind / gust* is
   weighted at half for group-shape findings (stringing, wide group, trigger bias), and
   counts double for wind_sensitivity. This stops a gusty day being read as a hold
   problem.
3. **The check-in splits fatigue from technique.** With at least 3 tired (energy 3)
   and 3 fresh (energy 1) sessions in the window:
   - If fatigue_drift, wide_group or metal_intensity_drop show only on tired days, the
     cause is re-worded to load and recovery ("this is a tired-day pattern") and the
     technique drills drop below range-entry and combo work.
   - If "Head" runs high in races and metal_race_gap fires, the cause says so ("you rate
     your head as rattled in most races"), and shot-plan moves to the top.
   - A high "Hold" score on a bout that scored well is a useful mismatch for the coach,
     shown in the Coach view but not used in the advice.
4. **"Not me" starts a conversation, as a coach would.** Each finding has a short list
   of *other* causes that make the same pattern on paper (a differential). "Not me"
   asks which of those sounds closer, as tags the athlete can tap, for example for a
   low-left group: "Had to steer the rifle on", "Sight or zero", "Wind", "Don't know". The
   answer swaps the cause text and the drills to that alternative. "Don't know" offers
   the check that tells them apart (item 6).
   The original finding is kept, collapsed under "You said this doesn't sound like you",
   with its confidence cut by a third. **A dismissal stays the athlete's call:** a
   coach cannot restore it, and the app never silently brings it back.
   **But a dismissed cause can be asked about again.** Sometimes the athlete's first
   read is wrong, and a coach would come back to it. The app re-asks ("Worth another
   look? …") when the evidence changes, not just because time passes:
   - the alternative the athlete picked was ruled out by its check, or its drills were
     marked "Didn't help";
   - or the data for the dismissed cause got clearly stronger (confidence up by 0.2).
   It never re-asks within 30 days of the dismissal, unless a check ruled out the
   alternative. If the athlete says "Not me" again, it stays dismissed.
   **"Sounds like me"** adds a small confidence boost and keeps its drills at the top.
5. **Drill feedback picks the next drill.** "Helped" keeps the drill on the plan.
   "Didn't help" moves it down and brings in the next-best drill for the same finding.
   "Haven't tried it" changes nothing. After two weeks the app also checks the numbers.
   If the finding has weakened since the drill went on the plan, it says so ("Your
   standing group is 18% tighter since you started timed holds"). That is the
   encouragement a coach would give.
6. **Checks with answers.** A finding with a test (trigger_bias: ball and dummy;
   zero_offset: zero check; unstable_npa: close your eyes and settle, then open them;
   wind_sensitivity: shoot one group into and one with the wind) shows the test as a
   card: "Try this, then tell us what happened", with two or three answer buttons.
   The answer confirms the cause (big confidence boost, and the finding is marked
   "confirmed by your check") or rules it out (the next cause in the differential takes
   over). This is the closest the app gets to a coach standing behind the athlete.

## What coaches see

- **Workouts:** the check-in as three small pips next to the session, and tags on each
  bout.
- **Analysis (coach view of an athlete):** each finding shows the athlete's verdict
  ("Not me", with their reason) and how many of its bouts the athlete tagged to agree.
  Drill feedback appears next to each drill.
- **Read-only:** coaches cannot change an athlete's feedback. They can reply with a coach
  note as they do now.

## Data (Supabase)

One migration:

- `workouts.checkin` jsonb, nullable: `{ energy, head, hold }`, each 1–3 or missing.
- `bouts.tags` and `metal_bouts.tags`: text[], default empty. Values come from a fixed
  list checked in the app, so the list can grow without a migration.
- New table `advice_feedback`: `id, athlete_id, kind ('finding' | 'drill'), ref (finding
  or drill id), position, verdict, note, created_at`. RLS: the athlete reads and writes their own rows;
  linked coaches read them, using the same policy pattern as
  `workout_coach_notes`.

## Related

- `DIFFERENTIALS.md`: the alternative causes and checks behind "Not me" (items 4 and 6).
- `WEEKLY-PLAN.md`: a suggested week built from the advice, sized to how much time the
  athlete has. That's where drill feedback gets asked.

## Build order

Each step can ship on its own:

1. **Capture.** Check-in on Finish, tags on bouts, both visible in History and the Coach
   view. Nothing in the advice changes yet, but data starts building, and the advice
   needs a few weeks of it before steps 3 and 4 say much.
2. **Advice feedback, coach-style.** The buttons on findings and drills, the
   differential behind "Not me", checks with answers, and drill swapping and progress
   (items C, 4, 5 and 6). This is the step that matters most for athletes without a
   coach, and it needs no history: it works from the first finding. It can go before
   step 1 if Will prefers.
3. **Tags in the advice.** Confidence boosts, the wind weighting, and the "You've
   noticed" cards (items 1 and 2).
4. **Check-in in the advice.** The fatigue and nerves split (item 3), once there is
   enough check-in data to test it on.

## Decisions (Will, 2026-11-15)

1. **Check-in scale:** three points is enough (section A).
2. **Tags:** the list in section B is fine for now, with the same list for metal and precision.
3. **Prompting:** the check-in shows after every session, and can be skipped.
4. **Dismissals:** if the athlete dismissed a finding, it stays dismissed. A coach cannot
   restore it.
5. **Differentials:** yes, draft them from the IBU sources in a review file,
   `docs/athlete-feedback/DIFFERENTIALS.md`. Dismissed causes sometimes need to be
   returned to: the app re-asks when the evidence changes (item 4 in "How each one
   changes the advice").
6. **Thresholds:** a third of bouts, 3 of 8, 3 tired and 3 fresh sessions, and 30 days
   are good to start with.
