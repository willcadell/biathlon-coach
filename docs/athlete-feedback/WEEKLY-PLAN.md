# Training time budgets and suggested activities

Status: being built, 2026-11-15. Will asked for "some sense of a suggested weekly plan,
with options for how long someone can practise in a week". He then narrowed it:
**don't prescribe when an athlete trains**. Just suggest activities that fit the time
they have. It was first built at the top of the 545 Coach tab, then moved into Analysis
(agreed with Will), where the drills sit under the findings that explain them.

## The problem it solves

"Your next two weeks" in Analysis lists up to six drills, each with its own frequency.
Added up, the top three alone can ask for ten or more sessions a week. An athlete
without a coach has no one to say "with the time you've got, do these". This section
does.

## What the athlete sets

In Analysis, a **"Training week"** section of its own (calendar icon), straight after
Shooting advice, opened and closed separately. It replaces "Your next two weeks", whose
full list stays inside Shooting advice behind an "All suggested drills" tap. With no
advice yet, it offers foundation drills. Coaches viewing an athlete still see the
old two-week list, because the time budgets are not synced to them yet. The 545 Coach
tab keeps one line under "Start a session" ("This week: 55 min across 3 drills…
· See your training week") that jumps to it. It asks for two weekly budgets, each one tap:

| Budget | Options |
|---|---|
| At home (dry-fire) | None, 30 min, 1 h, 2 h, 3 h |
| At a range | None, 30 min, 1 h, 2 h, 3 h |

These are kept in the browser for now, like the other settings. Syncing them to the
athlete row, so coaches can see them, comes later.

## What it suggests

A list of activities for the week, split into **At home** and **At a range**. Each
shows how many times and for how long ("2 × 15 min"), and why it's suggested. There are
no days and no order beyond priority.

How the list is filled (`src/lib/weeklyPlan.ts`):

1. Drills come from the same ranked list as "Your next two weeks", built from the
   athlete's own findings. With no findings yet, a set of foundation drills is used
   instead: breathing, holds, natural alignment and calling shots, plus a zero check at
   the range.
2. **Breadth first, in rank order:** each drill gets one session if it fits its
   budget. Dry-fire drills go to the home budget, and range-only drills go to the range
   budget. A dry drill can use spare range time when there's no home time left.
3. **Then depth:** the top drills get more sessions, up to their own suggested
   frequency (at most 3 a week), while time remains.
4. At most three different drills in each place, so the week keeps a clear focus.
5. Spare time is shown, not filled with filler.

Every list ends with the existing advice: close each session with a couple of calm
dry-fire clips.

## Not in this first version

- Season-phase ranking (shooting library draft, section 8) is still awaiting review.
  Once it's approved, it slots into step 1.
- Drill feedback ("Did this help?") and the athlete-feedback design build on this list
  later.
- A suggested activity has no tick-off of its own. Logging a workout is enough.
