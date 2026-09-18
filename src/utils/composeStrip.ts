import type { CapturedFrame } from '@/utils/captureFrame'
import type { PlacedSticker } from '@/constants/stickers'
import type { StripTemplate } from '@/constants/stripTemplates'

import { STRIP_TEXT_COLOR, STRIP_TITLE, STRIP_WATERMARK } from '@/constants/strips'

export interface ComposeOptions {
  /** The strip template: SVG background + fixed photo slots. Required. */
  template: StripTemplate
  title?: string
  subtitle?: string
  /**
   * CSS/Canvas filter string applied to the photos (not the background/footer).
   * `'none'` or omitted leaves them untouched.
   */
  filter?: string
  /** Stickers to draw over the strip (positions are full-strip fractions). */
  stickers?: PlacedSticker[]
  /**
   * Tile a diagonal wordmark over the photos. Defaults to `true` (a free strip
   * is always watermarked). A future paid download passes `false` for a clean
   * strip.
   */
  watermark?: boolean
  /** Watermark wordmark to tile (defaults to the brand mark). */
  watermarkText?: string
  /**
   * How to encode the result.
   *
   * `'preview'` is lossy WebP — the watermarked copy, which is only ever looked at on
   * a screen. `'archival'` is *lossless* WebP for the clean copy, because that is the
   * paid deliverable and is re-encoded back to PNG in the browser when it is
   * downloaded; a lossy generation there would be baked into what someone paid for.
   *
   * Both are far smaller than the PNG this used to emit — roughly 90% for the preview
   * and 50% for the archival copy, on real strips — which is most of the upload a
   * phone on mobile data has to push, and most of what the bucket then holds.
   */
  encoding?: 'preview' | 'archival'
}

export interface ComposedStrip {
  dataUrl: string
  width: number
  height: number
  /**
   * A small preview of the same canvas, or null when the browser could not encode one.
   *
   * Rendered here rather than on the server: the pixels are already in a canvas, so
   * this costs one `drawImage`, while on the server the same preview meant decoding,
   * resizing and re-encoding a multi-megabyte image — measured at 99% of the CPU a
   * save spent there. Only the watermarked copy gets one; the clean copy is never
   * shown in a grid.
   */
  thumbnailDataUrl: string | null
}

/** Mirrors `momoto-core/src/storage/thumbnail.ts` — keep the two in step. */
const THUMBNAIL_MAX_WIDTH = 400
const THUMBNAIL_MAX_HEIGHT = 1200
const THUMBNAIL_QUALITY = 0.8

/**
 * Scale the composed canvas down into the preview the cart and gallery grids use.
 *
 * Returns null rather than throwing: a missing thumbnail is not a failed save. The
 * server renders one itself when none arrives, and the API falls back to serving the
 * full image as the preview if that fails too.
 */
function encodeThumbnail(canvas: HTMLCanvasElement): string | null {
  const scale = Math.min(
    THUMBNAIL_MAX_WIDTH / canvas.width,
    THUMBNAIL_MAX_HEIGHT / canvas.height,
    1,
  )
  const width = Math.max(1, Math.floor(canvas.width * scale))
  const height = Math.max(1, Math.floor(canvas.height * scale))
  try {
    const small = document.createElement('canvas')
    small.width = width
    small.height = height
    const ctx = small.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, 0, 0, width, height)
    const url = small.toDataURL('image/webp', THUMBNAIL_QUALITY)
    // `toDataURL` falls back to PNG when it cannot encode the type asked for, and the
    // server only accepts WebP here — so hand back nothing rather than a PNG it will
    // reject and silently re-render anyway.
    return url.startsWith('data:image/webp') ? url : null
  } catch {
    return null
  }
}

/**
 * Encode the canvas, preferring WebP and falling back to PNG.
 *
 * `toDataURL` is specified to return a PNG when it cannot produce the type asked for,
 * so a browser without canvas WebP encoding degrades on its own — and the server
 * accepts both, so nothing downstream has to know which one happened.
 *
 * Quality 1 is what makes the archival copy lossless rather than merely high-quality;
 * verified bit-identical through a full encode/decode round trip.
 */
