// Builds the raw material for synthetic sheets, from a chosen set of real
// labelled photos only (so the rest can stay a clean test):
//   * an aligned clean-sheet TEMPLATE: photos rectified into the target plane,
//     each nudged (shift + scale) to line up with the running median, then the
//     per-pixel median taken again, so the holes drop out and ring lines stay
//     sharp;
//   * a PATCH LIBRARY: for every confirmed hole, the difference between the
//     photo and the template around it, windowed with a soft circular mask, so
//     a patch carries only the hole's own marks, not the print underneath.
import { loadEvalTargets } from '../cv-eval'
import { PX_PER_MM, rectify, saveGray, type Rectified } from './common'
import { mkdir, writeFile } from 'node:fs/promises'

const OUT = 'node_modules/.cache/synth'
const PATCH_MM = 24 // side of a square patch, mm
const CORE_MM = 8.5 // mask fully opaque inside this radius, mm
const EDGE_MM = 12 // mask reaches zero here, mm

function bilinear(img: Float32Array, size: number, x: number, y: number): number {
  const xx = Math.max(0, Math.min(size - 1.001, x))
  const yy = Math.max(0, Math.min(size - 1.001, y))
  const x0 = Math.floor(xx), y0 = Math.floor(yy)
  const fx = xx - x0, fy = yy - y0
  const a = img[y0 * size + x0], b = img[y0 * size + x0 + 1], c = img[(y0 + 1) * size + x0], d = img[(y0 + 1) * size + x0 + 1]
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

/** out(u,v) samples img around the centre, scaled by s and shifted by (dx,dy). */
function transform(img: Float32Array, size: number, dx: number, dy: number, s: number): Float32Array {
  const out = new Float32Array(size * size)
  const c = size / 2
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
    out[v * size + u] = bilinear(img, size, c + (u - c - dx) / s, c + (v - c - dy) / s)
  }
  return out
}

function ncc(a: Float32Array, b: Float32Array, size: number): number {
  const c = size / 2
  let sa = 0, sb = 0, n = 0
  for (let v = 0; v < size; v += 3) for (let u = 0; u < size; u += 3) {
    if (Math.hypot(u - c, v - c) > c * 0.9) continue
    sa += a[v * size + u]; sb += b[v * size + u]; n++
  }
  const ma = sa / n, mb = sb / n
  let sab = 0, saa = 0, sbb = 0
  for (let v = 0; v < size; v += 3) for (let u = 0; u < size; u += 3) {
    if (Math.hypot(u - c, v - c) > c * 0.9) continue
    const da = a[v * size + u] - ma, db = b[v * size + u] - mb
    sab += da * db; saa += da * da; sbb += db * db
  }
  return sab / Math.sqrt(saa * sbb + 1e-9)
}

function median(images: Float32Array[], size: number): Float32Array {
  const out = new Float32Array(size * size)
  const col = new Float32Array(images.length)
  for (let i = 0; i < out.length; i++) {
    for (let k = 0; k < images.length; k++) col[k] = images[k][i]
    const s = Array.from(col).sort((x, y) => x - y)
    out[i] = s[Math.floor(s.length / 2)]
  }
  return out
}

interface Aligned { rect: Rectified; gray: Float32Array; dx: number; dy: number; s: number }

function align(images: Aligned[], template: Float32Array, size: number) {
  for (const im of images) {
    let best = { score: -2, dx: 0, dy: 0, s: 1 }
    for (const s of [0.97, 0.985, 1, 1.015, 1.03]) {
      for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) {
        const t = transform(im.rect.gray, size, dx, dy, s)
        const score = ncc(t, template, size)
        if (score > best.score) best = { score, dx, dy, s }
      }
    }
    // refine at single-pixel steps around the coarse best
    for (let dy = best.dy - 1; dy <= best.dy + 1; dy++) for (let dx = best.dx - 1; dx <= best.dx + 1; dx++) {
      const t = transform(im.rect.gray, size, dx, dy, best.s)
      const score = ncc(t, template, size)
      if (score > best.score) best = { score, dx, dy, s: best.s }
    }
    im.dx = best.dx; im.dy = best.dy; im.s = best.s
    im.gray = transform(im.rect.gray, size, im.dx, im.dy, im.s)
  }
}

export interface PatchFile {
  size: number
  patchPx: number
  patches: { delta: number[]; weight: number[]; bg: number; source: string }[]
  shots: { x: number; y: number }[][]
  bulletDiameterMm: number
}

