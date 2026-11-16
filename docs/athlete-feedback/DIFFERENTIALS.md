# Differentials and checks: draft for review

Status: draft, 2026-11-15. Nothing here is in the app. For Will to cut, correct and
approve, the same way as `docs/shooting-library/DRAFT.md`. The design that uses it is
`DESIGN.md` in this folder (items 4 and 6 under "How each one changes the advice").

## What this is

For each finding, the app's first read of the cause can be wrong, because more than one
fault makes the same pattern on paper. A coach watching would know which one it is. An
athlete without a coach needs the app to ask. So each finding gets:

- **First read:** the cause the app gives today. It stays the default.
- **"Not me" → which sounds closer?** Up to three other causes, as chips in the
  athlete's words, plus **Don't know**. Picking one swaps the cause text and the drills.
- **Check:** a test the athlete can run to tell the causes apart, with two or three
  answer buttons. "Don't know" leads here. Some checks need a partner, and those
  include a version for shooting alone.

**Where the content comes from.** Most alternatives are already in the app's own cause
text (for example, "check the sling tension" for vertical stringing prone). This draft
turns them into choices instead of a paragraph. Library entries (L01–L31) are cited
where one supports the alternative. Anything marked **(ours)** is general coaching
knowledge with no IBU source behind it yet, so it needs Will's eye most.

**Rules for every entry:**
- At most three alternatives, so the choice stays quick.
- Each alternative names drills that already exist. Where none fits, it names a check
  instead and the gap is flagged.
