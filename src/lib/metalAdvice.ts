import type { Finding, MetalBout, MetalTarget, Position, ShootingDirection, Workout } from './types'
import { METAL_TARGETS, DISCS_PER_METAL_BOUT, hitsOf, shotOrder } from './metal'

/**
 * Coaching findings from metal bouts. Metal records which of the five targets
 * fell, not where a miss went, so it cannot say how a group is shaped. What it
 * can say is where in a bout, in which position, at what heart rate and under
 * what pressure the misses fall, and that mostly points at two things: how
 * steady the rifle is, and when the shot is released.
 *
 * Every rule needs a fair number of bouts before it speaks, because a bout is
 * only five targets. Thresholds are deliberately wide: telling an athlete they
 * rush the last shots on three bouts of evidence is worse than saying nothing.
 */

const WINDOW_DAYS = 60
const MAX_BOUTS = 40
const STALE_MAX_BOUTS = 30

const weight = (n: number, full: number) => Math.min(1, n / full)
const pct = (x: number) => `${Math.round(x * 100)}%`
const points = (x: number) => `${Math.round(x * 100)} points`
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

const rate = (bouts: MetalBout[]) => {
  if (bouts.length === 0) return 0
  const hits = bouts.reduce((n, b) => n + METAL_TARGETS.filter((t) => hitsOf(b)[t]).length, 0)
  return hits / (bouts.length * DISCS_PER_METAL_BOUT)
}

/** Misses per target, over the bouts handed in. */
const missesByDisc = (bouts: MetalBout[]): Record<MetalTarget, number> => {
  const out = Object.fromEntries(METAL_TARGETS.map((t) => [t, 0])) as Record<MetalTarget, number>
  for (const b of bouts) for (const t of METAL_TARGETS) if (!hitsOf(b)[t]) out[t] += 1
  return out
}

const SIDE: Record<MetalTarget, 'left' | 'middle' | 'right'> = {
  alpha: 'left', beta: 'left', charlie: 'middle', delta: 'right', echo: 'right',
}

/** The bouts the read is built from: the last 60 days, newest 40; after a long
 *  break, the newest 30 there are. */
export function metalWindow(bouts: MetalBout[], now = Date.now()): { bouts: MetalBout[]; stale: boolean } {
  const newestFirst = [...bouts].sort((a, b) => b.shotAt.localeCompare(a.shotAt))
  const cutoff = now - WINDOW_DAYS * 86400_000
  const inWindow = newestFirst.filter((b) => new Date(b.shotAt).getTime() >= cutoff).slice(0, MAX_BOUTS)
  if (inWindow.length > 0 || newestFirst.length === 0) return { bouts: inWindow, stale: false }
  return { bouts: newestFirst.slice(0, STALE_MAX_BOUTS), stale: true }
}

export interface MetalAdviceInput {
  bouts: MetalBout[]
  workouts: Workout[]
  /** The order the athlete fires the targets. Unknown (not loaded, or not set)
   *  means the rules about the first or last shots stay silent. */
  direction: ShootingDirection | undefined
  now?: number
}

