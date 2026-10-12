// Composites synthetic target photos: the clean aligned template plus hole
// patches cut from real photos, placed where real shots land (real groups,
// jittered), then lit, blurred, noised, tilted and dropped on a wall-coloured
// canvas to look like a handheld phone photo. Each comes with its confirmed
// shot positions in mm, so it plugs into the same scoring as a real photo.
//
//   node generate.mjs [count] [seed]
//
// Then, as a realism check, runs the app's detector over them and prints the
// same found / extra figures cv-progress prints for real photos. If synthetic
// photos score far above real ones they're too easy to be useful.
import { Jimp } from 'jimp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { PatchFile } from './library'
import { PX_PER_MM } from './common'
import { scoreTarget, type EvalTarget } from '../cv-eval'
import { faceById } from '../../src/lib/types'

const OUT_DIR = 'test-images/synthetic'
const CACHE = 'node_modules/.cache/synth'

function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
const pick = <T,>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)]

function bil(img: ArrayLike<number>, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > w - 1.001 || y > h - 1.001) return NaN
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  return (img[y0 * w + x0] * (1 - fx) + img[y0 * w + x0 + 1] * fx) * (1 - fy) + (img[(y0 + 1) * w + x0] * (1 - fx) + img[(y0 + 1) * w + x0 + 1] * fx) * fy
}

function blur(img: Float32Array, size: number, sigma: number): Float32Array {
  if (sigma < 0.3) return img
  const rad = Math.ceil(sigma * 2.5)
  const k: number[] = []
  let sum = 0
  for (let i = -rad; i <= rad; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v }
  const tmp = new Float32Array(img.length), out = new Float32Array(img.length)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0
    for (let i = -rad; i <= rad; i++) a += img[y * size + Math.max(0, Math.min(size - 1, x + i))] * k[i + rad]
    tmp[y * size + x] = a / sum
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0
    for (let i = -rad; i <= rad; i++) a += tmp[Math.max(0, Math.min(size - 1, y + i)) * size + x] * k[i + rad]
    out[y * size + x] = a / sum
  }
  return out
}

