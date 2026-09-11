import type { Bout, Finding, Position, Settings, SightCorrection } from './types'
import { HIT_ZONE_MM } from './types'
import { centroid, degreesFromVertical, sightCorrection } from './geometry'

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const fraction = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : 0)
const mm = (v: number) => `${Math.abs(v).toFixed(0)} mm`

/** Sample-size damping: one bout is an anecdote, four is a pattern. */
const weight = (n: number) => Math.min(1, n / 4)

const clicks = (n: number, dir: string) => `${n} click${n === 1 ? '' : 's'} ${dir}`

function describeCorrection(c: SightCorrection): string {
  const moves = [
    c.vertical > 0 ? clicks(c.vertical, c.verticalDir) : '',
    c.horizontal > 0 ? clicks(c.horizontal, c.horizontalDir) : '',
  ].filter(Boolean)
  return moves.length ? `Move the sight ${moves.join(' and ')}` : 'The sight is close enough to leave alone'
}

function describeOffset(x: number, y: number): string {
  const parts: string[] = []
  if (Math.abs(y) >= 2) parts.push(`${mm(y)} ${y > 0 ? 'high' : 'low'}`)
  if (Math.abs(x) >= 2) parts.push(`${mm(x)} ${x > 0 ? 'right' : 'left'}`)
  return parts.length ? parts.join(' and ') : 'on centre'
}

/**
 * Turn a run of bouts into coaching findings.
 *
 * Every rule reads the same way: a measurable signature, the cause it most
 * often means for a novice, and how much of the history it rests on. Rules stay
 * deliberately conservative — telling a beginner they jerk the trigger when the
 * real fault is a sight two clicks off is worse than saying nothing.
 */
export function analyse(bouts: Bout[], settings: Settings): Finding[] {
  const findings: Finding[] = []
  if (bouts.length === 0) return findings

  for (const position of ['prone', 'standing'] as Position[]) {
    const group = bouts.filter((b) => b.position === position)
    if (group.length === 0) continue
    findings.push(...analysePosition(group, position, settings))
  }

  findings.push(...comparePositions(bouts))

  const ranked = findings.sort(
    (a, b) => rank(b.severity) - rank(a.severity) || b.confidence - a.confidence,
  )

  if (ranked.every((f) => f.severity !== 'priority')) {
    const shots = bouts.reduce((n, b) => n + b.shots.length, 0)
    const perShot = shots ? bouts.reduce((n, b) => n + b.metrics.ringTotal, 0) / shots : 0
    if (perShot >= 8) {
      ranked.unshift({
        id: 'solid',
        title: 'Nothing broken — build volume',
        evidence: `${perShot.toFixed(1)} points a shot across ${bouts.length} bout${bouts.length === 1 ? '' : 's'}, with no dominant fault in the group shape.`,
        cause: 'The basics are holding. The gain now comes from doing this more often, faster, and with a higher heart rate rather than from fixing anything.',
        severity: 'info',
        confidence: weight(bouts.length),
        sampleSize: bouts.length,
        position: 'both',
      })
    }
  }
  return ranked
}

const rank = (s: Finding['severity']) => (s === 'priority' ? 2 : s === 'watch' ? 1 : 0)

