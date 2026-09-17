import type { Drill, Finding, FindingId } from './types'

/**
 * Drill library.
 *
 * Everything here is doable by a novice with a rifle, a mat and a wall — no
 * coach standing over you, and most of it without ammunition. Each drill names
 * the faults it answers so the recommender never has to guess.
 */
export const DRILLS: Drill[] = [
  {
    id: 'zero-check',
    name: 'Zero check and record',
    purpose: 'Separate a sight error from a shooting error before you train anything else.',
    steps: [
      'Shoot five shots prone at a paper target from a stable, unhurried position. Take as long as you like.',
      'Measure the centre of the group, not the best shot.',
      'Apply the click correction this app gives you, in one move.',
      'Shoot five more. If the group centres, the sight was the problem and you are done.',
      'Write the click setting in your log with the date, ammunition and temperature.',
    ],
    minutes: 20,
    frequency: 'Start of every training block, and after any travel',
    addresses: ['zero_offset'],
    dryFire: false,
  },
  {
    id: 'click-calibration',
    name: 'Calibrate your click value',
    purpose: 'Learn what one click of your sight is actually worth, in millimetres on paper.',
    steps: [
      'Shoot a five-shot group prone and mark its centre.',
      'Wind the elevation exactly 10 clicks in one direction. Do not touch windage.',
      'Shoot another five-shot group without changing anything else.',
      'Measure the vertical distance between the two group centres and divide by 10.',
      'Enter that number in Settings so every correction this app gives you is right.',
    ],
    minutes: 25,
    frequency: 'Once, then again if you change rifle or sight',
    addresses: ['zero_offset'],
    dryFire: false,
  },
  {
    id: 'breathing-pause',
    name: 'Respiratory pause timing',
    purpose: 'Fire every shot at the same point in the breathing cycle, which is what kills vertical spread.',
    steps: [
      'Build your position and aim in without loading.',
      'Breathe normally. On the third breath, let it half out and stop.',
      'Count in your head: the sight settles at about 2 seconds and stays settled until about 6.',
      'Break the dry shot inside that window, every time. If you pass 8 seconds, breathe and start over — never force a late shot.',
      'Twenty repetitions. Then five live shots using the same count.',
    ],
    minutes: 15,
    frequency: '3× per week, dry',
    addresses: ['vertical_stringing', 'fatigue_drift'],
    dryFire: true,
  },
  {
    id: 'npa-check',
    name: 'Natural point of aim',
    purpose: 'Make the rifle point at the target on its own, so you are not steering it for every shot.',
    steps: [
      'Build your position and settle on the target.',
      'Close your eyes, take three relaxed breaths, and let everything go slack.',
      'Open your eyes without moving. Wherever the sight is now is your natural point of aim.',
      'If it sits off the target, do not push it back. Move your whole body — hips prone, feet standing — and rebuild.',
      'Repeat until the sight opens onto the target three times running.',
    ],
    minutes: 10,
    frequency: 'Before every single bout, and 3× per week as a drill',
    addresses: ['horizontal_stringing', 'unstable_npa', 'fatigue_drift'],
    dryFire: true,
  },
  {
    id: 'ball-and-dummy',
    name: 'Ball and dummy',
    purpose: 'Expose and then remove trigger anticipation. The single most effective drill for a novice.',
    steps: [
      'Have a partner load your magazine out of sight, mixing live rounds and dummy rounds at random.',
      'Shoot normally. You must not know which is which.',
      'On a dummy round, watch the sight at the instant of the click. If it dips or jumps, you are anticipating.',
      'On every dummy, hold the position and re-break the trigger three more times cleanly before moving.',
      'Work until the sight stays completely still through the click.',
    ],
    minutes: 20,
    frequency: '2× per week until the dip disappears, then weekly',
    addresses: ['trigger_bias', 'flier'],
    dryFire: false,
  },
  {
    id: 'follow-through',
    name: 'Call your shot',
    purpose: 'Force follow-through, and build the ability to know where a shot went before you look.',
    steps: [
      'Before checking the target, say out loud where the shot went: centre, low left, high, and so on.',
      'You can only do this if you kept your eye in the sight through the shot — which is the point.',
      'Hold the position for two full seconds after the shot breaks, then reload without breaking position.',
      'Check the target. Score yourself on the call, not the shot.',
      'Aim for four correct calls out of five.',
    ],
    minutes: 15,
    frequency: 'Every live session',
    addresses: ['flier', 'trigger_bias', 'vertical_stringing'],
    dryFire: false,
  },
  {
    id: 'hold-build',
    name: 'Timed position holds',
    purpose: 'Build the raw stability an oversized group is missing.',
    steps: [
      'Build your position on an empty target and aim in.',
      'Hold the sight on the target for 30 seconds without firing. Watch how the wobble grows.',
      'Rest 60 seconds. Repeat six times.',
      'Standing: start at 15 seconds and build to 30 across a few weeks.',
      'Log the point at which the sight leaves the target — that number should climb.',
    ],
    minutes: 15,
    frequency: '3–4× per week, dry',
    addresses: ['wide_group', 'standing_gap', 'horizontal_stringing'],
    dryFire: true,
  },
  {
    id: 'balance-ladder',
    name: 'Standing balance ladder',
    purpose: 'Build the stance stability an oversized or drifting standing group is missing, in small steps.',
    steps: [
      'Build your standing position on flat ground and hold for 30 seconds. That is the baseline.',
      "Narrow your stance, or shift your front foot forward until your heel is level with your back foot's toes. Hold again.",
      'Stand on something slightly unstable under your heels only — a rolled-up mat or a shoe on its side works as well as gym equipment. Hold again.',
      'Only move to the next step once the current one holds steady for the full 30 seconds within a few tries. If it never settles, you have gone one step too far — drop back.',
      'Finish every session on flat, stable ground so the last thing your body learns is the position you actually compete in.',
    ],
    minutes: 15,
    frequency: '2–3× per week if standing is a weak point, otherwise weekly',
    addresses: ['wide_group', 'standing_gap'],
    dryFire: true,
  },
  {
    id: 'unstable-support',
    name: 'Unstable elbow support',
    purpose: 'Find out how much of your prone stability is coming from the ground rather than your own position.',
    steps: [
      'Build your normal prone position and note how still the sight sits.',
      'Put a rolled towel or small cushion under your front elbow only, just enough to make it slightly unlevel, and rebuild the position on top of it.',
      'Hold for 30 seconds. The sight will move more at first — that gap is exactly what a bad mat or an off-camber lane does to you on race day.',
      'Repeat with the cushion under the back elbow instead, then under both.',
      'Work until the wobble on the unstable surface looks close to the wobble on flat ground.',
    ],
    minutes: 15,
    frequency: '2× per week, dry',
    addresses: ['wide_group', 'fatigue_drift'],
    dryFire: true,
  },
  {
    id: 'resistance-pull',
    name: 'Resistance-band hold',
    purpose: 'Train the position to stay quiet under a disturbing force, the way sling tension and recoil disturb it for real.',
    steps: [
      'Loop a light resistance band around the rifle and anchor the other end to something fixed, or have a partner hold it.',
      'Build your position and aim in, then have the band apply a light steady pull — across the line of fire, then along it, then from the front.',
      'Hold the sight on target against the pull for 20–30 seconds without muscling it back with your arms; let your position, not your strength, resist it.',
      'Increase the pull only once you can hold dead still against the current one.',
      'Finish with a few holds at zero tension to reset to the feeling of the position without the band.',
    ],
    minutes: 15,
    frequency: '2× per week, dry',
    addresses: ['vertical_stringing', 'wide_group'],
    dryFire: true,
  },
  {
    id: 'incline-shooting',
    name: 'Shoot on a slope',
    purpose: 'Build a position that survives the uphill and downhill lanes a real course puts you on.',
    steps: [
      'Find or build even a shallow slope — a grass bank, a folded mat under one side of a mattress, anything with a consistent tilt.',
      'Build your normal position across the slope and note where the natural point of aim lands before you correct anything.',
      'Adjust only your legs and hips to bring it back on target prone, or your stance width and knee bend standing — never fight it with your arms or shoulders.',
      'Shoot or dry-fire a full bout there before returning to flat ground.',
      'Repeat facing the opposite way so you build the correction for both uphill and downhill.',
    ],
    minutes: 20,
    frequency: 'Once a slope is available, otherwise skip',
    addresses: ['unstable_npa', 'wide_group'],
    dryFire: true,
  },
  {
    id: 'position-build',
    name: 'Repeat position builds',
    purpose: 'Make the position land in the same place every time, so the group centre stops moving.',
    steps: [
      'Stand up, sling off, rifle down. Fully out of position.',
      'Build the position from scratch against a stopwatch. Aim for under 20 seconds prone.',
      'Without adjusting, note where the sight sits relative to the target.',
      'Break down completely and rebuild. Ten repetitions.',
      'The goal is not speed — it is ten builds that all point at the same place.',
    ],
    minutes: 20,
    frequency: '3× per week, dry',
    addresses: ['unstable_npa', 'fatigue_drift', 'standing_gap'],
    dryFire: true,
  },
  {
    id: 'range-entry',
    name: 'Range entry routine',
    purpose: 'Make the first shot after skiing as good as the fifth.',
    steps: [
      'Fix a routine and never vary it: rifle off on the approach, mat, sling, magazine, position, breathe, shoot.',
      'Ski two minutes hard, then run the routine. Do not fire until the routine is complete.',
      'Give shot 1 one extra breath cycle over shots 2–5. It is the shot you have least information about.',
      'Ten repetitions of ski-in and routine, of which five end in live shots.',
      'Time from mat to first shot should be the same every rep, whatever your heart rate.',
    ],
    minutes: 30,
    frequency: '2× per week',
    addresses: ['cold_first_shot', 'unstable_npa'],
    dryFire: false,
  },
  {
    id: 'combo-intervals',
    name: 'Combo intervals at race heart rate',
    purpose: 'Shoot at the heart rate you will actually race at, instead of the one you practise at.',
    steps: [
      'Ski a 1.5 km loop hard enough that you cannot hold a conversation.',
      'Come straight into the range and shoot five prone. No recovery pause.',
      'Ski the loop again, shoot five standing.',
      'Five rounds of this. Record hit count and heart rate on entry for every bout in this app.',
      'Compare the numbers with your calm-range bouts — the gap is the thing you are training away.',
    ],
    minutes: 60,
    frequency: '1–2× per week',
    addresses: ['cold_first_shot', 'standing_gap', 'solid'],
    dryFire: false,
  },
  {
    id: 'standing-volume',
    name: 'Standing volume block',
    purpose: 'Close a standing-versus-prone gap that is caused by practice time, not technique.',
    steps: [
      'For four weeks, shoot two standing bouts for every prone bout.',
      'Half of them dry, at home, against a scaled target on a wall at 5 m.',
      'Every standing bout gets logged here, good or bad. Especially bad.',
      'Add the timed holds drill on the days you do not shoot live.',
      'Re-check the gap in this app at the end of the block.',
    ],
    minutes: 30,
    frequency: '4-week block',
    addresses: ['standing_gap', 'wide_group'],
    dryFire: true,
  },
  {
    id: 'shot-plan',
    name: 'Written shot plan',
    purpose: 'Stop the one rushed shot per bout by removing the decision from the moment.',
    steps: [
      'Write out, on paper, the exact sequence you will follow for one shot. Six steps at most.',
      'Include an abort rule: if the sight has not settled by your count, you come off and restart. No exceptions.',
      'Read it before every bout for two weeks.',
      'After each bout, mark any shot where you departed from the plan.',
      'The measure of success is fewer departures, not a better score.',
    ],
    minutes: 10,
    frequency: 'Every session for two weeks',
    addresses: ['flier', 'cold_first_shot'],
    dryFire: true,
  },
  {
    id: 'progression',
    name: 'Add pressure',
    purpose: 'Once nothing is broken, the next gain is speed and heart rate, not accuracy drills.',
    steps: [
      'Put a clock on it: 5 shots prone inside 30 seconds from the mat, 5 standing inside 25.',
      'Shoot for consequence — a penalty loop for every miss, actually skied.',
      'Introduce a competitor, even an imaginary one on a second lane.',
      'Keep logging. If hit rate falls more than 20% under time pressure, back off the clock and rebuild.',
    ],
    minutes: 45,
    frequency: '1× per week',
    addresses: ['solid'],
    dryFire: false,
  },
]