async function main() {
  const count = Number(process.argv[2] ?? 60)
  const seed = Number(process.argv[3] ?? 1)
  const r = rng(seed)
  const lib = JSON.parse(await readFile(`${CACHE}/library.json`, 'utf8')) as PatchFile
  const tb = await readFile(`${CACHE}/template.bin`)
  const template = new Float32Array(tb.buffer, tb.byteOffset, tb.byteLength / 4)
  const { size, patchPx: P } = lib
  const S = PX_PER_MM, c = size / 2
  // The template covers only the face; pad it with paper so the sheet runs on
  // into the wall without a visible edge.
  const big = Math.round(size * 1.7), off0 = Math.round((big - size) / 2)
  const face = faceById('issf-50m')
  await mkdir(OUT_DIR, { recursive: true })

  const labels: { id: string; shots: { x: number; y: number }[] }[] = []
  for (let n = 0; n < count; n++) {
    // 1. composite holes onto the template, in the flat target plane
    const img = new Float32Array(size * size)
    img.set(template)
    const group = pick(lib.shots, r)
    const gdx = gauss(r) * 3, gdy = gauss(r) * 3
    const shots = group.map((s) => ({ x: s.x + gdx + gauss(r) * 1.2, y: s.y + gdy + gauss(r) * 1.2 }))
    for (const sh of shots) {
      const patch = pick(lib.patches, r)
      const th = r() * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th)
      const u0 = c + sh.x * S, v0 = c - sh.y * S
      const reach = Math.ceil((P / 2) * 1.5)
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        // destination pixel -> patch pixel (inverse rotation about the patch centre)
        const px = cs * dx + sn * dy + P / 2, py = -sn * dx + cs * dy + P / 2
        const w = bil(patch.weight, P, P, px - 0.5, py - 0.5)
        if (Number.isNaN(w) || w <= 0) continue
        const d = bil(patch.delta, P, P, px - 0.5, py - 0.5)
        const X = Math.round(u0 + dx), Y = Math.round(v0 + dy)
        if (X < 0 || Y < 0 || X >= size || Y >= size) continue
        img[Y * size + X] = Math.max(0, Math.min(255, img[Y * size + X] + w * d))
      }
    }
    // 2. onto a paper-coloured canvas, then lighting: gain/offset, a gentle
    //    gradient and a little blur
    const paper = 222
    const canvas = new Float32Array(big * big).fill(paper)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) canvas[(y + off0) * big + x + off0] = img[y * size + x]
    const gain = 0.8 + r() * 0.4, off = (r() - 0.5) * 30
    const gradAng = r() * Math.PI * 2, gradAmp = 0.06 + r() * 0.12
    const cb = big / 2
    for (let y = 0; y < big; y++) for (let x = 0; x < big; x++) {
      const g = 1 + gradAmp * (Math.cos(gradAng) * (x - cb) + Math.sin(gradAng) * (y - cb)) / cb
      canvas[y * big + x] = Math.max(0, Math.min(255, canvas[y * big + x] * gain * g + off))
    }
    const soft = blur(canvas, big, r() * 1.1)
    // 3. a phone's view: tilted, rotated, scaled, on a wall-coloured canvas
    const W = 1400, H = 1800
    const out = new Jimp({ width: W, height: H, color: 0xffffffff })
    const bgBase = 150 + r() * 70
    const blackR = face.blackMm / 2
    const blackFrac = 0.21 + r() * 0.11
    const k = (blackFrac * W) / (blackR * S)
    const rho = ((r() - 0.5) * 12 * Math.PI) / 180
    const phi = r() * Math.PI, q = 0.88 + r() * 0.12
    const tx = W / 2 + (r() - 0.5) * 0.08 * W, ty = H / 2 + (r() - 0.5) * 0.08 * H
    // M = R(rho) R(phi) diag(1,q) R(-phi) * k ; invert it
    const cp = Math.cos(phi), sp = Math.sin(phi), cr = Math.cos(rho), sr = Math.sin(rho)
    const A = [[cp * cp + sp * sp * q, cp * sp * (1 - q)], [cp * sp * (1 - q), sp * sp + cp * cp * q]]
    const M = [[k * (cr * A[0][0] - sr * A[1][0]), k * (cr * A[0][1] - sr * A[1][1])], [k * (sr * A[0][0] + cr * A[1][0]), k * (sr * A[0][1] + cr * A[1][1])]]
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0]
    const inv = [[M[1][1] / det, -M[0][1] / det], [-M[1][0] / det, M[0][0] / det]]
    const noise = 2 + r() * 5
    // Real sheets are never perfectly flat or perfectly fitted: a smooth, random
    // warp of up to ~2 mm (paper curl, lens distortion, a slightly-off circle fit)
    // so the printed rings don't line up with the template exactly, as they don't
    // in real photos.
    const warps = [0, 1, 2].map(() => ({
      ax: (r() - 0.5) * 2 * 1.6 * S, ay: (r() - 0.5) * 2 * 1.6 * S,
      fx: (0.4 + r() * 1.6) * Math.PI / size, fy: (0.4 + r() * 1.6) * Math.PI / size, px: r() * 6.28, py: r() * 6.28,
    }))
    const warp = (ux: number, uy: number) => {
      let wx = 0, wy = 0
      for (const w of warps) { wx += w.ax * Math.sin(w.fy * uy + w.py); wy += w.ay * Math.sin(w.fx * ux + w.px) }
      return [wx / 3, wy / 3]
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ox = x - tx, oy = y - ty
      const ux0 = inv[0][0] * ox + inv[0][1] * oy + cb, uy0 = inv[1][0] * ox + inv[1][1] * oy + cb
      const [wx, wy] = warp(ux0 - cb, uy0 - cb)
      const ux = ux0 + wx, uy = uy0 + wy
      let v = bil(soft, big, big, ux, uy)
      if (Number.isNaN(v)) v = bgBase + (Math.sin(x * 0.013) + Math.cos(y * 0.009)) * 6
      v = Math.max(0, Math.min(255, v + gauss(r) * noise))
      const p = (y * W + x) * 4
      out.bitmap.data[p] = v; out.bitmap.data[p + 1] = v; out.bitmap.data[p + 2] = v; out.bitmap.data[p + 3] = 255
    }
    const id = `syn${String(n).padStart(3, '0')}`
    await out.write(`${OUT_DIR}/${id}.jpg` as `${string}.jpg`, { quality: 85 })
    labels.push({ id, shots })
  }
  await writeFile(`${OUT_DIR}/labels.json`, JSON.stringify(labels))
  console.log(`wrote ${count} synthetic targets to ${OUT_DIR}`)

  // Realism check: the app's detector on the synthetic photos.
  let truth = 0, found = 0, extra = 0
  for (const l of labels) {
    const t: EvalTarget = {
      label: `synthetic/${l.id}`, photoPath: `${OUT_DIR}/${l.id}.jpg`, targetFaceId: 'issf-50m',
      bulletDiameterMm: lib.bulletDiameterMm, mmPerUnit: 0, position: 'prone', shots: l.shots,
    }
    const res = await scoreTarget(t)
    truth += res.truthCount; found += res.matchedCount; extra += res.extraCount
  }
  console.log(`detector on synthetic photos: found ${found}/${truth} (${Math.round((found / truth) * 100)}%), ${extra} extra`)
  console.log('for comparison, on real photos: eval set 64% (92 extra over 27), contributed 27%')
}
void main()
