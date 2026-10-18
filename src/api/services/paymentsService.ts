import { env } from '@/env'
import type { OrderHistory, PaymentAttempt, PaymentMethod } from '@/types/stripType'

import ApiError from '../apiError'
import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const client = new AxiosClient()

/**
 * What a checkout pays for: whatever was selected in the cart — strips, finished
 * scrapbooks, or both in one order (2026-10-17).
 */
export interface CheckoutTarget {
  stripIds: string[]
  scrapbookIds: string[]
}

/** Raised when a live attempt already exists; carries it so the caller can resume. */
export class PaymentInProgressError extends Error {
  constructor(readonly payment: PaymentAttempt) {
    super('payment_in_progress')
    this.name = 'PaymentInProgressError'
  }
}

/**
 * Open a payment for the cart's selection on one channel.
 *
 * A `409 payment_in_progress` is not a failure: the server refuses to charge twice
 * while a QR is still payable, and the caller resumes that attempt instead. Anything
 * else propagates.
 *
 * The attempt is re-read from `/pending` rather than taken from the 409 body, because
 * the response interceptor throws a flattened `ApiError` — it keeps `status` and the
 * backend's `error` string as `code`, and discards the rest of the body. Reading
 * `error.response` here (as this first did) matches nothing, which turned a live
 * payment into "payment failed" the moment the user reopened the modal.
 */
export async function createCharge(
  target: CheckoutTarget,
  method: PaymentMethod
): Promise<PaymentAttempt> {
  try {
    const { data } = await client.postData<PaymentAttempt>(API_ROUTES.PAYMENTS.CHARGE, {
      ...target,
      method,
    })
    return data
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.code === 'payment_in_progress') {
      const live = await getPendingPayment().catch(() => null)
      // Null only if the attempt died between the two calls — a genuinely dead charge,
      // so let the original error stand rather than inventing a state.
      if (live) throw new PaymentInProgressError(live)
    }
    throw error
  }
}

/** Poll one attempt. The webhook is authoritative; this reflects it. */
export async function getPayment(orderId: string): Promise<PaymentAttempt> {
  const { data } = await client.getData<PaymentAttempt>(API_ROUTES.PAYMENTS.BY_ID(orderId))
  return data
}

/**
 * The attempt the user walked away from, if it is still payable. Called on cart load so
 * a half-finished payment reopens rather than blocking a fresh one with a 409 the user
 * has no way to interpret.
 */
export async function getPendingPayment(): Promise<PaymentAttempt | null> {
  const { data } = await client.getData<{ payment: PaymentAttempt | null }>(
    API_ROUTES.PAYMENTS.PENDING
  )
  return data.payment
}

/**
 * The attempt's QR image, as a Blob for saving.
 *
 * Served by our own API rather than fetched from Midtrans directly: the image is
 * cross-origin, so `<a download>` would navigate instead of downloading and a page-side
 * fetch would be blocked by CORS.
 */
export async function fetchQrBlob(orderId: string): Promise<Blob> {
  // `getData(url, params, config)` — responseType must be the 3rd arg, not query params.
  const { data } = await client.getData<Blob>(
    API_ROUTES.PAYMENTS.QR(orderId),
    {},
    {
      responseType: 'blob',
      headers: { Accept: 'image/png,image/*;q=0.9,*/*;q=0.8' },
    }
  )
  if (!(data instanceof Blob) || data.type.includes('json')) {
    throw new Error('qr_unavailable')
  }
  return data
}

/**
 * The account's recent orders and lifetime spend, for the profile's Purchases tab.
 * Returns an empty history rather than failing while checkout is dark — nothing has
 * been charged, so there is genuinely nothing to list.
 */
export async function listOrders(): Promise<OrderHistory> {
  const { data } = await client.getData<OrderHistory>(API_ROUTES.PAYMENTS.ROOT)
  // A scrapbook's cover is a CDN URL, or a path on the API when there is no CDN (local
  // dev) — the same contract as a strip's image URLs.
  const absolute = (url: string) => (/^https?:\/\//i.test(url) ? url : `${env.apiUrl}${url}`)
  return {
    ...data,
    orders: data.orders.map((order) => ({
      ...order,
      scrapbooks: (order.scrapbooks ?? []).map((scrapbook) => ({
        ...scrapbook,
        coverUrl: scrapbook.coverUrl ? absolute(scrapbook.coverUrl) : null,
      })),
    })),
  }
}
