import type { FindingId } from './types'
import type { SeasonPhase } from './seasonPhase'

/**
 * The shooting library: advice for athletes and coaches, drawn from the IBU's
 * own publications and organised by the time of year and what it is for.
 *
 * Every entry is written here in our own words, from the sources listed below,
 * and cites them. It summarises and points to the originals; it does not
 * reproduce them. The IBU has not reviewed or endorsed it.
 */

/** The schematic an entry can carry: see LibraryDiagrams. */
export type DiagramId = 'breath-cycle' | 'aiming-approaches' | 'trigger-curve' | 'range-approach'

export type SourceKind = 'research' | 'review' | 'interview' | 'catalogue' | 'practice'

export interface Source {
  id: string
  /** As cited: "Krüger, A., Harbour, E., & Finkenzeller, T." */
  authors: string
  year: number
  title: string
  /** Where it appeared, with the issue: "Journal of Biathlon Coaching, Issue 5". */
  venue: string
  pages?: string
  /** DOI suffix after 10.71006/, where there is one. */
  doi?: string
  /** The page to read the original on. */
  url: string
  kind: SourceKind
}

const JOURNAL = 'https://www.ibuacademy.com/science/journal'
const journalUrl = (issuePath: string, doiSuffix: string) =>
  `${JOURNAL}/${issuePath}/article/journal-article-10.71006${doiSuffix}`

