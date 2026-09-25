/**
 * Main-thread client for the background-removal worker.
 *
 * One worker for the page, started the first time something asks for it — a booth that
 * never picks a backdrop never downloads the model. Progress and failure are published
 * on `useSegmenterStore`; masks come back as promises.
 */
import { useSegmenterStore } from '@/store/useSegmenterStore'

export type SegmenterRequest =
  { type: 'load' } | { type: 'segment'; id: string; image: ImageBitmap }

export type SegmenterResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  /** `unsupported`: this device can't run it at all (no usable WebGPU) — don't retry. */
  | { type: 'error'; message: string; unsupported?: boolean }
  | { type: 'mask'; id: string; mask: ImageBitmap }
  | { type: 'failed'; id: string; message: string }

interface Pending {
  resolve: (mask: ImageBitmap) => void
  reject: (error: Error) => void
}

/**
 * The smallest module using a SIMD instruction (a `v128.const`), per wasm-feature-detect.
 * onnxruntime-web ships SIMD builds only, so without this nothing can run.
 */
// prettier-ignore
const SIMD_PROBE = Uint8Array.of(
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253,
  15, 253, 98, 11
)

/** Below this, a device that reports its memory is left out. */
const MIN_DEVICE_MEMORY_GB = 4

interface GpuAdapterLike {
  isFallbackAdapter?: boolean
  info?: { isFallbackAdapter?: boolean }
}
type CapableNavigator = Navigator & {
  deviceMemory?: number
  gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> }
}

let supportCheck: Promise<boolean> | null = null

/**
 * Whether this device can run backdrops — decided before anything is downloaded, and
 * strictly: a device that would only manage it slowly, or might run out of memory
 * doing it, is left out rather than tried.
 *
 * - **WebGPU with a hardware adapter.** The only path offered. On the GPU a cut takes
 *   ~0.2 s; the CPU fallback took ~6 s on a fast laptop (a minute or more for a strip on
 *   a phone) and peaked around 700 MB, enough for the OS to kill the tab. A software
 *   ("fallback") adapter is the CPU path in disguise, so it doesn't count.
 * - **At least 4 GB of RAM** where the browser says (Chromium only). iPhones don't
 *   report it, but WebGPU only arrived with iOS 26, whose oldest devices have 4 GB.
 * - **WebAssembly SIMD and a 2D `OffscreenCanvas` in a worker**, which the runtime and
 *   the pre-processing need.
 *
 * Cached for the page: none of it changes without a new browser.
 */
export function checkBackdropSupport(): Promise<boolean> {
  supportCheck ??= (async () => {
    try {
      if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') return false
      if (typeof OffscreenCanvas === 'undefined') return false
      if (typeof OffscreenCanvasRenderingContext2D === 'undefined') return false
      if (typeof WebAssembly !== 'object' || !WebAssembly.validate(SIMD_PROBE)) return false
      const nav = navigator as CapableNavigator
      if (nav.deviceMemory !== undefined && nav.deviceMemory < MIN_DEVICE_MEMORY_GB) return false
      const adapter = await nav.gpu?.requestAdapter()
      if (!adapter) return false
      return !(adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter ?? false)
    } catch {
      return false
    }
  })()
  return supportCheck
}

let worker: Worker | null = null
const pending = new Map<string, Pending>()
let nextId = 0

/**
 * How long an idle worker is kept before it's shut down.
 *
 * WebAssembly memory only ever grows, and the GPU buffers go with the session: after one
 * run the worker holds its whole peak for as long as it lives, even with nothing to do.
 * Terminating it is the only way to hand that back, and bringing it up again costs
 * under a second once the model is in Cache Storage. Long enough to cover flicking
 * between backdrops and a single-slot retake; short enough that the booth doesn't sit
 * on the memory while people are just talking.
 */
const IDLE_MS = 30_000
let idleTimer: number | undefined

function cancelIdle() {
  window.clearTimeout(idleTimer)
  idleTimer = undefined
}

/** Arm the shutdown once the worker is loaded and has nothing queued. */
function scheduleIdle() {
  cancelIdle()
  if (!worker || pending.size > 0 || useSegmenterStore.getState().phase !== 'ready') return
  idleTimer = window.setTimeout(() => {
    if (!worker || pending.size > 0) return
    worker.terminate()
    worker = null
    // Back to the start: the next request loads it again (from cache, no download).
    useSegmenterStore.setState({ phase: 'idle', loaded: 0, total: 0 })
  }, IDLE_MS)
}

function failAll(error: Error) {
  for (const request of pending.values()) request.reject(error)
  pending.clear()
}

function onMessage(event: MessageEvent<SegmenterResponse>) {
  const message = event.data
  switch (message.type) {
    case 'progress':
      useSegmenterStore.setState({ loaded: message.loaded, total: message.total })
      break
    case 'ready':
      useSegmenterStore.setState({ phase: 'ready' })
      scheduleIdle()
      break
    case 'error':
      // A device that passed the up-front check but still can't start the GPU session
      // (a blocklisted driver, a worker without WebGPU) is out for the rest of the page —
      // retrying would fail the same way.
      useSegmenterStore.setState({ phase: message.unsupported ? 'unsupported' : 'error' })
      if (message.unsupported) {
        failAll(new Error(message.message))
        worker?.terminate()
        worker = null
      }
      break
    case 'mask':
      pending.get(message.id)?.resolve(message.mask)
      pending.delete(message.id)
      scheduleIdle()
      break
    case 'failed':
      pending.get(message.id)?.reject(new Error(message.message))
      pending.delete(message.id)
      scheduleIdle()
      break
  }
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./segmentation.worker.ts', import.meta.url), { type: 'module' })
  worker.addEventListener('message', onMessage)
  // The script itself failed (a CSP refusal, a 404 after a deploy). Nothing queued will
  // ever answer, so fail it all and start a fresh worker next time.
  worker.addEventListener('error', () => {
    cancelIdle()
    worker?.terminate()
    worker = null
    useSegmenterStore.setState({ phase: 'error' })
    failAll(new Error('segmentation worker failed'))
  })
  return worker
}

/**
 * Start fetching and compiling the model. Idempotent while loading or ready; after an
 * error it tries again.
 */
export function loadSegmenter() {
  const { phase } = useSegmenterStore.getState()
  if (phase === 'loading' || phase === 'ready' || phase === 'unsupported') return
  cancelIdle()
  useSegmenterStore.setState({ phase: 'loading', loaded: 0, total: 0 })
  getWorker().postMessage({ type: 'load' } satisfies SegmenterRequest)
}

/**
 * The foreground mask for `image`: a 1024x1024 bitmap whose alpha is the subject,
 * stretched over the whole cut — scale it back to the cut's own size to use it.
 *
 * `image` is transferred, so it's unusable here afterwards.
 */
export function segmentImage(image: ImageBitmap): Promise<ImageBitmap> {
  if (useSegmenterStore.getState().phase === 'unsupported') {
    image.close()
    return Promise.reject(new Error('background removal is not supported on this device'))
  }
  loadSegmenter()
  const id = String((nextId += 1))
  cancelIdle()
  return new Promise<ImageBitmap>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ type: 'segment', id, image } satisfies SegmenterRequest, [image])
  })
}
