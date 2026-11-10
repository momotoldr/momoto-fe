import { env } from '@/env'
import type {
  Scrapbook,
  ScrapbookContent,
  ScrapbookDetailResponse,
  ScrapbookFinishStartResponse,
  ScrapbookListResponse,
  ScrapbookPdfUrlResponse,
  ScrapbookQuotaResponse,
  ScrapbookResponse,
  ScrapbookSummary,
} from '@/types/scrapbookType'
import type { QuotaBucket, StoredStrip } from '@/types/stripType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'
import { putDirect, shouldFallBack, withDirectRetry } from '../directUpload'
import { resolveUrl } from './stripsService'

/**
 * Scrapbooks (docs/PLAN-scrapbook.md §2): the shelf, autosave, finishing, and the paid PDF.
 *
 * Each call here is one request. Deciding *what to do when one fails* — checking whether a
 * finish actually landed before retrying it, re-rendering on `content_changed` — belongs to
 * the finish flow that calls these (plan §7), not to the transport.
 */

const client = new AxiosClient()

/** The server sends the cover as a CDN URL, or a path on itself when there is no CDN. */
function absolute(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${env.apiUrl}${url}`
}

function resolveSummary<T extends ScrapbookSummary>(scrapbook: T): T {
  return { ...scrapbook, coverUrl: scrapbook.coverUrl ? absolute(scrapbook.coverUrl) : null }
}

/** The shelf: every scrapbook the user holds, most recently edited first, and the limit. */
export async function listScrapbooks(): Promise<{
  scrapbooks: ScrapbookSummary[]
  quota: QuotaBucket
}> {
  const { data } = await client.getData<ScrapbookListResponse>(API_ROUTES.SCRAPBOOKS.ROOT)
  return { scrapbooks: data.scrapbooks.map(resolveSummary), quota: data.quota }
}

/** Start a new, empty draft. `409 scrapbook_limit` at the cap. */
export async function createScrapbook(templateId: string): Promise<Scrapbook> {
  const { data } = await client.postData<ScrapbookResponse>(API_ROUTES.SCRAPBOOKS.ROOT, {
    templateId,
  })
  return resolveSummary(data.scrapbook)
}

/** One scrapbook, the strips it still has, and the ids of any it lost since. */
export async function getScrapbook(id: string): Promise<{
  scrapbook: Scrapbook
  strips: StoredStrip[]
  missing: string[]
}> {
  const { data } = await client.getData<ScrapbookDetailResponse>(API_ROUTES.SCRAPBOOKS.BY_ID(id))
  return {
    scrapbook: resolveSummary(data.scrapbook),
    strips: data.strips.map(resolveUrl),
    missing: data.missing,
  }
}

/**
 * Autosave: replace a draft's title and layout wholesale. `409 scrapbook_locked` once it
 * is finished; `422 strip_unavailable` (with `stripIds`) for newly placed strips that
 * can't be used.
 */
export async function saveScrapbook(
  id: string,
  change: { title: string; content: ScrapbookContent }
): Promise<Scrapbook> {
  const { data } = await client.putData<ScrapbookResponse>(API_ROUTES.SCRAPBOOKS.BY_ID(id), change)
  return resolveSummary(data.scrapbook)
}

async function postForScrapbook(url: string): Promise<Scrapbook> {
  const { data } = await client.postData<ScrapbookResponse>(url)
  return resolveSummary(data.scrapbook)
}

/** "Keep editing": a finished, unpaid scrapbook back to a draft (its PDF is deleted). */
export function reopenScrapbook(id: string): Promise<Scrapbook> {
  return postForScrapbook(API_ROUTES.SCRAPBOOKS.REOPEN(id))
}

/** The free unlock, only while checkout is dark (`403 payments_enabled` otherwise). */
export function unlockScrapbook(id: string): Promise<Scrapbook> {
  return postForScrapbook(API_ROUTES.SCRAPBOOKS.UNLOCK(id))
}

/** Take a paid scrapbook off the shelf; its files are deleted for good. */
export async function removeScrapbook(id: string): Promise<QuotaBucket> {
  const { data } = await client.postData<ScrapbookQuotaResponse>(API_ROUTES.SCRAPBOOKS.REMOVE(id))
  return data.quota
}

/** Delete an unpaid scrapbook. */
export async function deleteScrapbook(id: string): Promise<QuotaBucket> {
  const { data } = await client.deleteData<ScrapbookQuotaResponse>(API_ROUTES.SCRAPBOOKS.BY_ID(id))
  return data.quota
}

// ── Finishing ────────────────────────────────────────────────────────────────

/** What a finish uploads: the rendered PDF and the cover preview (WebP, or JPEG on Safari). */
export interface ScrapbookFinishFiles {
  pdf: Blob
  cover: Blob
  pageCount: number
}

/** A ~2 MB PDF on a phone's uplink; generous, as the strip upload's own budget is. */
const FINISH_UPLOAD_TIMEOUT_MS = 120_000
/** Completing reads both files back from R2 and copies them into place. */
const FINISH_COMPLETE_TIMEOUT_MS = 60_000

/**
 * Finish straight to R2: declare the files, PUT each to the URL the server signed, then
 * complete. One attempt — retrying, and checking first whether an attempt that looked
 * failed actually landed, is the finish flow's job (plan §2b *Retries*).
 */
export async function finishScrapbookDirect(
  id: string,
  files: ScrapbookFinishFiles,
  contentVersion: string
): Promise<Scrapbook> {
  const { data } = await client.postData<ScrapbookFinishStartResponse>(
    API_ROUTES.SCRAPBOOKS.FINISH_UPLOADS(id),
    {
      pdf: { type: 'application/pdf', size: files.pdf.size },
      // WebP where the browser could encode it, JPEG where it couldn't (Safari).
      cover: {
        type: files.cover.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
        size: files.cover.size,
      },
      pageCount: files.pageCount,
      // What the PDF was rendered from; refused at once if the scrapbook moved since.
      contentVersion,
    }
  )
  const { token, files: targets } = data.upload
  await putDirect(
    [
      { target: targets.pdf, blob: files.pdf },
      { target: targets.cover, blob: files.cover },
    ],
    FINISH_UPLOAD_TIMEOUT_MS
  )
  const { data: done } = await client.postData<ScrapbookResponse>(
    API_ROUTES.SCRAPBOOKS.FINISH_UPLOADS_COMPLETE(id),
    { token },
    { timeout: FINISH_COMPLETE_TIMEOUT_MS }
  )
  return resolveSummary(done.scrapbook)
}

function u32(value: number): ArrayBuffer {
  const buffer = new ArrayBuffer(4)
  new DataView(buffer).setUint32(0, value, false)
  return buffer
}

/**
 * Finish with the bytes through the API — the fallback, when the direct path itself
 * failed (`shouldFallBack`). Body: `"MOMS"[u32 len pdf][pdf][cover]`. `contentVersion` is
 * the one the PDF was rendered from, so this path refuses stale content as the direct
 * one does.
 */
export async function finishScrapbookThroughApi(
  id: string,
  files: ScrapbookFinishFiles,
  contentVersion: string
): Promise<Scrapbook> {
  const body = new Blob(
    [new TextEncoder().encode('MOMS'), u32(files.pdf.size), files.pdf, files.cover],
    { type: 'application/octet-stream' }
  )
  const { data } = await client.postData<ScrapbookResponse>(
    API_ROUTES.SCRAPBOOKS.FINISH(id),
    body,
    {
      headers: { 'Content-Type': 'application/octet-stream' },
      params: { pageCount: files.pageCount, contentVersion },
      timeout: FINISH_UPLOAD_TIMEOUT_MS,
    }
  )
  return resolveSummary(data.scrapbook)
}

// ── The paid PDF ─────────────────────────────────────────────────────────────

const PDF_TIMEOUT_MS = 60_000

/** Throw if what came back isn't a PDF — an error envelope mis-parsed as a Blob, say. */
async function asPdfBlob(data: Blob): Promise<Blob> {
  if (!(data instanceof Blob)) throw new Error('Expected a PDF')
  const head = await data.slice(0, 5).text()
  if (head !== '%PDF-') throw new Error('Download failed')
  return data.type === 'application/pdf' ? data : new Blob([data], { type: 'application/pdf' })
}

/**
 * Download the paid PDF as a Blob, straight from R2 when it can be — the same rules as a
 * strip's clean copy (`fetchPrintBlob`): one more direct attempt with a fresh URL, then
 * the stream through the API only if the direct route itself failed. A 402 is the answer,
 * not a route failure, and is thrown as it is.
 */
export async function fetchScrapbookPdf(id: string): Promise<Blob> {
  try {
    return await withDirectRetry(() => fetchScrapbookPdfDirect(id))
  } catch (err) {
    if (!shouldFallBack(err)) throw err
    console.warn('[scrapbooks] direct download failed; streaming through the API', err)
    return fetchScrapbookPdfStreamed(id)
  }
}

async function fetchScrapbookPdfDirect(id: string): Promise<Blob> {
  const { data } = await client.getData<ScrapbookPdfUrlResponse>(API_ROUTES.SCRAPBOOKS.PDF_URL(id))
  // A plain cross-origin GET — no credentials (the signature is the credential), no custom
  // headers, so no CORS preflight.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PDF_TIMEOUT_MS)
  try {
    const response = await fetch(data.url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`R2 responded ${response.status}`)
    return asPdfBlob(await response.blob())
  } finally {
    clearTimeout(timer)
  }
}

async function fetchScrapbookPdfStreamed(id: string): Promise<Blob> {
  const { data } = await client.getData<Blob>(
    API_ROUTES.SCRAPBOOKS.PDF(id),
    {},
    { responseType: 'blob', timeout: PDF_TIMEOUT_MS, headers: { Accept: 'application/pdf' } }
  )
  return asPdfBlob(data)
}