- A check answer either **confirms** a cause (big confidence boost, marked "confirmed
  by your check") or **rules it out** (the next most likely alternative takes over).
- Not included: `solid`, `no_standout` and `early_signs`. They name no cause to
  disagree with, so "Not me" there is plain feedback.

Drill ids: zero-check, click-calibration, breathing-pause, npa-check (Natural alignment),
ball-and-dummy, plateau-trigger, trigger-variations, follow-through, hold-build,
balance-ladder, unstable-support, resistance-pull, incline-shooting, position-build,
range-entry, combo-intervals, standing-volume, shot-plan, progression.

---

## Precision findings

### zero_offset: rifle is off zero

**First read:** the sight is set wrong; the group is tight, just in the wrong place.

| Chip | Cause | Drills |
|---|---|---|
| I aim off on purpose | Holding off for wind or a known habit, so the group lands where it was aimed | wind_sensitivity advice; zero-check on a calm day |
| My position changed | A new position build points the rifle somewhere new, so it looks like a zero shift but is not | npa-check, position-build |
| Different ammo or rifle today | A new lot of ammunition or a different rifle has its own zero **(ours)** | zero-check, click-calibration |

**Check: one calm group, sight unchanged.** Shoot one group on a calm day, with no
hold-off and a fresh position build. *Lands in the same wrong place* → confirms zero.
*Lands centred* → rules out zero; it was conditions or hold-off. *Lands somewhere new
again* → position (moves to unstable_npa).

### vertical_stringing: shots stringing vertically

**First read:** breathing timing, the shot breaking at different points in the breath.

| Chip | Cause | Drills |
|---|---|---|
| Sling feels loose or changes (prone) | Sling tension letting the rifle bounce between shots (already in the app's text) | position-build, resistance-pull |
| Butt moves on my shoulder (prone) | Butt sitting low or moving, so recoil lands it differently each shot (already in the app's text) | position-build |
| My hold fades and I push it back up (standing) | Running out of air and muscle and forcing the rifle back up, instead of resetting (already in the app's text) | hold-build, L09 |

**Check: the breathing count.** Dry-fire ten shots, counting the same number in the
pause before every break (L01, L02). *The sight sits steadier with the count* →
confirms breathing. *No difference* → rules out breathing. Then: *I can feel the butt
or sling change between shots* → position.

### horizontal_stringing: shots stringing sideways

**First read:** prone, natural alignment off to one side. Standing, balance: releasing
the shot as the sway passes the target.

| Chip | Cause | Drills |
|---|---|---|
| Had to steer the rifle on | Natural alignment off to one side (prone first read; standing alternative) | npa-check, position-build |
| My elbow slides on the mat (prone) | Elbow creeping in or out over the bout (already in the app's text) | position-build, unstable-support |
| My trigger finger touches the stock | Finger pressing sideways instead of straight back (already in the app's text) | plateau-trigger, trigger-variations |

**Check: eyes-closed alignment.** Settle, close your eyes, breathe out, open them.
*The sight has moved sideways* → confirms natural alignment. *It stays on the target* →
rules it out. Standing, then: *The sway is mostly side to side* → balance (balance-ladder,
L06). *I can feel my finger on the stock* → trigger.

### trigger_bias: group pulling low-left (right-handed) or low-right (left-handed)

**First read:** anticipation. The hand tightens as the trigger breaks.

| Chip | Cause | Drills |
|---|---|---|
| Had to steer the rifle on | Natural alignment off low and to the side, so the rifle is held over against it | npa-check, position-build |
| Sight or zero | The zero has moved and the group is loose for other reasons | zero-check |
| Grip or cheek pressure changes | Squeezing the grip or pressing the cheek harder on some shots **(ours)** | position-build, follow-through |

**Check: ball and dummy** (already in the app's text, and the `ball-and-dummy` drill).
A partner loads dummy rounds at random. *The rifle dips on the dummy* → confirms
anticipation. *It stays still* → rules out anticipation; next is natural alignment.
**Alone:** ten dry clicks watching the front sight. *It jumps low and to the side at
the click* → likely anticipation (counts as a weaker confirm). *Still* → no answer, as
dry fire without recoil may not show it, so suggest finding a partner.

### wide_group: group too loose

**First read:** the position is not stable enough yet. Strength and repetition.

| Chip | Cause | Drills |
|---|---|---|
| Only on tired days | Fatigue, not stability: a load problem (uses the check-in once it exists) | combo-intervals, L22 |
| Rifle or ammo might be the issue | Worn ammunition, a loose bedding screw, a dirty barrel (already in the app's text) | zero-check (from a rest), L29 |
| Wind or gusts | Conditions, not hold | wind_sensitivity advice |

**Check: shoot from a rest.** One group with the rifle on a solid rest (sandbag,
bench). *Still loose from a rest* → the rifle or ammunition, not you (rules out
stability; see L29 and get the rifle checked). *Tight from a rest* → confirms the hold
is the cause.

### flier: one shot per bout escaping

**First read:** one shot fired before it was ready. A lapse in focus, or the clock.

| Chip | Cause | Drills |
|---|---|---|
| I knew it was bad as it went | A shot called as bad but fired anyway: commitment, not focus | follow-through, L09 (come off and reset) |
| I jerked the trigger on that one | A one-off trigger jerk | plateau-trigger, ball-and-dummy |
| Something distracted me | Attention pulled off the sight picture by noise, a neighbour, the clock (L13) | shot-plan, L13, L14 |

**Check: call every shot.** For three bouts, say where each shot went before looking
(`follow-through`). *I called the flier* → it was a known bad shot fired anyway:
commitment (L09). *It surprised me* → trigger or attention.

### cold_first_shot: first shot missing after ski-in

**First read:** firing before the body has settled. The entry routine is the gap.

| Chip | Cause | Drills |
|---|---|---|
| I come in too fast | Entry speed too high for this athlete (L17, L18) | range-entry, L18 |
| My position isn't built yet | Firing before the position is fully built and checked | range-entry, position-build |
| My first shot is rushed on purpose | A deliberate quick first shot that isn't paying off (L19 timing target) | shot-plan |

**Check: two entries.** In one session, ski in once at race pace and once eased over the last
200 m. *The first shot is better after the eased entry* → confirms arrival (L17).
*No difference* → the routine on the mat, not the speed (position-build).

### fatigue_drift: group walking across the bout

**First read:** the position slipping while shooting. A position-build problem.

| Chip | Cause | Drills |
|---|---|---|
| Sling tightens or settles (prone) | The sling settling over the bout (already in the app's text) | position-build |
| I hold my breath too long | A long hold so the body starts to move (already in the app's text) | breathing-pause, L01 |
| Had to steer the rifle on (standing) | Natural alignment never quite right, so the body pulls back toward it (already in the app's text) | npa-check |

**Check: shot 1 vs shot 5 alignment.** After the fifth shot, close your eyes, relax,
open them. *The sight has moved the same way the group walked* → confirms the position
slipping. *Still on target* → breathing or hold length.

### unstable_npa: group centre moves between bouts

**First read:** a slightly different position every time. The position needs to become
repeatable.

| Chip | Cause | Drills |
|---|---|---|
| Different lanes or slopes | Lanes or slopes that change the position (L28) | incline-shooting |
| I change my sight between bouts | Sight changes between bouts moving the centre | zero-check, click-calibration |
| Wind changed between bouts | Conditions, not position | wind_sensitivity advice |

**Check: eyes-closed alignment** (already in the app's text). *The sight moves off when
you relax* → confirms position. *Stays on* → look at sight changes and conditions.

### wind_sensitivity: group pushed sideways in wind

**First read:** the wind moving the bullet, not a fault.

| Chip | Cause | Drills |
|---|---|---|
| I sway more in the wind | The wind is moving the athlete, not the bullet **(ours)** | balance-ladder, hold-build |
| I correct the sight in wind | Sight changes in wind leaving the zero off afterwards (already in the app's text) | zero-check |

**Check: into and with the wind** (from DESIGN.md). One group with the wind from the
left and one from the right. *The centres move with the wind* → confirms the bullet.
*The groups open up but the centre stays put* → it's the athlete swaying.

### standing_gap: standing lagging behind prone

**First read:** not enough standing practice.

| Chip | Cause | Drills |
|---|---|---|
| I do practise standing a lot | Volume is fine, so it is balance or core (L05, L06) | balance-ladder, hold-build, L05 |
| My standing position feels different every time | The standing build isn't repeatable | position-build, npa-check |
| I time standing shots | A timing approach that isn't working yet (L08, L10) | L08, L10, hold-build |

**Check: your own log.** The app counts standing against prone bouts. *Fewer than one
standing bout to every two prone* → confirms volume (shown automatically, no button).
Otherwise: a 30-second hold (`hold-build`). *The sight leaves the target before 15 seconds*
→ balance.

## Metal findings

### metal_standing_gap: standing well behind prone

**First read:** steadiness (sway, breath at release, or less standing practice).

Same alternatives and check as `standing_gap`, plus:

| Chip | Cause | Drills |
|---|---|---|
| Standing comes after harder skiing | Load, not position: standing stages arrive at a higher heart rate | range-entry, combo-intervals, L03 |

### metal_standing_volume: standing gets far less practice

No differential. This one is a count, not a guess. "Not me" is plain feedback (the
athlete may be practising standing elsewhere), so ask "Do you shoot standing that you
don't log here?" *Yes* → hide it for 30 days.

### metal_one_disc: one target keeps escaping

**First read:** natural alignment or the sight picture pulling away on that side.

| Chip | Cause | Drills |
|---|---|---|
| That's where I start or finish | It is the first or last shot, so it is timing, not aim (cross-check with shooting direction) | range-entry or shot-plan |
| Light or background on that side | Sight picture affected by light on that side **(ours)** | none yet; flag as a gap |
| Sight or zero | The whole zero is off a little toward that side | zero-check |

**Check: swing the rifle across.** Dry, in position: aim at each target in turn, eyes
closed on each, open. *The sight drifts off on that target* → confirms natural
alignment. *Holds on all five* → timing or sight picture.

### metal_scattered: misses across every target

**First read:** steadiness (the hold, the breathing at release, the trigger).

| Chip | Cause | Drills |
|---|---|---|
| Mostly when I'm tired | Load, not steadiness at rest | combo-intervals, L22, L03 |
| I jerk the trigger | Trigger specifically | plateau-trigger, ball-and-dummy |
| Mostly when I'm rushing | Pace, not steadiness | shot-plan, L09 |

**Check: a rested metal bout.** One bout fully rested. *Still misses scattered* →
confirms steadiness. *Clean or nearly* → load or pace.

### metal_late_discs: misses bunch at the end of the bout

**First read:** timing. Shots speeding up, or the hold fading.

| Chip | Cause | Drills |
|---|---|---|
| I run out of breath | Breath held too long across the bout | breathing-pause, L01, L02 |
| I get excited when the first ones fall | Speeding up after early hits (L13) | shot-plan, follow-through |
| My position is slipping | The position settles over the bout (as in fatigue_drift) | position-build |

**Check: time your shots.** Have someone time the shot rhythm, or film one bout on a phone. *Shots 4 and 5 come faster* → confirms
timing. *Even pace* → breath or position.

### metal_first_disc: first shot missed

Same alternatives and check as `cold_first_shot`.

### metal_miss_streaks: one miss leads to another

**First read:** head and pace. Carrying the miss into the next shot.

| Chip | Cause | Drills |
|---|---|---|
| I speed up after a miss | Hurrying to make up for it | shot-plan, L14 |
| I change something after a miss | Adjusting the position or hold mid-bout chasing the miss | position-build, L15 |
| My position's off for the whole bout | It is not the miss; the whole bout is off once the position is wrong | npa-check |

**Check: the reset breath.** For a week, take one full breath and the same routine after
every shot, hit or miss (L14). *Streaks shorten* → confirms composure. *No change* →
position.

### metal_intensity_drop: hit rate falls at high heart rate

**First read:** arrival and breathing. Not a technique problem.

| Chip | Cause | Drills |
|---|---|---|
| My position falls apart when I'm tired | Position, not breath: holding the build under load (L07) | resistance-pull, combo-intervals |
| I rush when my heart's pounding | Pace under load | shot-plan, range-entry |

**Check: extra breaths.** In one combo session, take two extra breaths before the first
shot at high heart rate (L03, L28). *Hit rate climbs* → confirms breathing. *No change* → position under load.

### metal_race_gap: racing costs hits

**First read:** pressure and arrival on race day.

| Chip | Cause | Drills |
|---|---|---|
| I ski harder in races | Arriving at a higher heart rate than training (L17, L18) | combo-intervals, range-entry |
| I change my routine on race day | No fixed race routine (L16, L24) | shot-plan, L16 |
| Conditions at races are different | New venue, wind or altitude (L28) | zero-check, npa-check, L28 |

**Check: heart rate on entry.** Log heart rate on race bouts. *It is clearly higher than in
training* → arrival. *Similar* → pressure and routine (L15, L16). This needs heart-rate
logging, so ask instead if none is logged.

---

## Questions for Will

1. Are the alternatives the right ones, in the right order? The **(ours)** items need
   checking most: grip/cheek pressure, different ammo, swaying in wind, and light on one
   side.
2. **Ammunition and rifle checks** (wide_group's shoot-from-a-rest test): are they
   realistic for a club athlete, or should the app just say "ask your club armourer"?
3. **Checks that need a partner** (ball and dummy, timing, filming): is the alone
   version good enough, or should the app say plainly that some checks need a second
   person?
4. **metal_one_disc and light on one side:** there is no drill for it. Drop that
   alternative, or add a drill?
