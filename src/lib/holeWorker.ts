/// <reference lib="webworker" />
/**
 * Runs the hole-finding network off the main thread, so reading a target (a couple of seconds of arithmetic, longer on
 * a phone) never freezes the screen. Started by holeModel.ts, which fetches nothing itself: the runtime's WebAssembly
 * file and the model are loaded here, on first use.
 */
import * as ort from 'onnxruntime-web/wasm'
import { MODEL_FILE, ORT_VERSION } from './holeModelFiles'

type Request = { id: number; kind: 'warm' } | { id: number; kind: 'run'; input: Float32Array; height: number; width: number }

let session: Promise<ort.InferenceSession> | null = null

function getSession(): Promise<ort.InferenceSession> {
  if (!session) {
    session = (async () => {
      const base = import.meta.env.BASE_URL
      // Only the .wasm is fetched from our own files; the runtime's JavaScript glue is already inside the bundle.
      ort.env.wasm.wasmPaths = { wasm: `${base}ort/${ORT_VERSION}/ort-wasm-simd-threaded.wasm` }
      // One thread: more needs the page to be cross-origin isolated, which the app is not.
      ort.env.wasm.numThreads = 1
      const res = await fetch(`${base}models/${MODEL_FILE}`)
      if (!res.ok) throw new Error(`Could not load the model (${res.status})`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
    })().catch((e) => {
      session = null
      throw e
    })
  }
  return session
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data
  try {
    const sess = await getSession()
    if (msg.kind === 'warm') {
      self.postMessage({ id: msg.id, ok: true })
      return
    }
    const out = await sess.run({ image: new ort.Tensor('float32', msg.input, [1, 1, msg.height, msg.width]) })
    const logits = out.logits.data as Float32Array
    self.postMessage({ id: msg.id, logits }, [logits.buffer])
  } catch (err) {
    self.postMessage({ id: msg.id, error: err instanceof Error ? err.message : String(err) })
  }
}
