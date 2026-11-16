import type { FindingId, Position } from './types'

/**
 * For each finding, the other causes that make the same pattern on paper, and a check
 * that tells them apart. This is what lets the advice do what a coach would: when the
 * athlete says "that's not me", ask which sounds closer, and when they don't know, give
 * them a test to run. Content reviewed by Will: docs/athlete-feedback/DIFFERENTIALS.md.
 */

export interface Alternative {
  id: string
  /** In the athlete's words, as a chip. */
  chip: string
  /** Replaces the finding's cause when this is the one the athlete picks. */
  cause: string
  /** Drill ids that answer it, best first. Empty when there is no drill, only a note. */
  drills: string[]
  /** Only offered for this position. */
  position?: Position
  /** Something to know rather than a drill to do (a race-day note). */
  note?: string
}

export interface CheckAnswer {
  id: string
  label: string
  /** Which cause the answer points at: 'first' (the app's first read), an alternative's id, or null for no answer. */
  points: 'first' | string | null
  /** Points at it, but not strongly enough to call it confirmed. */
  weak?: boolean
  /** What to do next, shown once this is the answer. */
  note?: string
}

export interface Check {
  title: string
  /** How to run it. */
  how: string
  /** Shown when a partner helps; the athlete can still run `how` alone. */
  partner?: string
  answers: CheckAnswer[]
}

export interface Differential {
  alternatives: Alternative[]
  check?: Check
}

const ARRIVAL: Differential = {
  alternatives: [
    { id: 'too-fast', chip: 'I come in too fast', cause: 'You are reaching the mat faster than your shooting can absorb. Ease the speed over the last 200 to 300 metres, so you arrive with your breathing under control, and find the entry speed that suits you.', drills: ['range-entry', 'combo-intervals'] },
    { id: 'not-built', chip: "My position isn't built yet", cause: 'The first shot goes before the position is fully built and checked. The rest of the bout is fine because by then it is. Give the build the same steps every time, and only fire once they are done.', drills: ['range-entry', 'position-build'] },
    { id: 'rushed-first', chip: 'My first shot is rushed on purpose', cause: 'A deliberately quick first shot that is not paying off yet. Write down your first-shot routine and stick to it until it is reliable, then bring the speed back.', drills: ['shot-plan'] },
  ],
  check: {
    title: 'Two entries',
    how: 'In one session, ski into the range once at race pace, and once easing off over the last 200 metres. Compare the first shot each time.',
    answers: [
      { id: 'eased-better', label: 'First shot better after easing off', points: 'too-fast' },
      { id: 'no-difference', label: 'No difference', points: 'not-built' },
    ],
  },
}

const STANDING: Differential = {
  alternatives: [
    { id: 'balance', chip: 'I do practise standing a lot', cause: 'The practice is there, so this is balance and core: the body cannot yet hold still enough standing. Balance and hold work closes it.', drills: ['balance-ladder', 'hold-build'] },
    { id: 'build', chip: 'My standing position feels different every time', cause: 'The standing build is not repeatable, so each bout starts from a slightly different place. Make the build land the same way every time.', drills: ['position-build', 'npa-check'] },
    { id: 'timing', chip: 'I time my standing shots', cause: 'A timing approach that is not working yet: the shot goes as the sight passes the target, and the release is not quite in step with it. Work on the timing at rest, or try holding instead.', drills: ['hold-build', 'follow-through'] },
  ],
  check: {
    title: 'A 30-second hold',
    how: 'Standing, aim at a target and hold for 30 seconds without firing. Note when the sight first leaves the target.',
    answers: [
      { id: 'leaves-early', label: 'It leaves before 15 seconds', points: 'balance' },
      { id: 'holds', label: 'It holds most of the 30 seconds', points: 'build', weak: true },
    ],
  },
}

