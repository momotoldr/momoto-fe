/**
 * Background-removal worker: runs MediaPipe's people segmenter on a captured cut and
 * returns a mask of everyone in it.
 *
 * The model is Google's "selfie multiclass" (Apache-2.0), trained on people only —
 * selfies, full body, several people in one frame — and it labels each pixel as
 * background, hair, body skin, face skin, clothes or accessories. Everything that isn't
 * background is the person. It replaced ISNet, a general *object* model that took
 * seconds of GPU time per cut on phones (freezing the screen, which shares that GPU) and
 * could drop a face as "background".
 *
 * Off the main thread so none of it stalls the arrange screen or the live camera tiles
 * beside it. Talks to `segmenter.ts` only; see `SegmenterRequest` / `SegmenterResponse`.
 */
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

import type { SegmenterRequest, SegmenterResponse } from './segmenter'

const MANIFEST_URL = '/segmentation/manifest.json'

/**
 * Long side of the image handed to the model. It works at 256x256 whatever it gets, and
 * returns masks at the size it was given — so a full-size cut only buys a larger mask
 * to read back, not a better one. The mask is stretched over the full cut afterwards.
 */
const MAX_INPUT_SIDE = 512

/**
 * The model's person/background edge is soft (it is upscaled from 256). Remapping
 * confidence from this band to 0..1 firms it up: a pixel under the low end is fully
 * background, over the high end fully person, with the blend kept between. Without it a
 * faint halo of the old background clings to everyone.
 */
const EDGE_LOW = 0.15
const EDGE_HIGH = 0.85

interface Manifest {
  /** Folder holding MediaPipe's runtime files (`vision_wasm_module_internal.*`). */
  base: string
  model: { url: string; size: number }
}

/** This device can't run the model at all — reported as final, not as a retryable error. */
class UnsupportedError extends Error {}

const post = (message: SegmenterResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, { transfer })

let segmenter: Promise<ImageSegmenter> | null = null

/**
 * A manifest path, resolved — only if it stays on our origin under `/segmentation/`.
 * The CSP would refuse a foreign script anyway; this keeps the worker from even asking.
 */
function ownUrl(path: string): string {
  const url = new URL(path, self.location.origin)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/segmentation/')) {
    throw new Error(`segmentation manifest names a foreign URL: ${path}`)
  }
  return url.href
}

/** The model, streamed so the first download can report progress. */
async function fetchModel(model: Manifest['model']): Promise<Uint8Array> {
  const response = await fetch(ownUrl(model.url))
  if (!response.ok || !response.body) throw new Error(`fetch ${model.url}: ${response.status}`)
  const bytes = new Uint8Array(model.size)
  const reader = response.body.getReader()
  let offset = 0
  let lastPosted = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (offset + value.length > bytes.length) throw new Error('model larger than the manifest')
    bytes.set(value, offset)
    offset += value.length
    if (offset - lastPosted >= model.size / 50 || offset === model.size) {
      lastPosted = offset
      post({ type: 'progress', loaded: offset, total: model.size })
    }
  }
  if (offset !== bytes.length) throw new Error('model smaller than the manifest')
  return bytes
}

async function createSegmenter(): Promise<ImageSegmenter> {
  const response = await fetch(MANIFEST_URL, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`fetch ${MANIFEST_URL}: ${response.status}`)
  const manifest = (await response.json()) as Manifest

  // `true`: the ES-module build of the runtime, which is what a module worker can load.
  const [fileset, model] = await Promise.all([
    FilesetResolver.forVisionTasks(ownUrl(manifest.base), true),
    fetchModel(manifest.model),
  ])

  const create = async (delegate: 'GPU' | 'CPU') => {
    // MediaPipe takes its runtime's factory from `self.ModuleFactory` and clears it after
    // one use, while the runtime module sets it only when first evaluated — and `import()`
    // never evaluates a module twice. So a second segmenter in this worker (the CPU retry
    // after a failed GPU attempt) would find nothing and throw "ModuleFactory not set".
    // Put it back from the module's own default export first.
    const scope = self as typeof globalThis & { ModuleFactory?: unknown }
    scope.ModuleFactory ??= (
      (await import(/* @vite-ignore */ fileset.wasmLoaderPath)) as { default: unknown }
    ).default
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    })
  }

  let created: ImageSegmenter
  try {
    // WebGL2 in the worker's own OffscreenCanvas, where the browser has it.
    created = await create('GPU')
  } catch {
    try {
      // No WebGL2 in workers (older Safari) or a blocklisted driver: the CPU runs this
      // model in a couple of hundred milliseconds, so it is still worth offering.
      created = await create('CPU')
    } catch (error) {
      throw new UnsupportedError(error instanceof Error ? error.message : String(error))
    }
  }
  post({ type: 'ready' })
  return created
}

/**
 * The segmenter, created on first use. A failed attempt is forgotten rather than kept,
 * so the next request (or the Retry button) really tries again.
 */
async function ensureSegmenter(): Promise<ImageSegmenter> {
  try {
    return await (segmenter ??= createSegmenter())
  } catch (error) {
    segmenter = null
    post({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      unsupported: error instanceof UnsupportedError,
    })
    throw error
  }
}

/** The cut, scaled down so its long side is at most `MAX_INPUT_SIDE`. */
function toInput(image: ImageBitmap): OffscreenCanvas {
  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(image.width, image.height))
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale))
  )
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** "Not background", as the alpha of a bitmap the size of the model's input. */
function toMask(background: Float32Array, width: number, height: number): ImageBitmap {
  const pixels = new Uint8ClampedArray(width * height * 4)
  const span = EDGE_HIGH - EDGE_LOW
  for (let p = 0; p < background.length; p += 1) {
    const person = (1 - background[p] - EDGE_LOW) / span
    pixels[p * 4 + 3] = Math.min(1, Math.max(0, person)) * 255
  }
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0)
  return canvas.transferToImageBitmap()
}

async function segment(id: string, image: ImageBitmap) {
  try {
    const model = await ensureSegmenter()
    const result = model.segment(toInput(image))
    try {
      const labels = model.getLabels()
      const index = Math.max(0, labels.indexOf('background'))
      const background = result.confidenceMasks?.[index]
      if (!background) throw new Error('segmenter returned no background mask')
      const mask = toMask(background.getAsFloat32Array(), background.width, background.height)
      post({ type: 'mask', id, mask }, [mask])
    } finally {
      result.close()
    }
  } catch (error) {
    post({ type: 'failed', id, message: error instanceof Error ? error.message : String(error) })
  } finally {
    image.close()
  }
}

/** Warm up without a frame: fetch and compile, so the first cut doesn't wait on it. */
const load = () =>
  ensureSegmenter().then(
    () => undefined,
    () => undefined
  )

// One request at a time: the segmenter is a single graph, and running cuts side by side
// would only contend for the same GPU.
let queue = Promise.resolve()
self.addEventListener('message', (event: MessageEvent<SegmenterRequest>) => {
  const request = event.data
  queue = queue.then(() => (request.type === 'load' ? load() : segment(request.id, request.image)))
})
