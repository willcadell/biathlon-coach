/** The trained model. A new model gets a new file name: the service worker serves cached files without rechecking. */
export const MODEL_FILE = 'hole-finder-v2.onnx'
/** Must match the installed onnxruntime-web; scripts/copy-ort.mjs puts its WebAssembly file at /ort/<version>/ and checks. */
export const ORT_VERSION = '1.31.1'
