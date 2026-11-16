// Puts onnxruntime-web's WebAssembly runtime where the app loads it from: public/ort/<version>/, served as static
// files, so the app never fetches code from another host. Runs before `npm run dev` and `npm run build`. The files
// are 14 MB, so they stay out of git; they are fetched only when a target is first scored, then cached.
import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const WANT = '1.31.1' // keep in step with ORT_VERSION in src/lib/holeModelFiles.ts
const dist = join('node_modules', 'onnxruntime-web', 'dist')
if (!existsSync(dist)) {
  console.error('onnxruntime-web is not installed: run npm install first.')
  process.exit(1)
}
const have = JSON.parse(readFileSync(join('node_modules', 'onnxruntime-web', 'package.json'), 'utf8')).version
if (have !== WANT) {
  console.error(`onnxruntime-web is ${have} but the app expects ${WANT}: update ORT_VERSION in src/lib/holeModelFiles.ts and WANT here together.`)
  process.exit(1)
}
const out = join('public', 'ort', WANT)
mkdirSync(out, { recursive: true })
copyFileSync(join(dist, 'ort-wasm-simd-threaded.wasm'), join(out, 'ort-wasm-simd-threaded.wasm'))
console.log(`onnxruntime-web ${WANT} runtime copied to ${out}`)
