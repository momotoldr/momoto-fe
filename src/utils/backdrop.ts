/**
 * Replace the background of captured cuts with a backdrop.
 *
 * Two stages, cached separately because they cost very different amounts:
 *
 * 1. **Cutout** — the people in a cut, with the background made transparent. Needs a
 *    model inference (seconds on the CPU path), so it's done once per cut and kept for
 *    as long as the cut is in play.
 * 2. **Composite** — backdrop, then cutout, encoded as a frame. Two `drawImage`s and an
 *    async encode, so flicking between backdrops stays quick once the cutouts exist.
 *
 * Composites come back as ordinary `CapturedFrame`s (same id, a `blob:` URL in place of
 * the data URL), so the arrange screen and `composeStrip` take them unchanged. The
 * original frames are never touched: they're what gets stored, and the backdrop is
 * re-applied from them wherever a strip is composed.
 */
import { BACKDROP_MAP, type BackdropId } from '@/constants/backdrops'
import type { CapturedFrame } from '@/utils/captureFrame'
import { segmentImage } from '@/utils/segmentation/segmenter'

/** Two strips' worth — a retake or a fresh run replaces cuts, and the old ones age out. */
const CUTOUT_LIMIT = 8
/** Four cuts across four backdrops before the oldest is dropped. */
const COMPOSITE_LIMIT = 16

interface Entry<T> {
  promise: Promise<T>
  /** Set once settled successfully, so a render can read it without awaiting. */
  value?: T
}

/**
 * A small insertion-ordered LRU of in-flight or settled work. A failed entry removes
 * itself, so asking again retries instead of replaying the failure.
 */
class WorkCache<T> {
  private entries = new Map<string, Entry<T>>()

  constructor(
    private limit: number,
    private dispose: (value: T) => void
  ) {}

  get(key: string, make: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key)
    if (hit) {
      this.entries.delete(key)
      this.entries.set(key, hit)
      return hit.promise
    }
    const entry: Entry<T> = {
      promise: make().then(
        (value) => {
          // Evicted while in flight: nobody can reach it through the cache any more.
          if (this.entries.get(key) !== entry) this.dispose(value)
          else entry.value = value
          return value
        },
        (error: unknown) => {
          if (this.entries.get(key) === entry) this.entries.delete(key)
          throw error
        }
      ),
    }
    this.entries.set(key, entry)
    while (this.entries.size > this.limit) {
      const [oldest, evicted] = this.entries.entries().next().value as [string, Entry<T>]
      this.entries.delete(oldest)
      if (evicted.value !== undefined) this.dispose(evicted.value)
    }
    return entry.promise
  }

  peek(key: string): T | undefined {
    return this.entries.get(key)?.value
  }
}

const cutouts = new WorkCache<ImageBitmap>(CUTOUT_LIMIT, (bitmap) => bitmap.close())
const composites = new WorkCache<CapturedFrame>(COMPOSITE_LIMIT, (frame) =>
  URL.revokeObjectURL(frame.dataUrl)
)
const backdropImages = new Map<string, Promise<HTMLImageElement>>()

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image failed to load: ${src.slice(0, 64)}`))
    img.src = src
  })
}

function loadBackdrop(src: string): Promise<HTMLImageElement> {
  let image = backdropImages.get(src)
  if (!image) {
    image = loadImage(src)
    image.catch(() => backdropImages.delete(src))
    backdropImages.set(src, image)
  }
  return image
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return { canvas, ctx }
}

/** The cut with its background made transparent, at the cut's own size. */
function cutout(frame: CapturedFrame): Promise<ImageBitmap> {
  return cutouts.get(frame.id, async () => {
    const photo = await loadImage(frame.dataUrl)
    const mask = await segmentImage(await createImageBitmap(photo))
    try {
      const { canvas, ctx } = canvasOf(frame.width, frame.height)
      // The mask comes back squeezed to 1024x1024; stretching it over the cut undoes
      // the squeeze, and smoothing turns the upscale into a soft edge rather than steps.
      ctx.drawImage(mask, 0, 0, frame.width, frame.height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(photo, 0, 0, frame.width, frame.height)
      return await createImageBitmap(canvas)
    } finally {
      mask.close()
    }
  })
}

/** Draw `image` to fill the canvas, centre-cropped. */
function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, w: number, h: number) {
  const iw = image.naturalWidth || w
  const ih = image.naturalHeight || h
  const scale = Math.max(w / iw, h / ih)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h)
}

const compositeKey = (frame: CapturedFrame, backdrop: BackdropId) => `${frame.id}|${backdrop}`

/**
 * `frame` in front of `backdrop`. Resolves to the frame itself for `none`.
 *
 * Encoded as PNG, like the cut it replaces: the clean strip is lossless end to end, and
 * a lossy generation here would be baked into it.
 */
export function withBackdrop(frame: CapturedFrame, backdrop: BackdropId): Promise<CapturedFrame> {
  const src = BACKDROP_MAP[backdrop]?.src
  if (!src) return Promise.resolve(frame)
  return composites.get(compositeKey(frame, backdrop), async () => {
    const [art, subject] = await Promise.all([loadBackdrop(src), cutout(frame)])
    const { canvas, ctx } = canvasOf(frame.width, frame.height)
    drawCover(ctx, art, frame.width, frame.height)
    ctx.drawImage(subject, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('backdrop encode failed')
    return { ...frame, dataUrl: URL.createObjectURL(blob) }
  })
}

/** The composite if it's already made, for rendering without waiting. */
export function peekBackdrop(
  frame: CapturedFrame,
  backdrop: BackdropId
): CapturedFrame | undefined {
  if (!BACKDROP_MAP[backdrop]?.src) return frame
  return composites.peek(compositeKey(frame, backdrop))
}

/** Every frame in front of `backdrop`, in order. */
export function framesWithBackdrop(
  frames: CapturedFrame[],
  backdrop: BackdropId
): Promise<CapturedFrame[]> {
  return Promise.all(frames.map((frame) => withBackdrop(frame, backdrop)))
}
