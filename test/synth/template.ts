// Builds a clean-sheet template: every labelled photo of the same face is
// rectified into the flat target plane, and the per-pixel MEDIAN is taken.
// Holes sit in different places on different sheets, so the median keeps the
// printed rings and numerals and drops the holes.
import { loadEvalTargets } from '../cv-eval'
import { rectify, saveGray, type Rectified } from './common'
import { mkdir, writeFile } from 'node:fs/promises'

async function main() {
  const all = (await loadEvalTargets()).filter((t) => t.targetFaceId === 'issf-50m')
  // Count each contributed target once (every one was sent twice).
  const seen = new Set<string>()
  const targets = all.filter((t) => {
    const key = t.shots.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).sort().join('|')
    if (seen.has(key)) return false
    seen.add(key); return true
  })
  console.log(`${targets.length} labelled photos of issf-50m`)
  const rects: Rectified[] = []
  for (const t of targets) {
    const r = await rectify(t)
    if (r) rects.push(r)
    else console.log(`  skipped ${t.label}: no black circle found`)
  }
  const { size } = rects[0]
  const out = new Float32Array(size * size)
  const col = new Float32Array(rects.length)
  for (let i = 0; i < out.length; i++) {
    for (let k = 0; k < rects.length; k++) col[k] = rects[k].gray[i]
    const sorted = Array.from(col).sort((a, b) => a - b)
    out[i] = sorted[Math.floor(sorted.length / 2)]
  }
  await mkdir('node_modules/.cache/synth', { recursive: true })
  await saveGray('node_modules/.cache/synth/template.png', out, size)
  await writeFile('node_modules/.cache/synth/template.json', JSON.stringify({ size, count: rects.length }))
  await writeFile('node_modules/.cache/synth/template.bin', Buffer.from(out.buffer))
  // A sample of one rectified photo, to eyeball the rectification itself.
  await saveGray('node_modules/.cache/synth/rectified-sample.png', rects[0].gray, size)
  console.log(`template from ${rects.length} photos, ${size}x${size}px`)
}
void main()
