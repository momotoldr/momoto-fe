import type { QuotaBucket, StoredStrip } from '@/types/stripType'
import type { DirectUploadTarget } from '@/types/uploadType'

/**
 * Where a scrapbook is in its life (docs/PLAN-scrapbook.md §1). Derived by the server from
 * its columns, never stored: `draft` is editable; `finished` has its PDF stored and its
 * content locked (reopening, while unpaid, makes it a draft again); `paid` is final.
 */
export type ScrapbookState = 'draft' | 'finished' | 'paid'

/** The layout: which strip sits in which slot, and the text typed into each text slot. */
export interface ScrapbookContent {
  strips: Record<string, string>
  texts: Record<string, string>
}

/** One scrapbook as the shelf lists it. */
export interface ScrapbookSummary {
  id: string
  templateId: string
  title: string
  state: ScrapbookState
  /** Absolute URL of the cover preview, once finished; null before. */
  coverUrl: string | null
  /** Every distinct strip the layout uses — what the gallery's Remove dialog checks. */
  stripIds: string[]
  /** ISO-8601. */
  updatedAt: string
}

/** One scrapbook in full, for the editor and the read-only viewer. */
export interface Scrapbook extends ScrapbookSummary {
  content: ScrapbookContent
  /** Set once finished (declared by the browser that rendered it). */
  pageCount: number | null
  createdAt: string
  /**
   * The version a finish must be rendered from — echoed back to start one, and refused
   * (`409 content_changed`) if the scrapbook was edited since. Same value as `updatedAt`.
   */
  contentVersion: string
}

/** What `GET /scrapbooks` hands back. The server is the only authority on the limit. */
export interface ScrapbookListResponse {
  scrapbooks: ScrapbookSummary[]
  quota: QuotaBucket
}

/**
 * What `GET /scrapbooks/:id` hands back. `strips` holds the placed strips that are still
 * usable; `missing` names the ones that left the gallery since, drawn as empty slots.
 */
export interface ScrapbookDetailResponse {
  scrapbook: Scrapbook
  strips: StoredStrip[]
  missing: string[]
}

export interface ScrapbookResponse {
  scrapbook: Scrapbook
}

/** What delete and remove hand back: the limit after the slot was freed. */
export interface ScrapbookQuotaResponse {
  quota: QuotaBucket
}

/** What `POST /scrapbooks/:id/finish/uploads` hands back: where to PUT each file. */
export interface ScrapbookFinishStartResponse {
  upload: {
    token: string
    files: { pdf: DirectUploadTarget; cover: DirectUploadTarget }
  }
}

/** What `GET /scrapbooks/:id/pdf-url` hands back: a presigned R2 URL good for about a minute. */
export interface ScrapbookPdfUrlResponse {
  url: string
  /** ISO-8601. */
  expiresAt: string
}