export const SOURCES: Source[] = [
  {
    id: 'krueger2026', authors: 'Krüger, A., Harbour, E., & Finkenzeller, T.', year: 2026,
    title: 'Breathing patterns in biathlon shooting: Stability as the key to accuracy',
    venue: 'Journal of Biathlon Coaching, Issue 5 (February 2026)', pages: '26-29', doi: 'pmcs3564',
    url: journalUrl('issue-5-february-2026', 'pmcs3564'), kind: 'research',
  },
  {
    id: 'heinrich2025', authors: 'Heinrich, A., Ahrens, M., & Finkenzeller, T.', year: 2025,
    title: 'Attentional processes in biathlon shooting',
    venue: 'Journal of Biathlon Coaching, Issue 3 (January 2025)', pages: '24-27', doi: 'yftc5525',
    url: journalUrl('journal-issue-3-january-2025', 'yftc5525'), kind: 'review',
  },
  {
    id: 'koykka2024', authors: 'Köykkä, M.', year: 2024,
    title: 'Optimising biathlon standing shooting: insights into aiming strategies',
    venue: 'Journal of Biathlon Coaching, Issue 2 (July 2024)', pages: '26-29', doi: 'dhfa7074',
    url: journalUrl('journal-issue-2-july-2024', 'dhfa7074'), kind: 'research',
  },
  {
    id: 'becker2024', authors: 'Becker, J., & Cobb, T.', year: 2024,
    title: 'Role of core stability in biathlon shooting',
    venue: 'Journal of Biathlon Coaching, Issue 1 (January 2024)', pages: '6-9', doi: 'nbxe9687',
    url: journalUrl('journal-issue-1-January-2024', 'nbxe9687'), kind: 'research',
  },
  {
    id: 'koykka2026', authors: 'Köykkä, M., Sattlecker, G., & Laaksonen, M.', year: 2026,
    title: 'From research to practice: Optimising shooting performance in elite biathlon',
    venue: 'Journal of Biathlon Coaching, Issue 6 (June 2026)', pages: '28-33', doi: 'VDOL4813',
    url: journalUrl('issue-6-june-2026', 'VDOL4813'), kind: 'interview',
  },
  {
    id: 'chabloz2026', authors: 'Sattlecker, G. (interview with J.-M. Chabloz)', year: 2026,
    title: 'From preparation to performance: Jean-Marc Chabloz’s learnings from Milano Cortina 2026',
    venue: 'Journal of Biathlon Coaching, Issue 6 (June 2026)', pages: '6-9', doi: 'HHGV1360',
    url: journalUrl('issue-6-june-2026', 'HHGV1360'), kind: 'interview',
  },
  {
    id: 'laaksonen2026', authors: 'Laaksonen, M. S.', year: 2026,
    title: 'Performance determinants across different biathlon competitions',
    venue: 'Journal of Biathlon Coaching, Issue 5 (February 2026)', pages: '14-17', doi: 'trnn7439',
    url: journalUrl('issue-5-february-2026', 'trnn7439'), kind: 'review',
  },
  {
    id: 'kock2025', authors: 'Kock, H.', year: 2025,
    title: 'Training progression from junior to senior levels in biathlon',
    venue: 'Journal of Biathlon Coaching, Issue 4 (September 2025)', pages: '6-7', doi: 'sgmv2318',
    url: journalUrl('issue-4-september-2025', 'sgmv2318'), kind: 'research',
  },
  {
    id: 'mujika2025', authors: 'Mujika, I.', year: 2025,
    title: 'Tapering and peaking for biathlon competition',
    venue: 'Journal of Biathlon Coaching, Issue 3 (January 2025)', pages: '18-22', doi: 'skip4500',
    url: journalUrl('journal-issue-3-january-2025', 'skip4500'), kind: 'review',
  },
  {
    id: 'mazet2024', authors: 'Sattlecker, G. (interview with S. Mazet)', year: 2024,
    title: 'Siegfried Mazet speaks about race preparation',
    venue: 'Journal of Biathlon Coaching, Issue 1 (January 2024)', pages: '12-13', doi: 'qigu2910',
    url: journalUrl('journal-issue-1-January-2024', 'qigu2910'), kind: 'interview',
  },
  {
    id: 'flunger2024', authors: 'Sattlecker, G. (interview with S. Flunger)', year: 2024,
    title: 'Sandra Flunger speaks about Swiss team preparation for Milano Cortina 2026',
    venue: 'Journal of Biathlon Coaching, Issue 2 (July 2024)', pages: '10-11', doi: 'czhe1498',
    url: journalUrl('journal-issue-2-july-2024', 'czhe1498'), kind: 'interview',
  },
  {
    id: 'heinrich2024', authors: 'Heinrich, A.', year: 2024,
    title: 'Ready, Set, Go! Mental preparation for competitions',
    venue: 'Journal of Biathlon Coaching, Issue 1 (January 2024)', pages: '18-19', doi: 'ksrw3471',
    url: journalUrl('journal-issue-1-January-2024', 'ksrw3471'), kind: 'practice',
  },
  {
    id: 'catalogue2018', authors: 'Sattlecker, G., Edfelder, J., & Gressenbauer, C.', year: 2018,
    title: 'Exercise catalogue for biathlon shooting',
    venue: 'International Biathlon Union', doi: undefined,
    url: 'https://assets.ctfassets.net/cz0vl36hcq0x/3RMdjEsUhuBaZdzEvkyHna/f11b17a812f741d582b6a586e87918de/IBU_Exercise_Catalogue_for_Biathlon_Shooting_.pdf',
    kind: 'catalogue',
  },
]

export const sourceById = (id: string): Source | undefined => SOURCES.find((s) => s.id === id)

export type Focus =
  | 'breathing' | 'stability' | 'aiming' | 'trigger' | 'attention' | 'composure'
  | 'arrival' | 'efficiency' | 'season' | 'equipment' | 'tactics' | 'technique'

export const FOCUS_LABEL: Record<Focus, string> = {
  breathing: 'Breathing', stability: 'Stability', aiming: 'Aiming', trigger: 'Trigger',
  attention: 'Attention', composure: 'Composure', arrival: 'Arriving at the range',
  efficiency: 'Range time', season: 'Season plan', equipment: 'Rifle fit', tactics: 'Race tactics',
  technique: 'Technique',
}

/** How firm the ground is: research with data, an exercise from the IBU's own
 *  catalogue, or what coaches report from practice. */
export type Evidence = 'research' | 'catalogue' | 'practice'

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  research: 'Research', catalogue: 'IBU exercise', practice: 'Coach experience',
}

