// The method for using contributed targets to improve the detector: not
// training a new model — there's nowhere near enough labelled data for that
// yet (see the platform-plan note on this) — but systematically searching the
// existing hand-built detector's own thresholds (holeLocator.ts's
// HoleParams) against real, athlete-confirmed ground truth, instead of only
// ever hand-tuning them by eye against a couple of sample photos.
//
// This is also the natural on-ramp to that later model: the same scoring
// function here (found/missed/extra against confirmed shots) is exactly the
// objective a trained detector would eventually be judged against too, so
// building it now doesn't need to be thrown away once there's enough data to
// train on.
//
// Run with `npm run cv-tune`. Uses every labelled photo currently downloaded
// — both real anonymous contributions (test-images/contributed/) and the
// developer's own held-out set (test-images/eval/), combined for a bigger
// sample, since 4 contributions alone is too few to tune against safely (see
// the overfitting warning it prints).
import { loadEvalTargets, scoreTarget } from './cv-eval'
import type { HoleParams } from '../src/lib/holeLocator'

// A modest grid around the shipped defaults (minDensity 0.35, blackMargin 35,
// whiteMargin 35, nmsRadiusFactor 1.3) — wide enough to learn something, small
// enough that this finishes in seconds and doesn't chase noise in a tiny
// sample. Widen it once there's real volume to tune against.
const GRID: Record<keyof HoleParams, number[]> = {
  minDensity: [0.25, 0.3, 0.35, 0.4],
  blackMargin: [20, 27, 35, 45],
  whiteMargin: [20, 27, 35, 45],
  nmsRadiusFactor: [1.1, 1.3, 1.5],
  ambiguousRadiusFactor: [2.0],
  ambiguousDensity: [0.3],
}

function* combinations(): Generator<HoleParams> {
  for (const minDensity of GRID.minDensity) {
    for (const blackMargin of GRID.blackMargin) {
      for (const whiteMargin of GRID.whiteMargin) {
        for (const nmsRadiusFactor of GRID.nmsRadiusFactor) {
          yield { minDensity, blackMargin, whiteMargin, nmsRadiusFactor }
        }
      }
    }
  }
}

/** Balances finding real holes against not inventing fake ones — an F1-style
 *  score, so a setting that finds everything by also flagging half the paper
 *  scores no better than doing nothing. */
function f1(matched: number, missed: number, extra: number): number {
  const truth = matched + missed
  const detected = matched + extra
  if (truth === 0 || detected === 0) return 0
  const recall = matched / truth
  const precision = matched / detected
  if (recall + precision === 0) return 0
  return (2 * recall * precision) / (recall + precision)
}

async function main() {
  const targets = await loadEvalTargets()
  if (targets.length === 0) {
    console.log('No labelled photos downloaded — nothing to tune against. Run `npm run cv-progress` first to fetch contributions.')
    return
  }

  const grid = [...combinations()]
  console.log(`Scoring ${grid.length} parameter combinations against ${targets.length} labelled target${targets.length === 1 ? '' : 's'}...`)
  console.log('')

  const results: { params: HoleParams; score: number; matched: number; missed: number; extra: number }[] = []
  for (const params of grid) {
    let matched = 0, missed = 0, extra = 0
    for (const t of targets) {
      const r = await scoreTarget(t, params)
      matched += r.matchedCount
      missed += r.missedCount
      extra += r.extraCount
    }
    results.push({ params, score: f1(matched, missed, extra), matched, missed, extra })
  }

  results.sort((a, b) => b.score - a.score)
  const shipped = results.find(
    (r) => r.params.minDensity === 0.35 && r.params.blackMargin === 35 && r.params.whiteMargin === 35 && r.params.nmsRadiusFactor === 1.3,
  )

  console.log('Top 5:')
  for (const r of results.slice(0, 5)) {
    const truth = r.matched + r.missed
    console.log(
      `  score ${r.score.toFixed(3)}  found ${r.matched}/${truth}  extra ${r.extra}  ` +
      `minDensity=${r.params.minDensity} blackMargin=${r.params.blackMargin} whiteMargin=${r.params.whiteMargin} nms=${r.params.nmsRadiusFactor}`,
    )
  }
  if (shipped) {
    const truth = shipped.matched + shipped.missed
    console.log('')
    console.log(`Shipped defaults:  score ${shipped.score.toFixed(3)}  found ${shipped.matched}/${truth}  extra ${shipped.extra}`)
  }

  console.log('')
  console.log(`This searched only holeLocator.ts's own thresholds against ${targets.length} labelled targets — it did not train`)
  console.log('anything. With this few examples, the "best" combination above is easy to overfit to exactly these photos and')
  console.log('worth checking on a photo or two you did NOT include here before trusting it. Re-run as more contributions come')
  console.log('in; once there are genuinely many (dozens to hundreds), this same found/missed/extra scorecard is what a real')
  console.log('trained detector would be judged against too.')
}

void main()
