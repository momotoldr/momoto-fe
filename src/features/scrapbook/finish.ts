import ApiError from '@/api/apiError'
import { shouldFallBack, shouldRetryDirect } from '@/api/directUpload'
import {
  finishScrapbookDirect,
  finishScrapbookThroughApi,
  getScrapbook,
  type ScrapbookFinishFiles,
} from '@/api/services/scrapbooksService'
import { fetchPrintBlob } from '@/api/services/stripsService'
import type { ScrapbookTemplate } from '@/constants/scrapbookTemplates'
import type { Scrapbook, ScrapbookContent } from '@/types/scrapbookType'
import { composeScrapbookPage, type ScrapbookImage } from '@/utils/scrapbook/composePage'
import { jpegPagesToPdf, type PdfPageImage } from '@/utils/scrapbook/jpegPdf'

/**
 * Finishing a scrapbook (docs/PLAN-scrapbook.md §7): render every page in the browser into
 * a PDF from the strips' **clean** copies, then upload it with its cover. The server never
 * renders a page.
 */

/** JPEG quality of each page. Plan §7a sizes a flat-art scrapbook at ~2.3–2.5 MB at this. */
const PAGE_QUALITY = 0.88
/** The cover preview's width; the shelf and Purchases never show it larger. */
const COVER_WIDTH = 600
const COVER_QUALITY = 0.8

export type FinishProgress =
  { stage: 'saving' } | { stage: 'rendering'; page: number; total: number } | { stage: 'uploading' }

/** The user cancelled while pages were rendering. Nothing was uploaded. */
export class FinishCancelled extends Error {
  constructor() {
    super('finish_cancelled')
    this.name = 'FinishCancelled'
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))),
      type,
      quality
    )
  })
}

/**
 * The cover preview: WebP where the browser can encode it, else JPEG. Safari's canvas
 * returns PNG when asked for WebP — the server takes WebP or JPEG, and a PNG of a photo
 * page would be too large to be a preview anyway.
 */
async function encodeCover(page: HTMLCanvasElement): Promise<Blob> {
  const small = document.createElement('canvas')
  small.width = COVER_WIDTH
  small.height = Math.round((page.height / page.width) * COVER_WIDTH)
  const ctx = small.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(page, 0, 0, small.width, small.height)
  const webp = await canvasBlob(small, 'image/webp', COVER_QUALITY)
  const cover =
    webp.type === 'image/webp' ? webp : await canvasBlob(small, 'image/jpeg', COVER_QUALITY)
  small.width = 0
  return cover
}

/**
 * Render the scrapbook into its PDF and cover, one page at a time.
 *
 * Each strip's clean copy is fetched straight from R2 (`fetchPrintBlob`), decoded once,
 * and closed after the last page that uses it; each page's canvas is dropped as soon as
 * it is encoded — so a phone holds one page and the strips still to come, never the whole
 * book. A strip that has left the gallery (404) is skipped and its slot prints empty, as
 * the editor shows it; any other fetch failure stops the finish, since printing a gap the
 * user didn't choose would be worse than asking them to try again.
 */
export async function renderScrapbookFiles(
  template: ScrapbookTemplate,
  content: ScrapbookContent,
  onProgress: (progress: FinishProgress) => void,
  signal: AbortSignal
): Promise<ScrapbookFinishFiles> {
  // The last page each strip appears on, so its bitmap can be released right after.
  const lastUse = new Map<string, number>()
  template.pages.forEach((page, index) => {
    for (const slot of page.strips) {
      const stripId = content.strips[slot.id]
      if (stripId) lastUse.set(stripId, index)
    }
  })

  const images = new Map<string, ScrapbookImage>()
  const pdfPages: PdfPageImage[] = []
  let cover: Blob | null = null

  try {
    for (const [index, page] of template.pages.entries()) {
      if (signal.aborted) throw new FinishCancelled()
      onProgress({ stage: 'rendering', page: index + 1, total: template.pages.length })

      for (const slot of page.strips) {
        const stripId = content.strips[slot.id]
        if (!stripId || images.has(stripId)) continue
        try {
          images.set(stripId, await createImageBitmap(await fetchPrintBlob(stripId)))
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) continue
          throw error
        }
      }
      if (signal.aborted) throw new FinishCancelled()

      const canvas = await composeScrapbookPage(template, page, content, images)
      const jpeg = await canvasBlob(canvas, 'image/jpeg', PAGE_QUALITY)
      pdfPages.push({
        jpeg: new Uint8Array(await jpeg.arrayBuffer()),
        width: canvas.width,
        height: canvas.height,
      })
      if (index === 0) cover = await encodeCover(canvas)
      canvas.width = 0

      for (const [stripId, last] of lastUse) {
        if (last !== index) continue
        const image = images.get(stripId)
        if (image instanceof ImageBitmap) image.close()
        images.delete(stripId)
      }
    }
  } finally {
    for (const image of images.values()) if (image instanceof ImageBitmap) image.close()
  }

  if (!cover) throw new Error('No pages to render')
  return { pdf: jpegPagesToPdf(pdfPages), cover, pageCount: pdfPages.length }
}

const isCode = (error: unknown, code: string) => error instanceof ApiError && error.code === code

/** Whether the scrapbook is already finished on the server — and if so, as what. */
async function landedAs(id: string): Promise<Scrapbook | null> {
  try {
    const { scrapbook } = await getScrapbook(id)
    return scrapbook.state === 'draft' ? null : scrapbook
  } catch {
    return null
  }
}

/**
 * Upload a finished scrapbook, checking before every retry whether the last attempt
 * actually landed (plan §2b *Retries*).
 *
 * A finish can succeed on the server while its answer is lost; retried blindly, the next
 * attempt is refused as `scrapbook_locked` and the user is told it failed when it didn't.
 * So after any failed attempt — before the one direct retry and before the fallback through
 * the API — the scrapbook's state is read, and `finished` is the success it looks like.
 *
 * `content_changed` is thrown as it is: the content moved since the PDF was rendered, and
 * only the caller can re-render. So is `cart_full`: no retry or fallback can make room in
 * the cart (2026-10-17).
 */
/** A refusal no other attempt could change — the caller has to deal with it. */
function isFinal(error: unknown): boolean {
  return isCode(error, 'content_changed') || isCode(error, 'cart_full')
}

export async function uploadFinishedScrapbook(
  id: string,
  files: ScrapbookFinishFiles,
  contentVersion: string
): Promise<Scrapbook> {
  let failure: unknown
  try {
    return await finishScrapbookDirect(id, files, contentVersion)
  } catch (error) {
    if (isFinal(error)) throw error
    failure = error
  }

  const landed = await landedAs(id)
  if (landed) return landed

  if (shouldRetryDirect(failure)) {
    try {
      return await finishScrapbookDirect(id, files, contentVersion)
    } catch (error) {
      if (isFinal(error)) throw error
      failure = error
    }
    const landedOnRetry = await landedAs(id)
    if (landedOnRetry) return landedOnRetry
  }

  if (!shouldFallBack(failure)) throw failure
  // Costs Railway egress, not a failed finish — usually the print bucket's CORS rule.
  console.warn('[scrapbooks] direct finish failed; uploading through the API', failure)
  try {
    return await finishScrapbookThroughApi(id, files, contentVersion)
  } catch (error) {
    if (isFinal(error)) throw error
    const landedLast = await landedAs(id)
    if (landedLast) return landedLast
    throw error
  }
}