export interface LibraryEntry {
  id: string
  title: string
  /** Phases of the year it suits. */
  phases: SeasonPhase[]
  focus: Focus
  position: 'prone' | 'standing' | 'both'
  /** What it says, in our words. */
  summary: string
  /** A small schematic that shows the idea. */
  diagram?: DiagramId
  /** What to do about it: short steps or a cue. */
  doThis?: string[]
  /** Anything that has to be said before trying it. */
  safety?: string
  /** For the coach reading it. */
  coachNote?: string
  evidence: Evidence
  /** Source ids, with where in the source where useful. */
  sources: { id: string; where?: string }[]
}

const ALL: SeasonPhase[] = ['transition', 'general', 'specific', 'early', 'competition']
const NOT_TRANSITION: SeasonPhase[] = ['general', 'specific', 'early', 'competition']

export const ENTRIES: LibraryEntry[] = [
  // --- Breathing and stability
  {
    id: 'same-breath-prone', title: 'Same breath, every shot', phases: NOT_TRANSITION, focus: 'breathing', position: 'prone',
    diagram: 'breath-cycle',
    summary:
      'Prone, the steadier a shooter’s breathing pattern from one shot to the next, the higher the hit rate. In the study the elite athletes mostly released on the exhale (about three in four); the juniors mostly mid-breath. The exact point in the cycle can vary from person to person. What matters is choosing one and repeating it.',
    doThis: [
      'Pick the point in the breath at which you release: end of the exhale, or the pause after it.',
      'Dry or live, shoot five shots at that point and check that the pause before each one looks the same.',
      'Watch for the odd shot that drifts to a different point in the cycle: that is the one to fix.',
    ],
    evidence: 'research', sources: [{ id: 'krueger2026', where: 'pp. 26-27' }],
  },
  {
    id: 'not-on-the-inhale', title: 'Don’t release on the inhale', phases: NOT_TRANSITION, focus: 'breathing', position: 'standing',
    diagram: 'breath-cycle',
    summary:
      'Standing, shots released at the top of an inhale were rare but cost accuracy: about 13% overall and 23% among the junior athletes. Breathing in raises arousal and tension; breathing out settles the muscles and steadies the hold.',
    doThis: [
      'In dry work, release only on or after the exhale.',
      'If you notice you are on an inhale, come off and restart rather than force the shot.',
    ],
    evidence: 'research', sources: [{ id: 'krueger2026', where: 'p. 27' }],
  },
  {
    id: 'change-breathing-not-technique', title: 'Change the breathing, not the technique',
    phases: ['specific', 'early', 'competition'], focus: 'breathing', position: 'both',
    summary:
      'Position, rifle set-up, aiming, trigger control and follow-through should stay the same at every intensity. What changes with effort is the breathing: its timing and depth, while the last part of the breath before the shot stays the same.',
    doThis: [
      'At a higher heart rate, take deeper or extra breaths before the pause.',
      'Then run exactly the same final sequence into the shot as you do when calm.',
    ],
    evidence: 'practice', sources: [{ id: 'koykka2026', where: 'pp. 29-30' }],
  },
  {
    id: 'train-breathing-early', title: 'Train breathing as a skill, from early on', phases: ['general'], focus: 'breathing', position: 'both',
    summary:
      'Breathing deserves its own place in technical training, not an afterthought. It can be developed systematically, it can be measured or at least observed, and young athletes gain most from learning it early.',
    coachNote:
      'The study used wearable sensors. Without them, watch for a clear, flat pause in the breath before each shot and note whether it is the same shot to shot.',
    evidence: 'research', sources: [{ id: 'krueger2026', where: 'p. 29' }],
  },
  {
    id: 'core-stability-standing', title: 'Core stability for standing', phases: ['general', 'specific'], focus: 'stability', position: 'standing',
    summary:
      'Athletes whose torso was less steady when disturbed showed more body and rifle movement in the last half-second before the shot, and more so at a raised heart rate. Core stability here means holding the torso steady against a push, which is different from strength. Standing performance matters because it comes last in a race, with little time to recover.',
    doThis: [
      'Planks and their variants in strength sessions.',
      'Dry-fire holds that take the legs out: seated on an unstable surface, or pulling across and along the line of fire.',
    ],
    safety: 'Dry only.',
    coachNote:
      'An aim-trace device can stand in for a force plate, and a Y-balance test is a simple stand-in again. The authors note that research on how best to train this is still early.',
    evidence: 'research',
    sources: [{ id: 'becker2024', where: 'pp. 6-9' }, { id: 'catalogue2018', where: 'pp. 18, 21-22, 56-59' }],
  },
  {
    id: 'standing-balance', title: 'Standing balance work', phases: ['general'], focus: 'stability', position: 'standing',
    summary:
      'Balance is one of the main coordination skills in biathlon, and any unintended movement of the body passes to the rifle. The catalogue builds instability in small steps: a staggered stance, heel and toe variations, heels on a low beam, an unstable sole.',
    doThis: [
      'Front heel level with the toes of the back foot; hold the shooting position; swap feet.',
      'Try weight on the toes, then on the heels, then one heel and the opposite toes.',
      'Heels on a pool noodle or low beam; hold the position without touching the floor.',
      'Move on only when the current step holds steady for 30 to 45 seconds.',
    ],
    safety: 'Dry only. Mind your footing on unstable surfaces.',
    evidence: 'catalogue', sources: [{ id: 'catalogue2018', where: 'pp. 12-17' }],
  },
  {
    id: 'rifle-stability-under-load', title: 'Rifle stability under load', phases: ['general', 'specific'], focus: 'stability', position: 'both',
    summary:
      'Hold the aim on the target while something disturbs the rifle: a band pulling from the front or from above, a weight hanging from the barrel, or shooting prone without the sling. Change the pull once the aim is steady, so the body learns to resist a disturbance.',
    doThis: [
      'Build the position and hold the aim steady with no load.',
      'Add a light pull, then change its direction or strength once it holds.',
      'Finish with holds at zero tension.',
    ],
    safety: 'Dry only. Never fire live ammunition with a band attached to the rifle.',
    evidence: 'catalogue', sources: [{ id: 'catalogue2018', where: 'pp. 54-64' }],
  },
  // --- Aiming (standing)
  {
    id: 'hold-or-timing', title: 'Know your aiming approach: hold or timing', phases: ['general', 'specific'], focus: 'aiming', position: 'standing',
    diagram: 'aiming-approaches',
    summary:
      'Standing, shooters approach the target in one of two ways. A holder settles the aim inside the hit area and triggers just after it stabilises. A timer comes in straight and triggers while the aim is still moving towards the centre, without fully settling. Both work, and neither was found better. What matters is that the athlete knows which they use and practises that one, in light and hard sessions alike, because switching to the other in a race rarely works.',
    evidence: 'research', sources: [{ id: 'koykka2024', where: 'pp. 26-29' }],
  },
  {
    id: 'hold-settle-or-reset', title: 'If you hold: settle, trigger, or come off', phases: ['general', 'specific'], focus: 'aiming', position: 'standing',
    summary:
      'Holding longer and longer tends to make things worse, especially when the breath is held under effort. Learn to trigger just after the aim settles. If the picture is poor, come off, breathe, and approach again.',
    doThis: ['Static holds on a target, with variations.', 'Practise stopping the aim-point movement, then triggering.'],
    evidence: 'practice', sources: [{ id: 'koykka2024', where: 'pp. 28-29' }],
  },
  {
    id: 'timing-controlled-approach', title: 'If you time it: a controlled approach', phases: ['general', 'specific'], focus: 'aiming', position: 'standing',
    summary:
      'Come in straight, slow the aim as it nears the centre, and trigger when it is inside but still moving. Do not throw the aim in and pull, and do not start far from the target: both lead to long breath holds and uncontrolled approaches, especially on the first shot.',
    doThis: [
      'Follow a line with the aim; speed up and slow down the aim point on purpose.',
      'Practise the timing with the rifle supported, to feel the right moment.',
    ],
    evidence: 'practice', sources: [{ id: 'koykka2024', where: 'p. 28' }],
  },
  // --- Trigger
  {
    id: 'trigger-plateau', title: 'Trigger plateau', phases: ['general', 'specific'], focus: 'trigger', position: 'both',
    diagram: 'trigger-curve',
    summary:
      'Take 80 to 90% of the trigger weight quickly and smoothly, then stop on that plateau. The less force and movement left before the break, the less the rifle is disturbed. From the plateau, add a slight, steady increase until the shot breaks, then take the finger off quickly but without a jerk.',
    doThis: ['Dry, on the aiming point: quick first stage to the plateau, hold, then press through.', 'Twenty repetitions, then two or three normal live series.'],
    evidence: 'catalogue', sources: [{ id: 'catalogue2018', where: 'pp. 65-66' }],
  },
  {
    id: 'trigger-variations', title: 'Vary the trigger, and feel it with your eyes closed', phases: ['general', 'specific'], focus: 'trigger', position: 'both',
    summary:
      'Vary the trigger inside a session so the shot does not depend on one familiar feel: eyes closed to feel the movement and the weight, different glove thicknesses and none, and the three kinds of pre-shot pull (plateau, steady linear increase, a jerk). End every trigger session with a few normal triggers or two or three normal series.',
    safety: 'If trigger weight is changed, have a coach or armourer do it and stay within the rules of your rifle.',
    evidence: 'catalogue', sources: [{ id: 'catalogue2018', where: 'pp. 67-68' }],
  },
  // --- Attention and composure
  {
    id: 'narrow-external-focus', title: 'Narrow external focus', phases: NOT_TRANSITION, focus: 'attention', position: 'both',
    summary:
      'Research on motor skills favours an external focus (the target and the effect of the shot) over an internal one (breath, finger, body). At the mat, the best focus is narrow and on the target: find the first target before the rifle comes to the eye, find it again straight away through the sight, and keep your eye on it through the trigger and follow-through until the paddle falls.',
    doThis: [
      'Use a cue to start the focus: closing the bolt, or a word such as "go", "now" or "black".',
      'Blink while bolting, not during the aim; track the targets, not the sights.',
      'Keep peak focus on the target at the moment of the trigger pull.',
    ],
    coachNote: 'The research base on gaze (the "quiet eye") in biathlon is mixed. The advice rests on the wider motor-learning evidence and coaching practice.',
    evidence: 'research', sources: [{ id: 'heinrich2025', where: 'pp. 24-26' }],
  },
  {
    id: 'refocus-with-a-breath', title: 'Re-focus: a breath, then back on the target', phases: NOT_TRANSITION, focus: 'attention', position: 'both',
    summary:
      'After a blink, a lapse, an eye wobble or several misses, hold the gaze longer or reset. A deliberate breath is one way to bring attention back. On days when focus comes easily you may shoot a little faster; on days it does not, take longer. The shot can still be clean.',
    evidence: 'practice', sources: [{ id: 'heinrich2025', where: 'p. 26' }],
  },
  {
    id: 'practise-acceptance', title: 'Practise acceptance', phases: ['specific', 'early', 'competition'], focus: 'composure', position: 'both',
    summary:
      'Athletes who accept a miss, a wind shift or an early mistake, and let it go, recover faster and shoot the next bout better. Acceptance does not mean giving up. It can be trained by rehearsing setbacks on purpose. Reminding an athlete of similar moments they handled before also helps, and one miss is allowed.',
    coachNote: 'Keep instructions short and clear. The aim is to give security, not more to think about.',
    evidence: 'practice', sources: [{ id: 'chabloz2026', where: 'pp. 7-9' }, { id: 'mazet2024', where: 'p. 12' }],
  },
  {
    id: 'mental-pre-start', title: 'A mental pre-start routine, and imagery', phases: ['specific', 'early', 'competition'], focus: 'composure', position: 'both',
    summary:
      'Alongside the visible routine, write a plan for where the focus should be (wide or narrow), when to raise or lower arousal, and which tools to use (self-talk, breathing, music, imagery). For imagery, rehearse the first shooting bout in the first person and in real time, from the last 50 metres on skis to leaving the mat, using all the senses.',
    doThis: ['Practise the routine in test events, then review it and adapt it.'],
    evidence: 'practice', sources: [{ id: 'heinrich2024', where: 'pp. 18-19' }],
  },
  // --- Range approach and efficiency
  {
    id: 'range-approach-skill', title: 'The range approach is a skill', phases: ['specific', 'early', 'competition'], focus: 'arrival', position: 'both',
    diagram: 'range-approach',
    summary:
      'Arrive with your breathing feeling normal and under control. Ease the pace over the last 200 to 300 metres to get there. Skiing in too hard increased rifle movement, lengthened aiming time and slowed heart-rate recovery. Add a short mental shift to the present moment and a read of the conditions.',
    evidence: 'practice', sources: [{ id: 'koykka2026', where: 'pp. 30-31' }],
  },
  {
    id: 'own-entry-speed', title: 'Find your own entry speed', phases: ['specific', 'early', 'competition'], focus: 'arrival', position: 'both',
    summary:
      'Some athletes shoot best entering fast, others with a controlled entry. Find which suits you, and hold your own plan when racing head to head rather than reacting to the athlete beside you.',
    coachNote: 'Look at shot results against heart rate on entry to see which profile fits.',
    evidence: 'practice', sources: [{ id: 'chabloz2026', where: 'p. 7' }],
  },
  {
    id: 'rehearse-entry-and-exit', title: 'Rehearse the entry and exit until every step is controlled', phases: ['specific', 'early'], focus: 'arrival', position: 'both',
    summary:
      'Adjust the rifle to you and the range, zero it carefully in calm, windless conditions, and practise the approach to the range and the exit until every step is under control. One team’s target was the first prone shot within about 15 seconds of arriving and the first standing shot within about 12.',
    evidence: 'practice', sources: [{ id: 'koykka2026', where: 'p. 30' }, { id: 'mazet2024', where: 'p. 12' }],
  },
  {
    id: 'shooting-efficiency', title: 'Shooting efficiency, not only accuracy', phases: ['specific', 'early', 'competition'], focus: 'efficiency', position: 'both',
    summary:
      'Range time is now a decisive factor: the best athletes combine high accuracy with short range times. Build speed into the shot process from a young age, alongside stability and accuracy, so it holds under race stress rather than being added later.',
    coachNote: 'Speed follows steadiness. Do not rush an unstable shot.',
    evidence: 'practice', sources: [{ id: 'chabloz2026', where: 'pp. 7, 9' }, { id: 'laaksonen2026', where: 'pp. 14-17' }],
  },
  // --- Season structure
  {
    id: 'foundations-at-rest', title: 'Foundations first, at rest', phases: ['general'], focus: 'season', position: 'both',
    summary:
      'Technical shooting at rest comes first, with a high number of precision shots, and physical load is added step by step. Senior biathletes in the data fired about 12,000 to 22,000 shots a year, 60 to 70% of them combined with endurance training. The number of precision shots stayed similar from junior to senior, so quiet technical shooting never stops mattering.',
    evidence: 'research', sources: [{ id: 'kock2025', where: 'pp. 6-7' }],
  },
  {
    id: 'build-load-when-steady', title: 'Build load only when it is steady', phases: ['general', 'specific'], focus: 'season', position: 'both',
    summary:
      'Move from shooting at rest, to low intensity, to race intensity in steps. A drill that cannot be held steady for 30 to 45 seconds after a few tries is too hard for today. After six to eight weeks of real progress, make it harder. One coach’s summary of the year: shooting needs the same kind of periodisation as fitness, easy and long, intense and short, and recovery as well.',
    evidence: 'catalogue', sources: [{ id: 'catalogue2018', where: 'pp. 9-11' }, { id: 'koykka2026', where: 'p. 29' }],
  },
  {
    id: 'shooting-under-load', title: 'Shooting under load', phases: ['specific'], focus: 'season', position: 'both',
    summary:
      'Once the basics are stable, add combo training with shooting a little beyond race intensity, and find ways to challenge the athlete that keep skiing and shooting together at a high level.',
    evidence: 'practice', sources: [{ id: 'flunger2024', where: 'p. 11' }, { id: 'koykka2026', where: 'pp. 29-30' }],
  },
  {
    id: 'experiment-then-repeat', title: 'From experimenting to repeating', phases: ['early', 'competition'], focus: 'season', position: 'both',
    summary:
      'As the racing season nears, the emphasis moves from trying new things to repeating established routines and building confidence under race conditions.',
    evidence: 'practice', sources: [{ id: 'koykka2026', where: 'p. 29' }],
  },
  {
    id: 'taper-keep-shooting', title: 'Taper and race week', phases: ['competition'], focus: 'season', position: 'both',
    summary:
      'A taper cuts training volume (by about 41 to 60%) but keeps intensity, and keeps frequency within about 20% of normal so technique stays sharp: keep shooting in the taper. The day before a race is the key day: a short strategy meeting, a test of the track and the range entry at race speed, and a check of what heart rate still allows good shooting.',
    evidence: 'research', sources: [{ id: 'mujika2025', where: 'pp. 18-19' }, { id: 'mazet2024', where: 'p. 12' }],
  },
  {
    id: 'race-day-say-little', title: 'Race day: say little, trust the routine', phases: ['early', 'competition'], focus: 'composure', position: 'both',
    summary:
      'On race day give only the essentials (the zero, the wind), because the important information should have been given the day before. After a miss, remind the athlete of earlier races in which they handled something similar.',
    coachNote: 'More talk adds stress. Be more secure than the athlete is.',
    evidence: 'practice', sources: [{ id: 'mazet2024', where: 'pp. 12-13' }],
  },
  {
    id: 'which-shooting-counts', title: 'Which shooting counts most in each race', phases: ['early', 'competition'], focus: 'tactics', position: 'both',
    summary:
      'Sprint: standing shooting and standing range time. Individual: overall accuracy, because every miss costs a minute. Pursuit and mass start: the last standing stage has the strongest link to the podium, and one extra miss pushes many athletes out of the podium group. Do not spend the spare rounds early in prone, and do not speed up because a rival is a faster shooter. Relay: reliable shooting and short range times matter most on legs two and four for women.',
    evidence: 'research', sources: [{ id: 'laaksonen2026', where: 'pp. 14-17' }, { id: 'mazet2024', where: 'p. 13' }],
  },
  {
    id: 'new-venue-or-altitude', title: 'A new venue, or altitude', phases: ['specific', 'early'], focus: 'arrival', position: 'both',
    summary:
      'Expect the range to feel different. Accept more movement in the rifle, take two or three extra breaths before starting, check natural point of aim and rifle settings, and practise the entry into the range at the venue.',
    evidence: 'practice', sources: [{ id: 'mazet2024', where: 'p. 13' }, { id: 'chabloz2026', where: 'p. 6' }, { id: 'koykka2026', where: 'p. 31' }],
  },
  {
    id: 'rifle-fit', title: 'Fit the rifle to the athlete, with care', phases: ['transition', 'general', 'specific'], focus: 'equipment', position: 'both',
    summary:
      'Cheekpiece, hand stop, grip, butt plate (and the standing grip), sight set-up and natural point of alignment can all be tuned to the athlete for comfort, alignment and stability. Zero in calm, windless conditions. Coaches mostly kept to small, step-by-step changes, tested only where an improvement was expected, and avoided big changes before key races.',
    coachNote: 'This is a checklist for athlete and coach. The app cannot see rifle set-up.',
    evidence: 'practice', sources: [{ id: 'koykka2026', where: 'pp. 30-31' }],
  },
  {
    id: 'feedback-with-autonomy', title: 'Feedback with athlete autonomy', phases: ALL, focus: 'technique', position: 'both',
    summary:
      'Combine objective feedback with the athlete’s own say. Some athletes want detail and demonstration, others do better with room to reflect. Step in on an athlete’s own style only when it hurts stability, wind management or consistency.',
    coachNote: 'The numbers in this app are the objective part. How much to say about them is the coaching.',
    evidence: 'practice', sources: [{ id: 'koykka2026', where: 'p. 29' }],
  },
]

