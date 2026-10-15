import type { ScrapbookPage, ScrapbookTemplate } from '@/constants/scrapbookTemplates'
import type { ScrapbookContent } from '@/types/scrapbookType'
import { loadImage } from '@/utils/composeStrip'
import {
  layoutScrapbookText,
  loadScrapbookFonts,
  scrapbookFont,
} from '@/utils/scrapbook/layoutText'

/** Anything a strip can be drawn from: a decoded download, an `<img>`, another canvas. */
export type ScrapbookImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement

function sizeOf(image: ScrapbookImage): { width: number; height: number } {
  return image instanceof HTMLImageElement
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height }
}

/**
 * Draw one scrapbook page onto a canvas (docs/PLAN-scrapbook.md §5): the page art, then
 * each filled strip slot (contain-fitted — a strip is never cropped, whatever its shape —
 * rotated about the slot's centre), then that slot's tape or corners, then the text.
 *
 * `images` maps a strip id to its pixels. A slot whose strip has no image — removed from
 * the gallery since, or not loaded — is skipped and reads as blank paper, exactly like an
 * empty one; its decoration is skipped with it.
 *
 * Text comes from `layoutScrapbookText`, the same lines the editor shows, and is clipped
 * to `maxLines` so content that somehow outgrew its slot can't spill over the art.
 *
 * `width` defaults to the template's render width (one 300 dpi A5 page); pass less for a
 * preview. The caller owns the canvas and should drop it once encoded — on a phone, one
 * full page at a time is what fits.
 */
export async function composeScrapbookPage(
  template: ScrapbookTemplate,
  page: ScrapbookPage,
  content: ScrapbookContent,
  images: ReadonlyMap<string, ScrapbookImage>,
  width: number = template.renderWidth
): Promise<HTMLCanvasElement> {
  const height = Math.round(width / template.aspect)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const decorations = [
    ...new Set(page.strips.flatMap((slot) => (slot.decoration ? [slot.decoration.src] : []))),
  ]
  const [background, decorationImages] = await Promise.all([
    loadImage(page.background),
    Promise.all(decorations.map(async (src) => [src, await loadImage(src)] as const)),
    loadScrapbookFonts(),
  ]).then(([bg, decos]) => [bg, new Map(decos)] as const)

  ctx.drawImage(background, 0, 0, width, height)

  for (const slot of page.strips) {
    const stripId = content.strips[slot.id]
    const image = stripId ? images.get(stripId) : undefined
    if (!image) continue
    const boxW = slot.w * width
    const boxH = slot.h * height
    const natural = sizeOf(image)
    if (!natural.width || !natural.height) continue
    const scale = Math.min(boxW / natural.width, boxH / natural.height)
    const drawW = natural.width * scale
    const drawH = natural.height * scale

    ctx.save()
    ctx.translate(slot.x * width + boxW / 2, slot.y * height + boxH / 2)
    ctx.rotate((slot.rotate * Math.PI) / 180)
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH)
    const deco = slot.decoration ? decorationImages.get(slot.decoration.src) : undefined
    if (slot.decoration && deco) {
      const margin = slot.decoration.margin * width
      ctx.drawImage(
        deco,
        -boxW / 2 - margin,
        -boxH / 2 - margin,
        boxW + 2 * margin,
        boxH + 2 * margin
      )
    }
    ctx.restore()
  }

  ctx.textBaseline = 'middle'
  for (const slot of page.texts) {
    const text = content.texts[slot.id]
    if (!text) continue
    const lines = layoutScrapbookText(text, slot).lines.slice(0, slot.maxLines)
    const lineHeight = slot.size * width * slot.lineHeight
    const left = slot.x * width
    const anchor =
      slot.align === 'center'
        ? left + (slot.w * width) / 2
        : slot.align === 'right'
          ? left + slot.w * width
          : left
    ctx.font = scrapbookFont(slot, width)
    ctx.fillStyle = slot.color
    ctx.textAlign = slot.align
    // 'middle' of each line box, which is where CSS centres a line's glyphs within its
    // `line-height` — so the editor's DOM lines land where these do.
    lines.forEach((line, index) => {
      ctx.fillText(line, anchor, slot.y * height + (index + 0.5) * lineHeight)
    })
  }

  return canvas
}