function analysePosition(group: Bout[], position: Position, settings: Settings): Finding[] {
  const out: Finding[] = []
  const n = group.length
  const hitRadius = HIT_ZONE_MM[position] / 2
  const w = weight(n)
  const label = position === 'prone' ? 'prone' : 'standing'

  const mpis = group.map((b) => b.metrics.mpi)
  const avgMpi = centroid(mpis)
  const avgMpiOffset = Math.hypot(avgMpi.x, avgMpi.y)
  const avgMeanRadius = mean(group.map((b) => b.metrics.meanRadius))
  const avgAspect = mean(group.map((b) => b.metrics.ellipse.aspect))
  const verticalShare = fraction(
    group.map((b) => b.metrics.ellipse.aspect >= 1.5 && degreesFromVertical(b.metrics.ellipse.angleDeg) <= 30),
  )
  const horizontalShare = fraction(
    group.map((b) => b.metrics.ellipse.aspect >= 1.5 && degreesFromVertical(b.metrics.ellipse.angleDeg) >= 60),
  )

  // --- Zero before technique. A tight group in the wrong place is a sight job.
  if (avgMpiOffset > 0.35 * hitRadius && avgMeanRadius < 0.55 * hitRadius) {
    // Correct against the average of every bout in the window. Taking one
    // bout's correction would chase whichever group happened to be last.
    const c = sightCorrection(avgMpi, settings.mmPerClick)
    const pointsLost = mean(group.map((b) => b.metrics.ringTotalIfZeroed - b.metrics.ringTotal))
    out.push({
      id: 'zero_offset',
      title: `Rifle is off zero ${label}`,
      evidence: `Your ${label} group centres ${describeOffset(avgMpi.x, avgMpi.y)} of the ten across ${n} bout${n === 1 ? '' : 's'}, but the group itself is only ${mm(avgMeanRadius)} mean radius — tighter than the miss.${pointsLost >= 0.5 ? ` That is costing about ${pointsLost.toFixed(1)} points a bout.` : ''}`,
      cause: `The shooting is better than the score. ${describeCorrection(c)} before changing anything about technique.`,
      severity: avgMpiOffset > 0.6 * hitRadius ? 'priority' : 'watch',
      confidence: 0.9 * w,
      sampleSize: n,
      position,
    })
  }

  // --- Group shape. Which way the cloud is smeared names the fault.
  if (verticalShare >= 0.5 && avgAspect >= 1.5) {
    out.push({
      id: 'vertical_stringing',
      title: `Shots stringing vertically ${label}`,
      evidence: `${Math.round(verticalShare * 100)}% of your ${label} bouts produced a tall narrow group, averaging ${avgAspect.toFixed(1)}:1 taller than wide.`,
      cause:
        'Vertical spread is almost always timing: the shot is breaking at different points in the breathing cycle, or the position is held by muscle rather than bone so it creeps between shots.',
      severity: 'priority',
      confidence: 0.8 * w,
      sampleSize: n,
      position,
    })
  }

  if (horizontalShare >= 0.5 && avgAspect >= 1.5) {
    out.push({
      id: 'horizontal_stringing',
      title: `Shots stringing sideways ${label}`,
      evidence: `${Math.round(horizontalShare * 100)}% of your ${label} bouts produced a wide flat group, averaging ${avgAspect.toFixed(1)}:1 wider than tall.`,
      cause:
        position === 'prone'
          ? 'Sideways spread prone usually means the natural point of aim is off to one side, so you are steering the rifle back onto the target for every shot and it fights you.'
          : 'Sideways spread standing is balance: the sway is left-to-right and the shot is being released as it passes the target rather than when it settles.',
      severity: 'priority',
      confidence: 0.75 * w,
      sampleSize: n,
      position,
    })
  }

  // --- Trigger bias, but only once the group is too wide to blame the sight.
  const biasX = settings.handedness === 'right' ? -1 : 1
  const biasShare = fraction(
    group.map(
      (b) =>
        Math.sign(b.metrics.mpi.x) === biasX &&
        b.metrics.mpi.y < 0 &&
        Math.hypot(b.metrics.mpi.x, b.metrics.mpi.y) > 0.25 * hitRadius,
    ),
  )
  if (biasShare >= 0.6 && avgMeanRadius > 0.4 * hitRadius) {
    const side = settings.handedness === 'right' ? 'low and left' : 'low and right'
    out.push({
      id: 'trigger_bias',
      title: `Group pulling ${side} ${label}`,
      evidence: `${Math.round(biasShare * 100)}% of your ${label} bouts centred ${side}, with a group too loose (${mm(avgMeanRadius)} mean radius) to be a sight error alone.`,
      cause: `For a ${settings.handedness}-handed shooter this is the classic anticipation signature: the hand tightens as the trigger breaks and pushes the muzzle ${side}. Confirm it by having someone load a dummy round without telling you — if the rifle dips on the empty click, this is it.`,
      severity: 'priority',
      confidence: 0.6 * w,
      sampleSize: n,
      position,
    })
  }

  // --- A round, loose group is a hold problem, not an aiming problem.
  if (avgMeanRadius > 0.75 * hitRadius && avgAspect < 1.6) {
    out.push({
      id: 'wide_group',
      title: `Group too loose ${label}`,
      evidence: `Mean radius averages ${mm(avgMeanRadius)} ${label} against a hit zone of only ${mm(hitRadius)} radius, and the group is round rather than strung in any direction.`,
      cause:
        'An evenly round, oversized group means the rifle is moving in every direction while you shoot — the position is not yet stable enough to hold the target. This is a strength-and-repetition problem, not a technique subtlety.',
      severity: 'priority',
      confidence: 0.85 * w,
      sampleSize: n,
      position,
    })
  }

  // --- One shot out of five ruins a bout more than a mediocre group does.
  const flierShare = fraction(group.map((b) => b.metrics.flierIndex !== null))
  if (n >= 3 && flierShare >= 0.4) {
    out.push({
      id: 'flier',
      title: `One shot per bout escaping ${label}`,
      evidence: `${Math.round(flierShare * 100)}% of your ${label} bouts contain a single shot far outside the rest, while the remaining shots group acceptably.`,
      cause:
        'The position and the sight are fine — one shot per bout is being fired before it is ready. Usually a concentration lapse or a shot taken because the clock felt loud, not a mechanical fault.',
      severity: 'watch',
      confidence: 0.7 * w,
      sampleSize: n,
      position,
    })
  }

  // --- The first shot after skiing in is its own skill.
  const skied = group.filter((b) => b.context.skiedIn)
  if (skied.length >= 3) {
    const firstDev = mean(skied.map((b) => b.metrics.firstShotDeviation))
    const rest = mean(skied.map((b) => b.metrics.meanRadius))
    if (rest > 0 && firstDev > 1.8 * rest) {
      out.push({
        id: 'cold_first_shot',
        title: `First shot missing after ski-in (${label})`,
        evidence: `Across ${skied.length} bouts you skied into, shot 1 landed ${mm(firstDev)} from the centre of shots 2–5, roughly ${(firstDev / rest).toFixed(1)}× the spread of the rest of the bout.`,
        cause:
          'You are arriving on the mat and firing before the body has settled. Heart rate is still climbing down and the position has not been checked. The rest of the bout proves the shooting is there — the entry routine is the gap.',
        severity: 'priority',
        confidence: 0.8 * weight(skied.length),
        sampleSize: skied.length,
        position,
      })
    }
  }

  // --- Slow slide across the bout, rather than random scatter.
  const driftShare = fraction(
    group.map((b) => {
      const span = Math.hypot(b.metrics.drift.x, b.metrics.drift.y) * Math.max(1, b.shots.length - 1)
      // 2.5x the mean radius: simulation puts this at ~5% false positives on
      // scattered groups while still catching virtually every real walk.
      return b.metrics.meanRadius > 0 && span > 2.5 * b.metrics.meanRadius
    }),
  )
  if (n >= 3 && driftShare >= 0.5) {
    out.push({
      id: 'fatigue_drift',
      title: `Group walking across the bout ${label}`,
      evidence: `In ${Math.round(driftShare * 100)}% of your ${label} bouts the shots move steadily in one direction from shot 1 to shot 5, rather than scattering around a fixed centre.`,
      cause:
        'A steady walk means the position is slipping while you shoot — an elbow sliding, the sling settling, or breath being held so long the body starts to move. Random scatter is a hold problem; a walk is a position-build problem.',
      severity: 'watch',
      confidence: 0.7 * w,
      sampleSize: n,
      position,
    })
  }

  // --- Does the position land in the same place twice?
  if (n >= 3) {
    const spread = Math.sqrt(mean(mpis.map((p) => (p.x - avgMpi.x) ** 2 + (p.y - avgMpi.y) ** 2)))
    if (avgMeanRadius > 0 && spread > 0.8 * avgMeanRadius) {
      out.push({
        id: 'unstable_npa',
        title: `Group centre moves between bouts ${label}`,
        evidence: `Your ${label} group centre wanders ${mm(spread)} from bout to bout — more than the ${mm(avgMeanRadius)} spread inside a single bout.`,
        cause:
          'Each bout shoots tightly enough, but you are building a slightly different position every time, so the whole group lands somewhere new. Nothing about the sight can fix this; the position needs to become repeatable first.',
        severity: 'priority',
        confidence: 0.75 * w,
        sampleSize: n,
        position,
      })
    }
  }

  return out
}

