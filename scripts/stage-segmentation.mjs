/**
 * Stage the background-removal runtime into `public/segmentation/` (generated, gitignored).
 *
 * Runs before `dev` and `build`. The strip backdrops cut people out with MediaPipe's
 * image segmenter (`utils/segmentation/segmentation.worker.ts`), which needs three files
 * served from our own origin — the CSP is `default-src 'self'`, so no CDN:
 *
 * - `vision_wasm_module_internal.js` / `.wasm` — MediaPipe's runtime, the ES-module build
 *   (the worker is a module worker), copied from `@mediapipe/tasks-vision`;
 * - `selfie_multiclass_256x256.tflite` — Google's people-segmentation model (Apache-2.0),
 *   committed under `models/`.
 *
 * They go into a folder named after their combined content hash, so a new runtime or
 * model is a new URL and never mixes with a stale copy in someone's cache. MediaPipe
 * builds the runtime's file names itself from a base path, which is why the hash is on
 * the folder rather than on each file. `manifest.json` tells the worker where it is.
 *
 * Behind `VITE_BACKDROPS_ENABLED`, read here the way Vite reads it for the app — same
 * `.env*` files for the mode given as the first argument, `process.env` winning. With it
 * off the folder is emptied and nothing is staged, so a build that doesn't offer
 * backdrops doesn't upload files it will never serve.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

const root = new URL('../', import.meta.url)
const out = new URL('public/segmentation/', root)
const mediapipe = new URL('node_modules/@mediapipe/tasks-vision/wasm/', root)

const MODEL = 'selfie_multiclass_256x256.tflite'
const RUNTIME = ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm']

const mode = process.argv[2] ?? 'production'
const enabled = loadEnv(mode, fileURLToPath(root), 'VITE_').VITE_BACKDROPS_ENABLED === 'true'

await rm(out, { recursive: true, force: true })
if (!enabled) {
  console.log(`segmentation: VITE_BACKDROPS_ENABLED is off for "${mode}" — nothing staged`)
  process.exit(0)
}

const files = [
  ...(await Promise.all(
    RUNTIME.map(async (name) => ({ name, bytes: await readFile(new URL(name, mediapipe)) }))
  )),
  { name: MODEL, bytes: await readFile(new URL(`models/${MODEL}`, root)) },
]
const hash = createHash('sha256')
for (const file of files) hash.update(file.name).update(file.bytes)
const folder = hash.digest('hex').slice(0, 12)

await mkdir(new URL(`${folder}/`, out), { recursive: true })
for (const file of files) await writeFile(new URL(`${folder}/${file.name}`, out), file.bytes)

const model = files.at(-1)
const manifest = {
  base: `/segmentation/${folder}`,
  model: { url: `/segmentation/${folder}/${MODEL}`, size: model.bytes.length },
}
await writeFile(new URL('manifest.json', out), `${JSON.stringify(manifest, null, 2)}\n`)

const mb = (bytes) => (bytes / 1e6).toFixed(1)
const total = files.reduce((sum, file) => sum + file.bytes.length, 0)
console.log(`segmentation: staged MediaPipe runtime + model, ${mb(total)} MB in ${folder}/`)
