import type { DirectUploadTarget } from '@/types/uploadType'

import ApiError from './apiError'

/**
 * Transfers that go browser ↔ R2 directly — uploads here, and the paid download's
 * `fetchPrintBlob`, which shares the retry and fallback rules below.
 *
 * The API starts an upload (checks, then a presigned PUT per file), the browser PUTs the
 * bytes straight to the bucket, and the API completes it (reads them back, validates,
 * saves). The bytes never cross the server, which is what makes them free: sent through
 * the API, every one of them is billed again as Railway egress on its way to R2.
 *
 * A failed direct transfer is first retried *directly* — once, from the start, so it
 * gets freshly signed URLs (`withDirectRetry`). Only if that fails too does it take the
 * old route through the API, which `shouldFallBack` decides. A blip on the direct path
 * therefore costs a second try, not a trip through Railway.
 */

/**
 * PUT each blob to its presigned URL, all at once, under one deadline.
 *
 * No credentials (the signature is the credential). `Content-Type` must be exactly what
 * the server signed, and the browser sets `Content-Length` from the blob — also signed,
 * so R2 refuses anything that isn't the size the server was told. That header makes this
 * a preflighted request, which the bucket's CORS policy has to allow.
 */
export async function putDirect(
  files: { target: DirectUploadTarget; blob: Blob }[],
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await Promise.all(
      files.map(async ({ target, blob }) => {
        const response = await fetch(target.url, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': target.contentType },
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`R2 refused the upload (${response.status})`)
      })
    )
  } catch (error) {
    // Stop the siblings of a PUT that failed: the caller is about to fall back and send
    // the same bytes through the API, and there's no use finishing these alongside it.
    controller.abort()
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Whether a failed direct upload should be retried through the API instead.
 *
 * Yes for anything that says the *route* failed rather than the request: a PUT the bucket
 * or the browser refused (no CORS rule, the R2 host missing from the CSP, a dropped
 * connection — none of which come back as an `ApiError`), no response at all, a 5xx, a
 * backend from before the direct routes existed (404), or one of the codes the server
 * uses to say the direct path itself is unavailable or didn't finish.
 *
 * No for every other answer the API gave on purpose — `cart_full`, a rate limit, a
 * rejected image. Those would only come back again from the fallback, slower.
 */
export function shouldFallBack(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  if (error.status === 0 || error.status === 404 || error.status >= 500) return true
  return error.code === 'upload_incomplete' || error.code === 'direct_upload_unavailable'
}

/** Pause before the direct retry, so a momentary drop has a moment to come back. */
const DIRECT_RETRY_DELAY_MS = 1_000

/**
 * Run a direct transfer, and if it fails in a way another attempt could fix, run it once
 * more. `attempt` must start from the API each time — a new presign, new URLs — so a
 * retry never reuses a URL that may have expired or a PUT that half-landed. Uploads stay
 * safe to repeat because they carry the same `clientKey`: if the first attempt actually
 * saved, the second is answered with that strip instead of making another.
 *
 * Throws whatever the last attempt threw; the caller then decides on the API fallback.
 */
export async function withDirectRetry<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt()
  } catch (error) {
    if (!shouldRetryDirect(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, DIRECT_RETRY_DELAY_MS))
    return attempt()
  }
}

/**
 * Whether a second direct attempt is worth making.
 *
 * Only for failures the fallback would also take (`shouldFallBack`) — a real refusal like
 * `cart_full` repeats no matter how it's asked. And not when the direct route itself
 * isn't there (a backend without it answers 404; one without a bucket,
 * `direct_upload_unavailable`), nor after a timeout: the transfer already spent its whole
 * budget on this link, and trying the same bytes again the same way doubles the wait
 * before the fallback gets its turn.
 */
export function shouldRetryDirect(error: unknown): boolean {
  if (!shouldFallBack(error)) return false
  if (error instanceof ApiError) {
    if (error.status === 404 || error.code === 'direct_upload_unavailable') return false
    if (error.errorType === 'ECONNABORTED' || error.errorType === 'ETIMEDOUT') return false
  }
  return !(error instanceof DOMException && error.name === 'AbortError')
}