/** Standing is meant to be worse than prone. This checks by how much. */
function comparePositions(bouts: Bout[]): Finding[] {
  const prone = bouts.filter((b) => b.position === 'prone')
  const standing = bouts.filter((b) => b.position === 'standing')
  if (prone.length < 2 || standing.length < 2) return []

  // Normalise by hit-zone size, otherwise standing always looks worse.
  const proneRatio = mean(prone.map((b) => b.metrics.meanRadius)) / (HIT_ZONE_MM.prone / 2)
  const standRatio = mean(standing.map((b) => b.metrics.meanRadius)) / (HIT_ZONE_MM.standing / 2)
  if (proneRatio <= 0 || standRatio < 1.5 * proneRatio) return []

  return [
    {
      id: 'standing_gap',
      title: 'Standing is lagging further behind prone than it should',
      evidence: `Measured against its own hit zone, your standing group uses ${Math.round(standRatio * 100)}% of the available radius against ${Math.round(proneRatio * 100)}% prone — a gap of ${(standRatio / proneRatio).toFixed(1)}×.`,
      cause:
        'Standing is always harder, but the two should track each other. A gap this wide means standing is short of practice volume rather than short of technique — most novices shoot four or five prone bouts for every standing one without noticing.',
      severity: 'watch',
      confidence: 0.7 * weight(Math.min(prone.length, standing.length)),
      sampleSize: prone.length + standing.length,
      position: 'standing',
    },
  ]
}