export interface Recommendation {
  drill: Drill
  /** Why this drill, for this athlete, right now. */
  reason: string
  /** Higher first. */
  score: number
}

const SEVERITY_WEIGHT = { priority: 3, watch: 1.6, info: 0.6 } as const

/**
 * Rank drills against the findings.
 *
 * A drill scores for every finding it addresses, weighted by how serious that
 * finding is and how much evidence sits behind it. Capped at six so a beginner
 * gets a training week, not a reading list.
 */
export function recommend(findings: Finding[], limit = 6): Recommendation[] {
  if (findings.length === 0) return []

  const byId = new Map<FindingId, Finding>()
  for (const f of findings) {
    const existing = byId.get(f.id)
    if (!existing || f.confidence > existing.confidence) byId.set(f.id, f)
  }

  const scored: Recommendation[] = []
  for (const drill of DRILLS) {
    let score = 0
    const causes: Finding[] = []
    for (const id of drill.addresses) {
      const f = byId.get(id)
      if (!f) continue
      score += SEVERITY_WEIGHT[f.severity] * f.confidence
      causes.push(f)
    }
    if (score <= 0) continue
    causes.sort((a, b) => SEVERITY_WEIGHT[b.severity] * b.confidence - SEVERITY_WEIGHT[a.severity] * a.confidence)
    scored.push({
      drill,
      score,
      reason: causes.map((c) => c.title.toLowerCase()).slice(0, 2).join(', and '),
    })
  }

  // A zero problem outranks everything: there is no point drilling technique
  // against a sight that is pointing somewhere else.
  if (byId.has('zero_offset')) {
    for (const r of scored) if (r.drill.addresses.includes('zero_offset')) r.score += 10
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}