export function analyseMetal({ bouts, workouts, direction, now }: MetalAdviceInput): Finding[] {
  const { bouts: windowed } = metalWindow(bouts, now)
  if (windowed.length === 0) return []

  const raceIds = new Set(workouts.filter((w) => w.raceType).map((w) => w.id))
  const range = windowed.filter((b) => !raceIds.has(b.workoutId))
  const race = windowed.filter((b) => raceIds.has(b.workoutId))

  const findings: Finding[] = []
  const prone = range.filter((b) => b.position === 'prone')
  const standing = range.filter((b) => b.position === 'standing')

  // --- Standing against prone: the steadiness gap.
  if (prone.length >= 6 && standing.length >= 6) {
    const gap = rate(prone) - rate(standing)
    if (gap >= 0.2) {
      findings.push({
        id: 'metal_standing_gap',
        title: 'Standing is well behind prone on metal',
        evidence: `You hit ${pct(rate(standing))} of targets standing against ${pct(rate(prone))} prone, ${points(gap)} apart, over ${standing.length} standing and ${prone.length} prone bouts.`,
        cause:
          'Some gap is normal, because standing is harder, but this much usually points at steadiness: sway the body cannot hold still, a breath released at the wrong moment, or simply far less practice standing than prone. Balance and hold work, shooting only on the exhale, and more standing volume are the places to look.',
        severity: gap >= 0.3 ? 'priority' : 'watch',
        confidence: 0.75 * weight(Math.min(prone.length, standing.length), 12),
        sampleSize: prone.length + standing.length,
        position: 'standing',
      })
    }
  }

  // --- Practice volume: far fewer standing bouts than prone.
  if (prone.length >= 9 && standing.length >= 1 && standing.length * 3 <= prone.length) {
    findings.push({
      id: 'metal_standing_volume',
      title: 'Standing gets far less practice than prone',
      evidence: `${standing.length} standing metal bout${standing.length === 1 ? '' : 's'} against ${prone.length} prone.`,
      cause:
        'Most athletes shoot several prone bouts for every standing one without noticing, and standing is the position that gains most from repetition. A short block with more standing than prone closes it.',
      severity: 'watch',
      confidence: 0.7 * weight(prone.length, 12),
      sampleSize: prone.length + standing.length,
      position: 'standing',
    })
  }

  // --- Per position: where the misses fall.
  const order = direction ? shotOrder(direction) : undefined
  for (const position of ['prone', 'standing'] as Position[]) {
    const group = position === 'prone' ? prone : standing
    if (group.length < 8) continue
    const misses = missesByDisc(group)
    const totalMisses = METAL_TARGETS.reduce((n, t) => n + misses[t], 0)
    if (totalMisses < 8) continue
    const n = group.length
    const label = position
    const groupRate = rate(group)

    // One target keeps escaping: sight picture or natural point of aim on that side.
    const missRate = (t: MetalTarget) => misses[t] / n
    // Exactly one target must stand out: two or more standing out is a region or
    // a stage of the bout, which the timing rules below describe better.
    const standouts = METAL_TARGETS.filter((t) => {
      const others = METAL_TARGETS.filter((o) => o !== t)
      return misses[t] >= 4 && missRate(t) - mean(others.map(missRate)) >= 0.25
    })
    const oneDisc: MetalTarget | null = standouts.length === 1 ? standouts[0] : null
    if (oneDisc) {
      const side = SIDE[oneDisc]
      findings.push({
        id: 'metal_one_disc',
        title: `${cap(oneDisc)} keeps escaping ${label}`,
        evidence: `${cap(oneDisc)} is missed in ${pct(missRate(oneDisc))} of your ${n} ${label} bouts, against ${pct(mean(METAL_TARGETS.filter((o) => o !== oneDisc).map(missRate)))} for the other four.`,
        cause: `One target, on the ${side}${side === 'middle' ? '' : ' side'}, is going wrong far more than the rest, which is rarely random. When the rifle swings to that target the sight picture or the natural point of aim is pulling away. Check natural point of aim first, then the zero, and watch how the position holds when you turn ${side === 'middle' ? 'back to centre' : `to the ${side}`}.`,
        severity: missRate(oneDisc) - mean(METAL_TARGETS.filter((o) => o !== oneDisc).map(missRate)) >= 0.4 ? 'priority' : 'watch',
        confidence: 0.7 * weight(n, 12),
        sampleSize: n,
        position,
      })
    } else if (groupRate < 0.8 && standouts.length === 0) {
      // Misses everywhere, no one target to blame: steadiness, not aim.
      const maxShare = Math.max(...METAL_TARGETS.map((t) => misses[t])) / totalMisses
      if (totalMisses >= 10 && maxShare <= 0.35) {
        findings.push({
          id: 'metal_scattered',
          title: `Misses are spread across every target ${label}`,
          evidence: `You hit ${pct(groupRate)} of ${label} targets over ${n} bouts, and no target accounts for more than ${pct(maxShare)} of the ${totalMisses} misses.`,
          cause:
            'Misses on every target, with no favourite, mean the cause is not where the rifle points but how still it is when the shot goes. That is steadiness: the hold, the breathing at release, the trigger. Work on holding the aim still on a target, and releasing every shot at the same point in the breath.',
          severity: 'watch',
          confidence: 0.65 * weight(n, 12),
          sampleSize: n,
          position,
        })
      }
    }

    if (!order) continue
    let timingExplained = false
    const firstTwo = order.slice(0, 2)
    const lastTwo = order.slice(3)
    const first = order[0]

    // Late targets: rushing or fatigue at the end of a bout.
    const lastMissRate = mean(lastTwo.map(missRate))
    const firstMissRate = mean(firstTwo.map(missRate))
    const lateShare = lastTwo.reduce((s, t) => s + misses[t], 0) / totalMisses
    if (lateShare >= 0.55 && lastMissRate - firstMissRate >= 0.15) {
      timingExplained = true
      findings.push({
        id: 'metal_late_discs',
        title: `Misses bunch at the end of the bout ${label}`,
        evidence: `${pct(lateShare)} of your ${label} misses fall on the last two targets you fire (${cap(lastTwo[0])} and ${cap(lastTwo[1])}), against ${pct(1 - lateShare)} on the first three, over ${n} bouts.`,
        cause:
          'A bout that starts well and slips at the end is usually timing: the shots speed up once the first ones fall, or the hold fades as the breath and the muscles run out. Take the same time for the last shot as the first, and come off and reset rather than force a late one.',
        severity: 'watch',
        confidence: 0.65 * weight(n, 12),
        sampleSize: n,
        position,
      })
    }

    // First target: arrival, the first shot after skiing in.
    const firstMiss = missRate(first)
    const restMiss = mean(order.slice(1).map(missRate))
    if (misses[first] >= 4 && firstMiss - restMiss >= 0.2) {
      timingExplained = true
      findings.push({
        id: 'metal_first_disc',
        title: `The first shot is the one missed ${label}`,
        evidence: `Your first target (${cap(first)}) is missed in ${pct(firstMiss)} of ${n} ${label} bouts, against ${pct(restMiss)} for the other four.`,
        cause:
          'A first shot that falls short while the rest settle is about arriving: breathing and heart rate not yet under control, or the shot released before the position has settled. Ease the pace over the last stretch before the range, and give the first shot the same routine as the rest.',
        severity: 'watch',
        confidence: 0.7 * weight(n, 12),
        sampleSize: n,
        position,
      })
    }

    // Miss streaks: a miss makes the next one more likely.
    let afterMiss = 0, missAfterMiss = 0, afterHit = 0, missAfterHit = 0
    for (const b of group) {
      for (let i = 1; i < order.length; i++) {
        const prevHit = hitsOf(b)[order[i - 1]]
        const missNow = !hitsOf(b)[order[i]]
        if (prevHit) { afterHit += 1; if (missNow) missAfterHit += 1 }
        else { afterMiss += 1; if (missNow) missAfterMiss += 1 }
      }
    }
    // Misses clustered at the start or end of a bout look like streaks too, and
    // are already explained by the rules above: do not say it twice.
    if (!timingExplained && afterMiss >= 12 && afterHit >= 12) {
      const pAfterMiss = missAfterMiss / afterMiss
      const pAfterHit = missAfterHit / afterHit
      if (pAfterMiss - pAfterHit >= 0.2) {
        findings.push({
          id: 'metal_miss_streaks',
          title: `One miss leads to another ${label}`,
          evidence: `After a miss you miss the next target ${pct(pAfterMiss)} of the time, against ${pct(pAfterHit)} after a hit, over ${n} ${label} bouts.`,
          cause:
            'When a miss makes the next shot more likely to miss, the cause is usually what happens in your head or your pace between shots, not the rifle: hurrying to make up for it, or carrying the miss into the next shot. Practise a fixed reset after every shot, a breath and the same routine, hit or miss.',
          severity: 'watch',
          confidence: 0.6 * weight(Math.min(afterMiss, afterHit), 20),
          sampleSize: n,
          position,
        })
      }
    }
  }

  // --- Heart rate: hit rate falls when the pulse is high.
  const withHr = range.filter((b) => b.heartRate > 0)
  if (withHr.length >= 10) {
    const sorted = [...withHr].sort((a, b) => a.heartRate - b.heartRate)
    const half = Math.floor(sorted.length / 2)
    const low = sorted.slice(0, half)
    const high = sorted.slice(sorted.length - half)
    const drop = rate(low) - rate(high)
    if (half >= 5 && drop >= 0.15 && high[0].heartRate > low[low.length - 1].heartRate) {
      findings.push({
        id: 'metal_intensity_drop',
        title: 'Hit rate falls when your heart rate is high',
        evidence: `At your higher heart rates (from ${high[0].heartRate} bpm) you hit ${pct(rate(high))} of targets, against ${pct(rate(low))} at your lower ones (up to ${low[low.length - 1].heartRate} bpm), over ${withHr.length} bouts.`,
        cause:
          'The technique that works when you are calm is not surviving the effort, which points at how you arrive and breathe, not at a new technique. Keep the position, aim and trigger exactly the same and change only the breathing: deeper or extra breaths before the pause, and an easier last stretch into the range.',
        severity: drop >= 0.25 ? 'priority' : 'watch',
        confidence: 0.7 * weight(withHr.length, 16),
        sampleSize: withHr.length,
        position: 'both',
      })
    }
  }

  // --- Race against range: the pressure gap.
  if (race.length >= 6 && range.length >= 6) {
    const gap = rate(range) - rate(race)
    if (gap >= 0.15) {
      findings.push({
        id: 'metal_race_gap',
        title: 'Racing costs you hits compared with training',
        evidence: `You hit ${pct(rate(race))} of targets in races against ${pct(rate(range))} in range sessions, ${points(gap)} apart, over ${race.length} race and ${range.length} range bouts.`,
        cause:
          'A drop under race conditions is about pressure and arrival, not skill you do not have. Practise the parts that change on race day: a written pre-start routine, shooting after hard skiing, a miss accepted and let go, and the same routine for every shot.',
        severity: gap >= 0.25 ? 'priority' : 'watch',
        confidence: 0.7 * weight(Math.min(race.length, range.length), 12),
        sampleSize: race.length + range.length,
        position: 'both',
      })
    }
  }

  return findings
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
