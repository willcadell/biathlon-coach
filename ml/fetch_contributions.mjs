// Downloads the anonymous contributed targets (photo, confirmed shots, calibration, the aiming-circle fit) from
// training_targets into test-images/contributed/ in the format test/cv-eval.ts reads. The table has no client
// grants, so this goes through the Supabase CLI against the linked project. Photos and labels stay out of git.
//
//   node ml/fetch_contributions.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const SQL =
  "select id, encode(photo,'base64') as photo_b64, target_face_id, bullet_diameter_mm, mm_per_unit, position, " +
  'expected_shots, shots, marks, shots_fingerprint, submitted_month from training_targets order by submitted_month, id'

const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', SQL], { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const json = JSON.parse(out.slice(out.indexOf('{')))
const rows = json.rows
const dir = join('test-images', 'contributed')
mkdirSync(dir, { recursive: true })
for (const f of readdirSync(dir)) if (f.endsWith('.jpg')) rmSync(join(dir, f))

const meta = rows.map((r, i) => {
  const name = `t${String(i + 1).padStart(2, '0')}`
  writeFileSync(join(dir, `${name}.jpg`), Buffer.from(r.photo_b64, 'base64'))
  return {
    id: r.id, name, target_face_id: r.target_face_id, bullet_diameter_mm: r.bullet_diameter_mm, mm_per_unit: r.mm_per_unit,
    position: r.position, expected_shots: r.expected_shots, shots: r.shots, marks: r.marks, fingerprint: r.shots_fingerprint,
    submitted_month: r.submitted_month,
  }
})
writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 1))
const unique = new Set(meta.map((m) => m.fingerprint)).size
console.log(`${meta.length} contributions downloaded, ${unique} unique targets`)
