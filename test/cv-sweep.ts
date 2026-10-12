// A small, targeted parameter sweep: scores a handful of detector settings on
// every labelled photo, reporting the contributed targets and the developer's
// eval set separately, because a setting that only helps one of them is
// fitting that set, not improving the detector. Each setting is scored on all
// photos once; use cv-tune.ts for the full grid when there's time to wait.
import { loadEvalTargets, scoreTarget } from './cv-eval'
import type { HoleParams } from '../src/lib/holeLocator'

const SETTINGS: { name: string; params: HoleParams }[] = [
  { name: 'shipped defaults', params: {} },
  { name: 'minDensity 0.30', params: { minDensity: 0.3 } },
  { name: 'minDensity 0.40', params: { minDensity: 0.4 } },
  { name: 'minDensity 0.45', params: { minDensity: 0.45 } },
  { name: 'blackMargin 45', params: { blackMargin: 45 } },
  { name: 'blackMargin 55', params: { blackMargin: 55 } },
  { name: 'nms 1.5', params: { nmsRadiusFactor: 1.5 } },
  { name: 'minDensity 0.40 + blackMargin 45', params: { minDensity: 0.4, blackMargin: 45 } },
]

async function main() {
  const all = await loadEvalTargets()
  // The six unique contributed targets (each was submitted twice): count each once.
  const seen = new Set<string>()
  const targets = all.filter((t) => {
    if (!t.label.startsWith('contributed/')) return true
    const key = t.shots.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).sort().join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const groups = [
    { name: 'contributed', items: targets.filter((t) => t.label.startsWith('contributed/')) },
    { name: 'eval', items: targets.filter((t) => t.label.startsWith('eval/')) },
  ]
  console.log(`${groups[0].items.length} unique contributed targets, ${groups[1].items.length} eval targets\n`)
  for (const s of SETTINGS) {
    const row: string[] = []
    for (const g of groups) {
      let truth = 0, matched = 0, extra = 0
      for (const t of g.items) {
        const r = await scoreTarget(t, s.params)
        truth += r.truthCount; matched += r.matchedCount; extra += r.extraCount
      }
      row.push(`${g.name}: found ${matched}/${truth} (${Math.round((matched / truth) * 100)}%), ${extra} extra`)
    }
    console.log(`${s.name.padEnd(34)} ${row.join('   |   ')}`)
  }
}
void main()