/** Which library entries each advice finding opens, so the advice leads into the
 *  library without leaving the app. */
export const FINDING_LIBRARY: Partial<Record<FindingId, string[]>> = {
  zero_offset: ['rifle-fit'],
  vertical_stringing: ['same-breath-prone', 'rifle-stability-under-load', 'narrow-external-focus'],
  horizontal_stringing: ['rifle-stability-under-load', 'standing-balance', 'core-stability-standing'],
  trigger_bias: ['trigger-plateau', 'trigger-variations', 'narrow-external-focus'],
  wide_group: ['core-stability-standing', 'standing-balance', 'rifle-stability-under-load', 'hold-or-timing'],
  flier: ['narrow-external-focus', 'refocus-with-a-breath', 'trigger-plateau'],
  cold_first_shot: ['change-breathing-not-technique', 'range-approach-skill', 'own-entry-speed', 'rehearse-entry-and-exit'],
  fatigue_drift: ['core-stability-standing', 'rifle-stability-under-load', 'build-load-when-steady'],
  unstable_npa: ['standing-balance', 'rifle-fit'],
  standing_gap: ['not-on-the-inhale', 'core-stability-standing', 'standing-balance', 'hold-or-timing'],
  wind_sensitivity: ['new-venue-or-altitude', 'rifle-fit'],
  no_standout: ['foundations-at-rest', 'build-load-when-steady', 'narrow-external-focus'],
  solid: ['shooting-under-load', 'shooting-efficiency'],
  metal_standing_gap: ['not-on-the-inhale', 'core-stability-standing', 'standing-balance', 'hold-or-timing'],
  metal_standing_volume: ['foundations-at-rest', 'standing-balance'],
  metal_one_disc: ['rifle-fit', 'hold-or-timing'],
  metal_scattered: ['same-breath-prone', 'core-stability-standing', 'rifle-stability-under-load'],
  metal_late_discs: ['hold-settle-or-reset', 'timing-controlled-approach', 'refocus-with-a-breath'],
  metal_first_disc: ['range-approach-skill', 'rehearse-entry-and-exit', 'change-breathing-not-technique'],
  metal_miss_streaks: ['refocus-with-a-breath', 'practise-acceptance', 'narrow-external-focus'],
  metal_intensity_drop: ['change-breathing-not-technique', 'range-approach-skill', 'own-entry-speed'],
  metal_race_gap: ['practise-acceptance', 'mental-pre-start', 'experiment-then-repeat'],
}

export const entriesForFinding = (id: FindingId): LibraryEntry[] =>
  (FINDING_LIBRARY[id] ?? []).map((eid) => ENTRIES.find((e) => e.id === eid)).filter((e): e is LibraryEntry => !!e)

/** The entries for a phase of the year, then everything else. */
export const entriesForPhase = (phase: SeasonPhase): LibraryEntry[] => ENTRIES.filter((e) => e.phases.includes(phase))

/** A reference in the form it is cited: "Krüger, A., Harbour, E., & Finkenzeller, T. (2026). Title. Venue, pp. 26-29." */
export function formatReference(s: Source): string {
  const pages = s.pages ? `, pp. ${s.pages}` : ''
  return `${s.authors} (${s.year}). ${s.title}. ${s.venue}${pages}.`
}

/** A short in-text citation: "Krüger et al. (2026)". */
export function shortCitation(s: Source): string {
  const lead = s.authors.split(',')[0].split('(')[0].trim()
  const many = /&|\band\b/.test(s.authors) || s.authors.split('.,').length > 1
  return `${lead}${many ? ' et al.' : ''} (${s.year})`
}