async function main() {
  const wanted = (process.argv[2] ?? 'eval/')
  const every = (await loadEvalTargets()).filter((t) => t.targetFaceId === 'issf-50m' && t.label.startsWith(wanted))
  // HOLDOUT=odd builds the library from the even-numbered photos only, leaving
  // the odd ones as real photos the synthetic data has never seen.
  const holdout = process.env.HOLDOUT === 'odd'
  const all = holdout ? every.filter((_, i) => i % 2 === 0) : every
  console.log(`${all.length} of ${every.length} photos for the library (${wanted}${holdout ? ', odd ones held out' : ''})`)
  const rects: Rectified[] = []
  for (const t of all) { const r = await rectify(t); if (r) rects.push(r) }
  const size = rects[0].size
  const imgs: Aligned[] = rects.map((r) => ({ rect: r, gray: r.gray, dx: 0, dy: 0, s: 1 }))
  let template = median(imgs.map((i) => i.gray), size)
  for (let pass = 0; pass < 2; pass++) {
    align(imgs, template, size)
    template = median(imgs.map((i) => i.gray), size)
    const mean = imgs.reduce((n, im) => n + ncc(im.gray, template, size), 0) / imgs.length
    console.log(`  alignment pass ${pass + 1}: mean correlation with the template ${mean.toFixed(3)}`)
  }
  await mkdir(OUT, { recursive: true })
  await saveGray(`${OUT}/template-aligned.png`, template, size)

  // Where the print has hard edges (ring lines, numerals): a slight misfit between
  // a photo and the template shows up as a bright/dark arc there, which is not a
  // hole. Those pixels are left out of every patch.
  const edge = new Uint8Array(size * size)
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const gx = template[y * size + x + 1] - template[y * size + x - 1]
    const gy = template[(y + 1) * size + x] - template[(y - 1) * size + x]
    if (Math.hypot(gx, gy) > 40) edge[y * size + x] = 1
  }
  const dilated = new Uint8Array(size * size)
  for (let y = 3; y < size - 3; y++) for (let x = 3; x < size - 3; x++) {
    if (!edge[y * size + x]) continue
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) dilated[(y + j) * size + x + i] = 1
  }

  const S = PX_PER_MM, c = size / 2
  const P = Math.round(PATCH_MM * S)
  const half = P / 2
  const targetsByLabel = new Map(all.map((t) => [t.label, t]))
  const patches: PatchFile['patches'] = []
  const shotGroups: PatchFile['shots'] = []
  for (const im of imgs) {
    const t = targetsByLabel.get(im.rect.label)!
    shotGroups.push(t.shots.map((s) => ({ x: s.x, y: s.y })))
    for (const sh of t.shots) {
      // where this hole landed in the aligned frame
      const u0 = c + im.s * (sh.x * S) + im.dx
      const v0 = c - im.s * (sh.y * S) + im.dy
      if (u0 < half + 2 || v0 < half + 2 || u0 > size - half - 2 || v0 > size - half - 2) continue
      const delta = new Array<number>(P * P)
      const weight = new Array<number>(P * P)
      let bgSum = 0, bgN = 0
      for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
        const px = u0 - half + i, py = v0 - half + j
        const d = bilinear(im.gray, size, px, py) - bilinear(template, size, px, py)
        const r = Math.hypot(i - half + 0.5, j - half + 0.5) / S // mm from the hole centre
        const w = r <= CORE_MM ? 1 : r >= EDGE_MM ? 0 : 0.5 * (1 + Math.cos(Math.PI * (r - CORE_MM) / (EDGE_MM - CORE_MM)))
        delta[j * P + i] = d
        const onPrint = dilated[Math.round(py) * size + Math.round(px)] === 1
        weight[j * P + i] = onPrint ? 0 : w
        if (r < CORE_MM) { bgSum += bilinear(template, size, px, py); bgN++ }
      }
      patches.push({ delta, weight, bg: bgSum / Math.max(1, bgN), source: im.rect.label })
    }
  }
  const file: PatchFile = { size, patchPx: P, patches, shots: shotGroups, bulletDiameterMm: all[0].bulletDiameterMm }
  await writeFile(`${OUT}/library.json`, JSON.stringify(file))
  await writeFile(`${OUT}/template.bin`, Buffer.from(template.buffer))
  const inBlack = patches.filter((p) => p.bg < 90).length
  console.log(`${patches.length} hole patches (${inBlack} on the black, ${patches.length - inBlack} on paper) from ${imgs.length} sheets`)
}
void main()
