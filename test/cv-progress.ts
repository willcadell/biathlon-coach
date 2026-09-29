// Checks the deterministic (non-AI) hole detector's real-world accuracy
// against athletes' anonymous target contributions — each one stores the
// photo *and* the confirmed hole positions the athlete corrected it to, so
// the detector's raw output can be measured against real, human-checked
// ground truth instead of just eyeballed (that's what cv-check.ts is for).
//
// Run with `npm run cv-progress` any time — after a batch of new
// contributions comes in, or after a change to holeLocator.ts/blackLocator.ts
// — and compare the printed numbers to the last run to see whether accuracy
// actually moved. Rerunning refreshes contributed/meta.json and the photos
// beside it (not committed — see .gitignore's test-images entry) with
// whatever's in training_targets right now via:
//
//   npx supabase db query --linked "select id, encode(photo,'base64') as photo_b64, target_face_id, bullet_diameter_mm, mm_per_unit, position, expected_shots, shots, submitted_month from training_targets order by submitted_month, id"
//
// (then re-run the download step from the session that first wrote this file,
// or ask Claude to refresh test-images/contributed/ from the database).
//
// See cv-tune.ts for the companion tool that searches for better detector
// settings using this same measurement as its scorecard.
import { loadEvalTargets, scoreTarget } from './cv-eval'

async function main() {
  const targets = (await loadEvalTargets()).filter((t) => t.label.startsWith('contributed/'))
  if (targets.length === 0) {
    console.log('No contributed targets downloaded yet — nothing to measure. Try again once athletes have opted in and scored a few.')
    return
  }

  let totalTruth = 0
  let totalMatched = 0
  let totalMissed = 0
  let totalExtra = 0
  const errors: number[] = []

  for (const t of targets) {
    const r = await scoreTarget(t)
    totalTruth += r.truthCount
    totalMatched += r.matchedCount
    totalMissed += r.missedCount
    totalExtra += r.extraCount
    errors.push(...r.errors)
    console.log(
      `${t.label} (${t.position}, ${r.truthCount} confirmed): found ${r.matchedCount}/${r.truthCount}` +
      (r.missedCount ? `, missed ${r.missedCount}` : '') +
      (r.extraCount ? `, ${r.extraCount} extra/invented` : '') +
      (r.errors.length ? `, mean error ${(r.errors.reduce((n, e) => n + e, 0) / r.errors.length).toFixed(1)} mm` : ''),
    )
  }

  console.log('')
  console.log(`Across ${targets.length} contributed target${targets.length === 1 ? '' : 's'}, ${totalTruth} confirmed shots:`)
  console.log(`  found  ${totalMatched}/${totalTruth} (${((totalMatched / totalTruth) * 100).toFixed(0)}%)`)
  console.log(`  missed ${totalMissed}/${totalTruth} (${((totalMissed / totalTruth) * 100).toFixed(0)}%)`)
  console.log(`  extra/invented: ${totalExtra}`)
  if (errors.length > 0) {
    console.log(`  mean position error on a found hole: ${(errors.reduce((n, e) => n + e, 0) / errors.length).toFixed(1)} mm`)
  }
  if (targets.length < 15) {
    console.log('')
    console.log(`Only ${targets.length} contributed target${targets.length === 1 ? '' : 's'} so far — a useful first read, but too`)
    console.log('few yet to treat any single number here as a stable trend. Rerun as more come in.')
  }
}

void main()
