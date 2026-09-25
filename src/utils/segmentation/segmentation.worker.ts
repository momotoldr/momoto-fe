/**
 * Background-removal worker: runs ISNet (via onnxruntime-web) on a captured cut and
 * returns its foreground mask.
 *
 * Off the main thread so the pre- and post-processing (and onnxruntime's own
 * bookkeeping) never stall the arrange screen or the live camera tiles beside it.
 * Talks to `segmenter.ts` only; see `SegmenterRequest` / `SegmenterResponse` there.
 *
 * The runtime and model are fetched in parts (see `scripts/stage-segmentation.mjs`)
 * and kept in Cache Storage, so the ~73 MB is paid once per browser rather than once
 * per session: the HTTP cache is free to evict files this size, and does.
 */
import * as ort from 'onnxruntime-web/webgpu'

import type { SegmenterRequest, SegmenterResponse } from './segmenter'

/** ISNet's input is fixed at 1024x1024; the graph fails at any other size. */
const SIZE = 1024
const CACHE_NAME = 'momoto-segmentation'
const MANIFEST_URL = '/segmentation/manifest.json'

interface Part {
  url: string
  size: number
}
interface Asset {
  size: number
  /** SHA-256 of the whole file, hex — checked after the parts are joined. */
  sha256: string
  parts: Part[]
}
interface Manifest {
  model: Asset
  wasm: Asset
  mjs: string
}

type GpuNavigator = Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }

/** This device can't run the model at all — reported as final, not as a retryable error. */
class UnsupportedError extends Error {}

const post = (message: SegmenterResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, { transfer })

let session: Promise<ort.InferenceSession> | null = null

/**
 * A manifest path, resolved — only if it stays on our origin under `/segmentation/`.
 * The CSP would refuse a foreign script anyway; this keeps the worker from even asking,
 * and from caching or compiling bytes from anywhere else.
 */
function ownUrl(path: string): string {
  const url = new URL(path, self.location.origin)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/segmentation/')) {
    throw new Error(`segmentation manifest names a foreign URL: ${path}`)
  }
  return url.href
}

async function openCache(): Promise<Cache | null> {
  try {
    return 'caches' in self ? await caches.open(CACHE_NAME) : null
  } catch {
    // Opaque origins and some private modes refuse Cache Storage — only slower, not fatal.
    return null
  }
}

/**
 * Fetch one part, from Cache Storage when it's there (and the right size). Streamed so
 * the download can report progress, then stored whole.
 */
async function fetchPart(part: Part, cache: Cache | null, onBytes: (n: number) => void) {
  const url = ownUrl(part.url)
  const cached = await cache?.match(url)
  if (cached) {
    const bytes = new Uint8Array(await cached.arrayBuffer())
    if (bytes.length === part.size) {
      onBytes(bytes.length)
      return bytes
    }
    // Truncated by a quota eviction or an interrupted write — fetch it again.
    await cache?.delete(url)
  }
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`fetch ${part.url}: ${response.status}`)
  const bytes = new Uint8Array(part.size)
  const reader = response.body.getReader()
  let offset = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    // A size that disagrees with the manifest means a stale or truncated file.
    if (offset + value.length > bytes.length) throw new Error(`part too long: ${part.url}`)
    bytes.set(value, offset)
    offset += value.length
    onBytes(value.length)
  }
  if (offset !== bytes.length) throw new Error(`part too short: ${part.url}`)
  await cache?.put(url, new Response(bytes)).catch(() => undefined)
  return bytes
}

