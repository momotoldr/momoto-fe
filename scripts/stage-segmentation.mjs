/**
 * Stage the background-removal runtime into `public/segmentation/` (generated, gitignored).
 *
 * Runs before `dev` and `build`. Two things have to be served from our own origin — the
 * CSP is `default-src 'self'`, so no CDN — and both are too big to serve whole:
 *
 * - the ISNet model (`models/isnet-w8.onnx`, 46.5 MB), and
 * - onnxruntime-web's WebGPU-capable WASM (`ort-wasm-simd-threaded.asyncify.wasm`,
 *   25.5 MiB).
 *
 * Cloudflare Workers refuses any static asset over 25 MiB, so each is cut into parts
 * that the segmentation worker fetches in parallel and joins (see
 * `utils/segmentation/segmentation.worker.ts`; onnxruntime accepts the WASM as bytes via
 * `env.wasm.wasmBinary`). Part names carry a content hash, so a new model or runtime is a
 * new URL and never collides with a stale copy in someone's cache.
 *
 * The runtime's parts keep a `.wasm` extension so they are served as `application/wasm`,
 * which Cloudflare compresses on the way out (26.8 MB → ~4.6 MB brotli); a `.bin` part is
 * `application/octet-stream` and goes out raw. The model's parts stay `.bin` — quantized
 * weights barely compress (46.5 → 39.5 MB), so it isn't worth pretending they're WASM.
 *
 * Each file's full SHA-256 goes in the manifest; the worker checks the joined bytes
 * against it, so a truncated download or a damaged cache entry is caught and refetched
 * instead of failing inside onnxruntime on every visit.
 *
 * The small JS glue module that loads the WASM is copied as-is.
 *
 * Behind `VITE_BACKDROPS_ENABLED`, read here the way Vite reads it for the app — same
 * `.env*` files for the mode given as the first argument, `process.env` winning. With it
 * off the folder is emptied and nothing is staged, so a build that doesn't offer
 * backdrops doesn't upload ~73 MB it will never serve.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

const root = new URL('../', import.meta.url)
const out = new URL('public/segmentation/', root)
const ort = new URL('node_modules/onnxruntime-web/dist/', root)

/** Well under the 25 MiB limit, and small enough that parts download side by side. */
const PART_BYTES = 12 * 1024 * 1024

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashOf = (bytes) => sha256(bytes).slice(0, 12)

async function split(source, stem, extension) {
  const bytes = await readFile(source)
  const hash = hashOf(bytes)
  const parts = []
  for (let offset = 0, index = 0; offset < bytes.length; offset += PART_BYTES, index += 1) {
    const chunk = bytes.subarray(offset, offset + PART_BYTES)
    const name = `${stem}.${hash}.${String(index).padStart(2, '0')}.${extension}`
    await writeFile(new URL(name, out), chunk)
    parts.push({ url: `/segmentation/${name}`, size: chunk.length })
  }
  return { size: bytes.length, sha256: sha256(bytes), parts }
}

const mode = process.argv[2] ?? 'production'
const enabled = loadEnv(mode, fileURLToPath(root), 'VITE_').VITE_BACKDROPS_ENABLED === 'true'

await rm(out, { recursive: true, force: true })
if (!enabled) {
  console.log(`segmentation: VITE_BACKDROPS_ENABLED is off for "${mode}" — nothing staged`)
  process.exit(0)
}
await mkdir(out, { recursive: true })

const glue = await readFile(new URL('ort-wasm-simd-threaded.asyncify.mjs', ort))
const glueName = `ort-wasm-simd-threaded.asyncify.${hashOf(glue)}.mjs`
await writeFile(new URL(glueName, out), glue)

const manifest = {
  model: await split(new URL('models/isnet-w8.onnx', root), 'isnet-w8', 'bin'),
  wasm: await split(new URL('ort-wasm-simd-threaded.asyncify.wasm', ort), 'ort-asyncify', 'wasm'),
  mjs: `/segmentation/${glueName}`,
}
await writeFile(new URL('manifest.json', out), `${JSON.stringify(manifest, null, 2)}\n`)

const mb = (bytes) => (bytes / 1e6).toFixed(1)
console.log(
  `segmentation: staged model ${mb(manifest.model.size)} MB + wasm ${mb(manifest.wasm.size)} MB`
)