function encodeCanvas(canvas: HTMLCanvasElement, encoding: 'preview' | 'archival'): string {
  return canvas.toDataURL('image/webp', encoding === 'archival' ? 1 : 0.9)
}

const FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

// Keep the composed canvas within sane bounds regardless of camera resolution.
const MIN_CANVAS_WIDTH = 600
const MAX_CANVAS_WIDTH = 1400

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    img.src = src
  })
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * Fit an image inside a square box of `box` px, preserving its aspect ratio —
 * the canvas equivalent of `object-fit: contain`. Falls back to filling the box
 * when the image reports no intrinsic size (an SVG with no width/height), which
 * is the old behaviour and the best guess available.
 */
function containSize(img: HTMLImageElement, box: number): { width: number; height: number } {
  const natW = img.naturalWidth
  const natH = img.naturalHeight
  if (!natW || !natH) return { width: box, height: box }
  const scale = box / Math.max(natW, natH)
  return { width: natW * scale, height: natH * scale }
}

/** Draw an image into a target rect, cover-cropped (fill, center) — no distortion. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih) return
  const scale = Math.max(dw / iw, dh / ih)
  const sw = dw / scale
  const sh = dh / scale
  const sx = (iw - sw) / 2
  const sy = (ih - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}

/**
 * Tile `text` diagonally across the rect (x, y, w, h), clipped to that box.
 * A translucent white fill + dark stroke keeps it legible over both light and
 * dark photos. Drawn last so no sticker can cover it and no crop can remove it.
 */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  fontSize: number
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate((-30 * Math.PI) / 180)

  ctx.font = `700 ${fontSize}px ${FONT_STACK}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.38)'
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)'
  ctx.lineWidth = Math.max(1, fontSize * 0.02)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const stepX = ctx.measureText(text).width + fontSize * 1.2
  const stepY = fontSize * 2.4
  // Reach past the rotated bounding box so tiles cover the corners after rotation.
  const reach = Math.ceil(Math.hypot(w, h) / 2) + fontSize
  for (let ty = -reach; ty <= reach; ty += stepY) {
    // Brick-offset alternate rows so the pattern reads as a grid, not columns.
    const rowOffset = (Math.round(ty / stepY) % 2) * (stepX / 2)
    for (let tx = -reach - stepX; tx <= reach + stepX; tx += stepX) {
      ctx.fillText(text, tx + rowOffset, ty)
      ctx.strokeText(text, tx + rowOffset, ty)
    }
  }
  ctx.restore()
}

/**
 * Compose the captured cuts onto a template strip and return a full-resolution PNG
 * data URL. The template's SVG art is drawn as the background; each cut is
 * cover-cropped into its fixed slot on top; then the (optional) date footer,
 * stickers, and watermark. Returns `null` if there are no frames or the canvas
 * can't be created.
 */
export async function composeStrip(
  frames: CapturedFrame[],
  options: ComposeOptions
): Promise<ComposedStrip | null> {
  if (frames.length === 0) return null

  const { template } = options
  const title = options.title ?? STRIP_TITLE
  const subtitle = options.subtitle ?? formatDate(new Date())
  const slots = template.slots

  const images = await Promise.all(frames.map((frame) => loadImage(frame.dataUrl)))

  // Size the canvas so the busiest photo isn't upscaled: for each filled slot, the
  // canvas width needed to render that photo at native width is img.width / slot.w.
  const neededWidth = images.reduce((max, img, index) => {
    const slot = slots[index]
    if (!slot) return max
    return Math.max(max, img.naturalWidth / slot.w)
  }, MIN_CANVAS_WIDTH)
  const width = Math.round(Math.min(MAX_CANVAS_WIDTH, Math.max(MIN_CANVAS_WIDTH, neededWidth)))
  const height = Math.round(width / template.aspect)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Background: the template SVG scaled to fill. Best-effort — if it can't be
  // decoded, fall back to white so the photos still compose.
  try {
    const bg = await loadImage(template.src)
    ctx.drawImage(bg, 0, 0, width, height)
  } catch {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }

  // Photos, cover-cropped into their slots (filter baked into the photos only).
  const filter = options.filter && options.filter !== 'none' ? options.filter : null
  if (filter) ctx.filter = filter
  images.forEach((img, index) => {
    const slot = slots[index]
    if (!slot) return
    const dx = slot.x * width
    const dy = slot.y * height
    const dw = slot.w * width
    const dh = slot.h * height
    // Rounded frames (green-red) need the photo clipped to the same corner, or a
    // square cut would poke past the art's white plate.
    const radius = slot.radius ? Math.min(slot.radius * width, dw / 2, dh / 2) : 0
    if (radius > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(dx, dy, dw, dh, radius)
      ctx.clip()
    }
    drawCover(ctx, img, dx, dy, dw, dh)
    if (radius > 0) ctx.restore()
  })
  if (filter) ctx.filter = 'none'

  // Optional dynamic date/title footer, centered on the template's footer band.
  if (template.footer) {
    const titleSize = Math.round(width * 0.045)
    const subtitleSize = Math.round(width * 0.03)
    const centerX = width / 2
    const centerY = template.footer.y * height
    ctx.fillStyle = template.footer.color ?? STRIP_TEXT_COLOR
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${titleSize}px ${FONT_STACK}`
    ctx.fillText(title, centerX, centerY - subtitleSize * 0.7)
    ctx.font = `400 ${subtitleSize}px ${FONT_STACK}`
    ctx.fillText(subtitle, centerX, centerY + titleSize * 0.7)
  }

  // Stickers sit on top of the photos. Positions are fractions of the whole strip,
  // mirroring the live preview's overlay so the download matches. Each sticker gets a
  // square layout box sized relative to the strip width, and the art is fitted inside
  // it preserving its aspect ratio — the same `object-fit: contain` the preview's
  // `<img>` uses, so non-square art (the snail, the frog) isn't stretched here.
  const stickers = options.stickers ?? []
  const stickerImages = new Map<string, HTMLImageElement>()
  await Promise.all(
    [...new Set(stickers.map((sticker) => sticker.src))].map(async (src) => {
      try {
        stickerImages.set(src, await loadImage(src))
      } catch {
        /* skip a sticker that can't be decoded */
      }
    })
  )
  stickers.forEach((sticker) => {
    const img = stickerImages.get(sticker.src)
    if (!img) return
    const cx = sticker.x * width
    const cy = sticker.y * height
    const boxSize = Math.max(1, sticker.size * width)
    const { width: drawW, height: drawH } = containSize(img, boxSize)
    const halfW = drawW / 2
    const halfH = drawH / 2
    const rotation = sticker.rotation ?? 0
    if (rotation) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(img, -halfW, -halfH, drawW, drawH)
      ctx.restore()
    } else {
      ctx.drawImage(img, cx - halfW, cy - halfH, drawW, drawH)
    }
  })

  // Watermark last: over photos + stickers, clipped to the bounding box of the photo
  // slots, so it can't be hidden or cropped out. Skipped only for a (future) paid strip.
  if (options.watermark !== false && slots.length > 0) {
    const minX = Math.min(...slots.map((s) => s.x)) * width
    const minY = Math.min(...slots.map((s) => s.y)) * height
    const maxX = Math.max(...slots.map((s) => s.x + s.w)) * width
    const maxY = Math.max(...slots.map((s) => s.y + s.h)) * height
    drawWatermark(
      ctx,
      minX,
      minY,
      maxX - minX,
      maxY - minY,
      options.watermarkText ?? STRIP_WATERMARK,
      Math.round(width * 0.09)
    )
  }

  const encoding = options.encoding ?? 'preview'
  return {
    dataUrl: encodeCanvas(canvas, encoding),
    width,
    height,
    // The clean copy is never shown in a grid, so it needs no preview.
    thumbnailDataUrl: encoding === 'preview' ? encodeThumbnail(canvas) : null,
  }
}
