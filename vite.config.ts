import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** The runtime's bundle names its WebAssembly file, so Vite emits a hashed copy of it. The app loads its own copy from
 *  /ort/<version>/ instead (scripts/copy-ort.mjs, src/lib/holeWorker.ts), so the hashed one would only double the
 *  14 MB in every deploy. */
function dropDuplicateOrtWasm(): Plugin {
  return {
    name: 'drop-duplicate-ort-wasm',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) if (/^assets\/ort-wasm.*\.wasm$/.test(name)) delete bundle[name]
    },
  }
}

export default defineConfig({
  plugins: [react(), dropDuplicateOrtWasm()],
  server: { port: 5180 },
})
