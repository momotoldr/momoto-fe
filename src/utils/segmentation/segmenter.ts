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
  | { type: 'ready'; backend: 'webgpu' | 'wasm' }
  | { type: 'error'; message: string }
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
const SIMD_PROBE = Uint8Array.of(
  0,
  97,
  115,
  109,
  1,
  0,
  0,
  0,
  1,
  5,
  1,
  96,
  0,
  1,
  123,
  3,
  2,
  1,
  0,
  10,
  10,
  1,
  8,
  0,
  65,
  0,
  253,
  15,
  253,
  98,
  11
)

/**
 * Whether this device can run the background remover — checked before anything is
 * downloaded, so an unsupported phone isn't sent ~50 MB only to fail.
 *
 * Hard requirements: WebAssembly SIMD (Chrome/Edge 91, Firefox 89, Safari 16.4) and a 2D
 * `OffscreenCanvas` in a worker (Firefox 105, Safari 16.4). Memory is a soft one: the CPU
 * path peaks around 700 MB, so a device that reports under 4 GB and has no WebGPU to take
 * the load off is left out, as is anything under 2 GB. Only Chromium reports
 * `deviceMemory`; elsewhere this can't be judged ahead of time, and a failure lands on
 * the retry screen instead.
 */
export function canRunBackdrops(): boolean {
  try {
    if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') return false
    if (typeof OffscreenCanvas === 'undefined') return false
    if (typeof OffscreenCanvasRenderingContext2D === 'undefined') return false
    if (typeof WebAssembly !== 'object' || !WebAssembly.validate(SIMD_PROBE)) return false
  } catch {
    return false
  }
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown }
  const memory = nav.deviceMemory
  if (memory !== undefined && (memory < 2 || (memory < 4 && !nav.gpu))) return false
  return true
}

let worker: Worker | null = null
const pending = new Map<string, Pending>()
let nextId = 0

/**
 * How long an idle worker is kept before it's shut down.
 *
 * WebAssembly memory only ever grows: after one run the worker holds its whole peak —
 * ~700 MB on the CPU path — for as long as it lives, even with nothing left to do.
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
    useSegmenterStore.setState({ phase: 'idle', loaded: 0, total: 0, backend: null })
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
      useSegmenterStore.setState({ phase: 'ready', backend: message.backend })
      scheduleIdle()
      break
    case 'error':
      useSegmenterStore.setState({ phase: 'error' })
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
  if (phase === 'loading' || phase === 'ready') return
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
  loadSegmenter()
  const id = String((nextId += 1))
  cancelIdle()
  return new Promise<ImageBitmap>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ type: 'segment', id, image } satisfies SegmenterRequest, [image])
  })
}