async function fetchJoined(parts: Part[], cache: Cache | null, onBytes: (n: number) => void) {
  const chunks = await Promise.all(parts.map((part) => fetchPart(part, cache, onBytes)))
  const joined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.length
  }
  return joined
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string | null> {
  // `crypto.subtle` exists only in secure contexts — which the booth needs for the
  // camera anyway. Without it there's nothing to check with, so don't block on it.
  if (!crypto.subtle) return null
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * One file of the manifest, joined and verified. A hash mismatch drops that file's
 * cached parts and fetches them once more from the network: the usual cause is a cache
 * entry damaged in a way its size didn't show, and without this it would fail the same
 * way on every visit.
 */
async function fetchAsset(asset: Asset, cache: Cache | null, onBytes: (n: number) => void) {
  for (let attempt = 0; ; attempt += 1) {
    const bytes = await fetchJoined(asset.parts, cache, onBytes)
    const digest = await sha256Hex(bytes)
    if (digest === null || digest === asset.sha256) return bytes
    if (attempt > 0) throw new Error('segmentation asset failed its integrity check')
    onBytes(-bytes.length)
    await Promise.all(asset.parts.map((part) => cache?.delete(ownUrl(part.url))))
  }
}

/** Drop parts from earlier builds — their names carry a hash, so nothing reuses them. */
async function pruneCache(cache: Cache | null, manifest: Manifest) {
  if (!cache) return
  const keep = new Set([...manifest.model.parts, ...manifest.wasm.parts].map((p) => ownUrl(p.url)))
  for (const request of await cache.keys()) {
    if (!keep.has(request.url)) await cache.delete(request)
  }
}

async function createSession(): Promise<ort.InferenceSession> {
  // Before anything is downloaded: WebGPU is the only path offered (see
  // `checkBackdropSupport`), and a worker can lack it even when the page has it.
  const gpu = (navigator as GpuNavigator).gpu
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null
  if (!adapter) throw new UnsupportedError('WebGPU is not available in the worker')

  const response = await fetch(MANIFEST_URL, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`fetch ${MANIFEST_URL}: ${response.status}`)
  const manifest = (await response.json()) as Manifest
  const cache = await openCache()
  void pruneCache(cache, manifest).catch(() => undefined)

  const total = manifest.model.size + manifest.wasm.size
  let loaded = 0
  let lastPosted = 0
  const onBytes = (n: number) => {
    loaded += n
    // ~100 messages over the whole download, not one per network chunk.
    if (Math.abs(loaded - lastPosted) >= total / 100 || loaded === total) {
      lastPosted = loaded
      post({ type: 'progress', loaded, total })
    }
  }
  const [wasm, model] = await Promise.all([
    fetchAsset(manifest.wasm, cache, onBytes),
    fetchAsset(manifest.model, cache, onBytes),
  ])

  // Single-threaded: threads need SharedArrayBuffer, which needs cross-origin isolation,
  // which the Google sign-in popup can't live with.
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmBinary = wasm.buffer
  ort.env.wasm.wasmPaths = { mjs: ownUrl(manifest.mjs) }

  // GPU only. There is deliberately no CPU fallback: it took ~6 s a cut on a fast laptop
  // and peaked around 700 MB — slow everywhere, and enough to get a phone's tab killed.
  let gpuSession: ort.InferenceSession
  try {
    gpuSession = await ort.InferenceSession.create(model, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    })
  } catch (error) {
    // An adapter that can't take this graph (limits, a blocklisted driver).
    throw new UnsupportedError(error instanceof Error ? error.message : String(error))
  }
  post({ type: 'ready' })
  return gpuSession
}

/**
 * The cut, squeezed to 1024x1024 as NCHW float32, scaled the way the model was trained:
 * divided by the brightest channel value, then shifted by -0.5 (std 1).
 */
function toInput(image: ImageBitmap): ort.Tensor {
  const canvas = new OffscreenCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, SIZE, SIZE)
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE)

  let max = 1
  for (let i = 0; i < data.length; i += 4) {
    max = Math.max(max, data[i], data[i + 1], data[i + 2])
  }
  const plane = SIZE * SIZE
  const input = new Float32Array(3 * plane)
  for (let p = 0, i = 0; p < plane; p += 1, i += 4) {
    input[p] = data[i] / max - 0.5
    input[plane + p] = data[i + 1] / max - 0.5
    input[2 * plane + p] = data[i + 2] / max - 0.5
  }
  return new ort.Tensor('float32', input, [1, 3, SIZE, SIZE])
}

/** The prediction, min-max stretched to 0..1, as the alpha of a 1024x1024 bitmap. */
function toMask(prediction: Float32Array): ImageBitmap {
  let min = Infinity
  let max = -Infinity
  for (const value of prediction) {
    if (value < min) min = value
    if (value > max) max = value
  }
  const range = max - min > 1e-6 ? max - min : 1
  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4)
  for (let p = 0; p < prediction.length; p += 1) {
    pixels[p * 4 + 3] = ((prediction[p] - min) / range) * 255
  }
  const canvas = new OffscreenCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.putImageData(new ImageData(pixels, SIZE, SIZE), 0, 0)
  return canvas.transferToImageBitmap()
}

/**
 * The session, created on first use. A failed attempt is forgotten rather than kept,
 * so the next request (or the Retry button) really tries again.
 */
async function ensureSession(): Promise<ort.InferenceSession> {
  try {
    return await (session ??= createSession())
  } catch (error) {
    session = null
    post({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      unsupported: error instanceof UnsupportedError,
    })
    throw error
  }
}

async function segment(id: string, image: ImageBitmap) {
  try {
    const model = await ensureSession()
    const input = toInput(image)
    const outputs = await model.run({ [model.inputNames[0]]: input })
    const output = outputs[model.outputNames[0]]
    const mask = toMask(output.data as Float32Array)
    input.dispose()
    output.dispose()
    post({ type: 'mask', id, mask }, [mask])
  } catch (error) {
    post({ type: 'failed', id, message: error instanceof Error ? error.message : String(error) })
  } finally {
    image.close()
  }
}

/** Warm up without a frame: fetch and compile, so the first cut doesn't wait on it. */
const load = () =>
  ensureSession().then(
    () => undefined,
    () => undefined
  )

// Requests are handled strictly one after another: a second inference running
// alongside the first would only double the peak memory, not the throughput.
let queue = Promise.resolve()
self.addEventListener('message', (event: MessageEvent<SegmenterRequest>) => {
  const request = event.data
  queue = queue.then(() => (request.type === 'load' ? load() : segment(request.id, request.image)))
})
