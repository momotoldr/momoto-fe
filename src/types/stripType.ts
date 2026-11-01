import type { SessionMode } from '@/types/roomsType'
import type { DirectUploadTarget } from '@/types/uploadType'

/** A photo strip stored on the server (the user's cart). Never carries the bytes. */
export interface StoredStrip {
  id: string
  /** Absolute URL to the full-size strip image (the service resolves any API-relative path). */
  url: string
  /**
   * Absolute URL to a small preview, for grids that show several strips at once.
   * The server falls back to the full-size image when a strip has no thumbnail, so
   * this is always safe to use directly — no need to check `url` first.
   */
  thumbnailUrl: string
  width: number
  height: number
  /** Room code (date / group) or "solo"; null if the origin session is unknown. */
  sessionId: string | null
  /** Which booth it came out of; null for strips saved before the mode was recorded. */
  sessionMode: SessionMode | null
  /** True once paid — unlocks the clean download/print. */
  paid: boolean
  /**
   * Whether this strip can be unlocked or checked out at all.
   *
   * False when its clean, watermark-free copy never reached the server — the upload is
   * best-effort and runs after the result screen reports "saved", so navigating away
   * mid-upload leaves a strip both unlock paths will always refuse. The cart reads this
   * to avoid offering a button that can only fail; it can't be repaired from here,
   * because rebuilding the clean copy needs frames that the session no longer holds.
   */
  printable: boolean
  /** ISO-8601 creation timestamp. */
  createdAt: string
}

/** The channels checkout offers. Mirrors the backend's `PAYMENT_METHODS`. */
export const PAYMENT_METHODS = ['gopay', 'shopeepay', 'qris'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/**
 * A payment attempt as the checkout modal renders it. `qrImageUrl` and `deeplinkUrl`
 * are both nullable and channel-dependent: QRIS returns only a QR, ShopeePay only a
 * deeplink, GoPay both — so the modal picks what to show from what is present rather
 * than from the method name.
 */
export interface PaymentAttempt {
  /** What the payment is for: since 2026-10-17 one cart checkout can hold both kinds. */
  kind: 'strips' | 'scrapbook' | 'mixed'
  /** Our order id, to poll `GET /payments/:orderId`. */
  orderId: string
  status: PaymentStatus
  /** Total charged, in whole rupiah. */
  grossAmount: number
  method: PaymentMethod | null
  /** Midtrans-hosted QR image, rendered directly as an `<img>` source. */
  qrImageUrl: string | null
  /** Wallet deeplink — opens the app on mobile. */
  deeplinkUrl: string | null
  /** ISO timestamp after which this attempt can no longer be paid. */
  expiresAt: string | null
  /** The strips this attempt unlocks. */
  stripIds: string[]
  /** The scrapbooks this attempt unlocks. */
  scrapbookIds: string[]
  /** How many strips (scrapbooks not included). */
  count: number
  /** Priced with the partner buy 1 get 1 (docs/PLAN-promos.md). */
  bogo: boolean
  /** How many scrapbook bundles (one scrapbook + 3 strips each) priced it. */
  bundled: number
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded'

/** One row of the profile's purchase history. */
export interface PaymentOrder {
  /** Our Midtrans order id, shown as the human-readable reference. */
  orderId: string
  /** Total charged, in whole rupiah. */
  grossAmount: number
  currency: string
  status: PaymentStatus
  /**
   * The strips this order unlocked *that the user still holds* — deleting a strip drops
   * it from the order. The client resolves each id against its own cart store for the
   * row's thumbnails, so a purged strip simply falls out of the row.
   */
  stripIds: string[]
  /**
   * The scrapbook a scrapbook order bought, with what its row shows — the client keeps no
   * store of scrapbooks to resolve an id against. `coverUrl` is null once it was removed.
   */
  scrapbooks: { id: string; title: string; coverUrl: string | null }[]
  createdAt: string
  paidAt: string | null
  /** Priced with the partner buy 1 get 1. */
  bogo: boolean
  /** How many scrapbook bundles (one scrapbook + 3 strips each) priced it. */
  bundled: number
}

/** What `GET /payments` hands back. */
export interface OrderHistory {
  /** Most recent first, capped server-side at five. */
  orders: PaymentOrder[]
  /** Lifetime spend across settled payments, in whole rupiah. */
  spent: number
}

/** One storage ceiling and how much of it is spent. */
export interface QuotaBucket {
  used: number
  limit: number
}

/**
 * Both caps, as the server counts them. `cart` bounds unpaid strips (what a save is
 * refused at), `gallery` bounds paid ones (what an unlock is refused at) — the two are
 * independent, so a full gallery never stops someone saving a new capture.
 *
 * The server is the only authority on these numbers; the client never mirrors the
 * gallery limit in its own env.
 */
export interface StripQuota {
  cart: QuotaBucket
  gallery: QuotaBucket
}

export interface StripListResponse {
  strips: StoredStrip[]
  quota: StripQuota
}

/** What `POST /strips/:id/remove` hands back: the limits after the slot was freed. */
export interface StripRemoveResponse {
  quota: StripQuota
}

/**
 * What `GET /strips/:id/print-url` hands back: a presigned R2 URL for the clean copy.
 * Good for one GET of one object, and only until `expiresAt` (about a minute).
 */
export interface StripPrintUrlResponse {
  url: string
  /** ISO-8601. */
  expiresAt: string
}

/** What `POST /strips/unlock` hands back: the same strips, now `paid`. */
export interface StripUnlockResponse {
  strips: StoredStrip[]
}

/**
 * What `POST /strips/uploads` hands back: the strip itself when this `clientKey` was
 * already saved, otherwise where to PUT each file and the token that completes them.
 * `thumbnail` is null when none was declared (or it didn't fit) — the server renders one.
 */
export type StripUploadStartResponse =
  | { strip: StoredStrip }
  | {
      upload: {
        token: string
        files: {
          watermarked: DirectUploadTarget
          clean: DirectUploadTarget
          thumbnail: DirectUploadTarget | null
        }
      }
    }

export interface StripResponse {
  strip: StoredStrip
}