export const DIFFERENTIALS: Partial<Record<FindingId, Differential>> = {
  zero_offset: {
    alternatives: [
      { id: 'hold-off', chip: 'I aim off on purpose', cause: 'You are holding off for wind or out of habit, so the group lands where it was aimed. Zero on a calm day with no hold-off, then decide whether the sight needs to move.', drills: ['zero-check'] },
      { id: 'position-moved', chip: 'My position changed', cause: 'A new way of building the position points the rifle somewhere new. It looks like a zero shift, but the position is what moved.', drills: ['npa-check', 'position-build'] },
      { id: 'ammo-rifle', chip: 'Different ammo or rifle today', cause: 'A new batch of ammunition or a different rifle has its own zero. Re-zero for it rather than for your usual set-up.', drills: ['zero-check', 'click-calibration'] },
    ],
    check: {
      title: 'One calm group, sight unchanged',
      how: 'On a calm day, build your position fresh and shoot one group with no hold-off. Do not touch the sight.',
      answers: [
        { id: 'same-place', label: 'Lands in the same wrong place', points: 'first' },
        { id: 'centred', label: 'Lands in the middle', points: 'hold-off' },
        { id: 'somewhere-new', label: 'Lands somewhere new again', points: 'position-moved' },
      ],
    },
  },

  vertical_stringing: {
    alternatives: [
      { id: 'sling', chip: 'My sling feels loose or changes', position: 'prone', cause: 'Sling tension is letting the rifle bounce between shots. Set the sling the same way every time and check it stays put through the bout.', drills: ['position-build', 'resistance-pull'] },
      { id: 'butt', chip: 'The butt moves on my shoulder', position: 'prone', cause: 'The butt sits low or moves on the shoulder, so recoil lands it somewhere different each shot. Place it the same way every time and check it after each shot.', drills: ['position-build'] },
      { id: 'fading-hold', chip: 'My hold fades and I push it back up', position: 'standing', cause: 'You run out of air and muscle and force the rifle back up instead of resetting. Come off, breathe and start the shot again rather than pushing it.', drills: ['hold-build', 'breathing-pause'] },
    ],
    check: {
      title: 'The breathing count',
      how: 'Dry-fire ten shots, counting the same number in the pause before every break.',
      answers: [
        { id: 'steadier', label: 'The sight sits steadier with the count', points: 'first' },
        { id: 'feel-butt-sling', label: 'No difference, and I can feel the butt or sling change', points: 'sling' },
        { id: 'no-difference', label: 'No difference', points: null },
      ],
    },
  },

  horizontal_stringing: {
    alternatives: [
      { id: 'steer', chip: 'Had to steer the rifle on', cause: 'Your natural alignment is off to one side, so you steer the rifle onto the target for every shot and it fights back between them. Move the whole position until the relaxed rifle sits on the target.', drills: ['npa-check', 'position-build'] },
      { id: 'elbow', chip: 'My elbow slides on the mat', position: 'prone', cause: 'The elbow creeps in or out over the bout. Check it lands in the same spot on the mat every time.', drills: ['position-build', 'unstable-support'] },
      { id: 'finger', chip: 'My trigger finger touches the stock', cause: 'The trigger finger presses sideways against the stock instead of straight back, nudging every shot the same way.', drills: ['plateau-trigger', 'trigger-variations'] },
    ],
    check: {
      title: 'Eyes-closed alignment',
      how: 'Settle into position on the target, close your eyes, breathe out and relax, then open them.',
      answers: [
        { id: 'moved', label: 'The sight has moved sideways', points: 'steer' },
        { id: 'stayed', label: 'It stays on the target', points: 'first' },
        { id: 'finger', label: 'It stays, and I can feel my finger on the stock', points: 'finger' },
      ],
    },
  },

  trigger_bias: {
    alternatives: [
      { id: 'steer', chip: 'Had to steer the rifle on', cause: 'Your natural alignment is off low and to the side, so you hold the rifle over against it and it pulls back as the shot goes.', drills: ['npa-check', 'position-build'] },
      { id: 'zero', chip: 'Sight or zero', cause: 'The zero has moved, and the group is loose for other reasons. Check the zero before working on the trigger.', drills: ['zero-check'] },
      { id: 'grip', chip: 'Grip or cheek pressure changes', cause: 'You squeeze the grip or press your cheek harder on some shots. Keep both the same through every shot, and follow through.', drills: ['position-build', 'follow-through'] },
    ],
    check: {
      title: 'Ball and dummy',
      how: 'Mix a few dummy rounds into a magazine at random and shoot normally. Watch the sight on every click.',
      partner: 'Easier with a partner loading the magazine, so you cannot know which round is which. Alone, do ten dry clicks watching the front sight instead.',
      answers: [
        { id: 'dips', label: 'The rifle dips on the dummy', points: 'first' },
        { id: 'jumps-dry', label: 'Alone: the sight jumps at the dry click', points: 'first', weak: true },
        { id: 'still', label: 'It stays completely still', points: 'steer' },
      ],
    },
  },

  wide_group: {
    alternatives: [
      { id: 'tired', chip: 'Only on tired days', cause: 'This is fatigue, not stability: the hold is there when you are fresh. Build load step by step, and keep technique shooting for fresher days.', drills: ['combo-intervals'] },
      { id: 'rifle', chip: 'Rifle or ammo might be the issue', cause: 'Worn ammunition, a loose bedding screw or a dirty barrel can open up a group in every direction. Shoot one group from a rest to find out.', drills: ['zero-check'] },
      { id: 'wind', chip: 'Wind or gusts', cause: 'Conditions, not your hold. Read the group from calm days, and treat windy ones as wind practice.', drills: [] },
    ],
    check: {
      title: 'Shoot from a rest',
      how: 'Shoot one group with the rifle on a solid rest, such as a sandbag or a bench.',
      answers: [
        { id: 'tight', label: 'Tight from a rest', points: 'first' },
        { id: 'loose-own', label: 'Still loose, and it is my own rifle', points: 'rifle', note: 'Check the bedding screws are tight, clean the barrel, and try a different batch of ammunition.' },
        { id: 'loose-borrowed', label: 'Still loose, and it is borrowed, club or rented', points: 'rifle', note: 'Tell whoever looks after it (club armourer, coach or rental desk), and ask to try another rifle if there is one. Do not adjust a rifle that is not yours.' },
      ],
    },
  },

  flier: {
    alternatives: [
      { id: 'knew', chip: 'I knew it was bad as it went', cause: 'You call the shot as bad and fire it anyway. That is commitment, not focus: if the shot is not right, come off and start it again.', drills: ['follow-through'] },
      { id: 'jerk', chip: 'I jerked the trigger on that one', cause: 'A one-off trigger jerk. Make the trigger the same every time, so one pressured shot cannot break differently.', drills: ['plateau-trigger', 'ball-and-dummy'] },
      { id: 'distracted', chip: 'Something distracted me', cause: 'Your attention gets pulled off the sight picture by noise, a neighbour or the clock. A fixed routine for every shot keeps it on the target.', drills: ['shot-plan'] },
    ],
    check: {
      title: 'Call every shot',
      how: 'For three bouts, say where each shot went before you look.',
      answers: [
        { id: 'called', label: 'I called the flier before looking', points: 'knew' },
        { id: 'surprised', label: 'It surprised me', points: 'first' },
      ],
    },
  },

  cold_first_shot: ARRIVAL,
  metal_first_disc: ARRIVAL,

  fatigue_drift: {
    alternatives: [
      { id: 'sling', chip: 'My sling tightens or settles', position: 'prone', cause: 'The sling settles over the bout and moves the rifle with it. Set it so it is already settled at shot one.', drills: ['position-build'] },
      { id: 'breath', chip: 'I hold my breath too long', cause: 'A long hold, so the body starts to move before the shot goes. Shoot in the natural pause, and come off if it runs long.', drills: ['breathing-pause'] },
      { id: 'steer', chip: 'Had to steer the rifle on', position: 'standing', cause: 'Your natural alignment was never quite right, so the body pulls back toward where it wants to stand, shot by shot.', drills: ['npa-check'] },
    ],
    check: {
      title: 'Alignment after the fifth shot',
      how: 'After the fifth shot, close your eyes, relax, and open them.',
      answers: [
        { id: 'moved', label: 'The sight moved the way the group walked', points: 'first' },
        { id: 'on-target', label: 'Still on target', points: 'breath' },
      ],
    },
  },

  unstable_npa: {
    alternatives: [
      { id: 'lanes', chip: 'Different lanes or slopes', cause: 'Lanes and slopes change the position from bout to bout. Practise building it on a slope, and check your natural alignment on every new lane.', drills: ['incline-shooting'] },
      { id: 'sight', chip: 'I change my sight between bouts', cause: 'Sight changes between bouts move the centre. Settle the zero first, and change the sight only for a reason you can name.', drills: ['zero-check', 'click-calibration'] },
      { id: 'wind', chip: 'The wind changed between bouts', cause: 'Conditions moved the group, not your position. Read the centre from calm bouts.', drills: [] },
    ],
    check: {
      title: 'Eyes-closed alignment',
      how: 'Settle into position, close your eyes, relax, and open them again.',
      answers: [
        { id: 'moves-off', label: 'The sight moves off the target', points: 'first' },
        { id: 'stays', label: 'It stays on', points: 'sight', weak: true },
      ],
    },
  },

  wind_sensitivity: {
    alternatives: [
      { id: 'sway', chip: 'I sway more in the wind', cause: 'The wind is moving you, not just the bullet. Build a stance that stays still when it gusts.', drills: ['balance-ladder', 'hold-build'] },
      { id: 'correcting', chip: 'I correct the sight in wind', cause: 'Sight changes made in the wind leave the zero off once it drops. Correct for wind with a hold-off or a note, and zero only in the calm.', drills: ['zero-check'] },
    ],
    check: {
      title: 'Into and with the wind',
      how: 'Shoot one group with the wind from the left and one with it from the right.',
      answers: [
        { id: 'centres-move', label: 'The group centres move with the wind', points: 'first' },
        { id: 'opens-up', label: 'The groups open up, but the centre stays put', points: 'sway' },
      ],
    },
  },

  standing_gap: STANDING,

  metal_standing_gap: {
    alternatives: [
      ...STANDING.alternatives,
      { id: 'load', chip: 'Standing comes after harder skiing', cause: 'This is load, not position: the standing stages come at a higher heart rate. Work on arriving and breathing, not on the standing technique.', drills: ['range-entry', 'combo-intervals'] },
    ],
    check: STANDING.check,
  },

  metal_one_disc: {
    alternatives: [
      { id: 'first-last', chip: "That's where I start or finish", cause: 'It is your first or last shot, so it is timing, not aim. Give that shot the same routine as the rest.', drills: ['range-entry', 'shot-plan'] },
      {
        id: 'light', chip: 'Light or background on that side', drills: [],
        cause: 'The sight picture on that target changes with sun, shadow or what is behind it, most of all at a new venue.',
        note: 'During zeroing, look at each target in turn and note any in sun, in shadow or against a busy background. On the range, give that target the same settled sight picture as the others rather than rushing it.',
      },
      { id: 'zero', chip: 'Sight or zero', cause: 'The whole zero is a little off toward that side, and that target is the first to show it.', drills: ['zero-check'] },
    ],
    check: {
      title: 'Swing the rifle across',
      how: 'Dry, in position: aim at each target in turn, close your eyes on each, then open them.',
      answers: [
        { id: 'drifts', label: 'The sight drifts off on that target', points: 'first' },
        { id: 'holds', label: 'It holds on all five', points: 'first-last', weak: true },
      ],
    },
  },

  metal_scattered: {
    alternatives: [
      { id: 'tired', chip: "Mostly when I'm tired", cause: 'This is load, not steadiness at rest. Build the load step by step.', drills: ['combo-intervals'] },
      { id: 'jerk', chip: 'I jerk the trigger', cause: 'The trigger, specifically. Make every break the same, slow and straight back.', drills: ['plateau-trigger', 'ball-and-dummy'] },
      { id: 'rushing', chip: "Mostly when I'm rushing", cause: 'Pace, not steadiness. Fix the rhythm of the bout first.', drills: ['shot-plan'] },
    ],
    check: {
      title: 'A rested metal bout',
      how: 'Shoot one metal bout fully rested, at your own pace.',
      answers: [
        { id: 'still-scattered', label: 'Misses are still scattered', points: 'first' },
        { id: 'clean', label: 'Clean or nearly', points: 'tired' },
      ],
    },
  },

  metal_late_discs: {
    alternatives: [
      { id: 'breath', chip: 'I run out of breath', cause: 'The breath is held too long across the bout. Breathe between every shot, not just before the first.', drills: ['breathing-pause'] },
      { id: 'excited', chip: 'I get excited when the first ones fall', cause: 'You speed up after early hits. Keep the last shot at the same pace as the first.', drills: ['shot-plan', 'follow-through'] },
      { id: 'slipping', chip: 'My position is slipping', cause: 'The position settles over the bout, so the last targets are shot from somewhere slightly different.', drills: ['position-build'] },
    ],
    check: {
      title: 'Time your shots',
      how: 'Film one bout on a phone propped by the mat, and count the seconds between shots.',
      partner: 'Easier with a partner timing the rhythm.',
      answers: [
        { id: 'faster', label: 'Shots 4 and 5 come faster', points: 'first' },
        { id: 'even', label: 'Even pace', points: 'breath', weak: true },
      ],
    },
  },

  metal_miss_streaks: {
    alternatives: [
      { id: 'speed-up', chip: 'I speed up after a miss', cause: 'You hurry to make up for a miss. Take the same time over the next shot as any other.', drills: ['shot-plan'] },
      { id: 'adjust', chip: 'I change something after a miss', cause: 'You adjust the position or hold mid-bout, chasing the miss. Trust the set-up for the rest of the bout and review it afterwards.', drills: ['position-build'] },
      { id: 'position', chip: "My position's off for the whole bout", cause: 'It is not the miss: once the position is wrong, the whole bout is off. Check your natural alignment before the first shot.', drills: ['npa-check'] },
    ],
    check: {
      title: 'The reset breath',
      how: 'For a week, take one full breath and the same routine after every shot, hit or miss.',
      answers: [
        { id: 'shorter', label: 'The streaks got shorter', points: 'first' },
        { id: 'no-change', label: 'No change', points: 'position', weak: true },
      ],
    },
  },

  metal_intensity_drop: {
    alternatives: [
      { id: 'position', chip: "My position falls apart when I'm tired", cause: 'Position, not breath: the build does not hold under load. Train the position against a disturbing force, then under load.', drills: ['resistance-pull', 'combo-intervals'] },
      { id: 'rush', chip: "I rush when my heart's pounding", cause: 'Pace under load. A fixed routine stops a high heart rate from setting the rhythm.', drills: ['shot-plan', 'range-entry'] },
    ],
    check: {
      title: 'Extra breaths',
      how: 'In one combo session, take two extra breaths before the first shot at a high heart rate.',
      answers: [
        { id: 'climbs', label: 'My hit rate went up', points: 'first' },
        { id: 'no-change', label: 'No change', points: 'position', weak: true },
      ],
    },
  },

  metal_race_gap: {
    alternatives: [
      { id: 'harder', chip: 'I ski harder in races', cause: 'You arrive at a higher heart rate than in training. Train at race heart rate, and practise easing into the range.', drills: ['combo-intervals', 'range-entry'] },
      { id: 'routine', chip: 'I change my routine on race day', cause: 'There is no fixed race routine, so race day changes how you shoot. Write one down and use it in training too.', drills: ['shot-plan'] },
      { id: 'conditions', chip: 'Conditions at races are different', cause: 'A new venue, wind or altitude. Check the zero and your natural alignment at each venue, and practise the range entry there.', drills: ['zero-check', 'npa-check'] },
    ],
  },
}

/** The alternatives that apply to a finding, for its position. */
export function alternativesFor(id: FindingId, position: Position | 'both'): Alternative[] {
  const d = DIFFERENTIALS[id]
  if (!d) return []
  return d.alternatives.filter((a) => !a.position || position === 'both' || a.position === position)
}

/** A finding's check, with any answer that points at an alternative not offered for
 *  this position left out (a sling answer means nothing standing). */
export function checkFor(id: FindingId, position: Position | 'both'): Check | undefined {
  const check = DIFFERENTIALS[id]?.check
  if (!check) return undefined
  const offered = new Set(alternativesFor(id, position).map((a) => a.id))
  return { ...check, answers: check.answers.filter((a) => a.points === null || a.points === 'first' || offered.has(a.points)) }
}
