import { env } from '@/env'
import { newId } from '@/utils/id'
import type { SessionMode } from '@/types/roomsType'
import type {
  StoredStrip,
  StripListResponse,
  StripPrintUrlResponse,
  StripQuota,
  StripRemoveResponse,
  StripResponse,
  StripUnlockResponse,
  StripUploadStartResponse,
} from '@/types/stripType'

import { API_ROUTES } from '../apiRoutes'
import { putDirect, shouldFallBack, withDirectRetry } from '../directUpload'
import AxiosClient from '../client/axiosClient'

const client = new AxiosClient()

/** Metadata sent alongside a strip upload (grouping hints, not trusted keys). */
export interface StripUploadMeta {
  sessionId?: string | null
  mode?: SessionMode | null
  /**
   * When the strip was actually made, ISO-8601.
   *
   * Only worth sending for a strip that waited before being uploaded — one cached while
   * signed out. Left off, the server stamps the moment it arrives, which for a guest
   * strip flushed days later is the wrong day and the wrong month in the gallery. The
   * server bounds whatever it's given, so this is a hint, not an instruction.
   */
  createdAt?: string | null
  /**
   * Idempotency key — the id minted when the strip was composed (`resultId`), resent
   * unchanged on every retry of the same save.
   *
   * This request is the largest the app makes, and a client-side abort (a timeout, a
   * dropped connection, a closed tab) can't stop the write already running on the
   * server: the strip saves, the user is shown a failure, and the retry used to create
   * a *second* copy in their cart. With this the server recognises the replay and
   * answers with the strip it already has.
   */
  clientKey?: string | null
}

/**
 * Normalize a strip's image URL into a ready `<img src>`.
 *
 * The server sends one of two things: an absolute URL, when the image is served from
 * object storage behind a CDN, or a path relative to its own origin, when it serves
 * the bytes itself (it doesn't know its own public URL). Only the latter needs the
 * API base prepended — prefixing an absolute URL would mangle it.
 */
function resolveUrl(strip: StoredStrip): StoredStrip {
  const absolute = (url: string) => (/^https?:\/\//i.test(url) ? url : `${env.apiUrl}${url}`)
  return { ...strip, url: absolute(strip.url), thumbnailUrl: absolute(strip.thumbnailUrl) }
}

/**
 * List the current user's saved strips, newest first, with both storage meters.
 *
 * One call feeds both surfaces: the cart reads the unpaid strips, the gallery the paid
 * ones, and `quota` carries the server's limits so neither has to guess them.
 */
export async function listStrips(): Promise<{ strips: StoredStrip[]; quota: StripQuota }> {
  const { data } = await client.getData<StripListResponse>(API_ROUTES.STRIPS.ROOT)
  return { strips: data.strips.map(resolveUrl), quota: data.quota }
}

/**
 * Move strips from the cart into the gallery without charging for them.
 *
 * Only reachable while checkout is dark — the server answers `403 payments_enabled`
 * once payments are live, and paid checkout becomes the only way to unlock.
 */
export async function unlockStrips(stripIds: string[]): Promise<StoredStrip[]> {
  const { data } = await client.postData<StripUnlockResponse>(API_ROUTES.STRIPS.UNLOCK, {
    stripIds,
  })
  return data.strips.map(resolveUrl)
}

/**
 * How long a strip upload may take before the client gives up.
 *
 * Deliberately generous: a mobile uplink pushing ~10 MB is minutes, not seconds, and a
 * client-side abort does not roll the save back — the server finishes and keeps the row.
 * Matches the print download's own override (60s) with headroom for the upload half.
 */
const STRIP_UPLOAD_TIMEOUT_MS = 120_000

/**
 * Pack a strip's copies into the one raw body `POST /strips` takes.
 *
 * With the client-rendered preview:
 *
 *     "MOMO"[u32 len watermarked][watermarked][u32 len clean][clean][thumbnail]
 *
 * Without it (no WebP encoder in this browser), the older two-part shape:
 *
 *     [u32 len watermarked][watermarked][clean]
 *
 * The magic distinguishes them: read as a big-endian length "MOMO" is 1.29 billion,
 * far past the server's 8 MB per-image ceiling, so a server on the older parser
 * rejects a three-part body outright instead of mis-splitting it.
 *
 * The body's own type is taken from the watermarked half rather than hardcoded: both
 * copies are WebP now (lossy preview, lossless clean), but a browser that cannot encode
 * WebP falls back to PNG, and the server accepts either — so the header has to describe
 * what was actually produced instead of what we expected.
 *
 * The clean copy used to be a second request fired after the save had already been
 * reported as done, which is how strips ended up in the cart with no printable copy and
 * no way to get one. Sending both together makes it all-or-nothing.
 */
function uploadType(image: Blob): string {
  return image.type === 'image/webp' || image.type === 'image/png' ? image.type : 'image/png'
}

function u32(value: number): ArrayBuffer {
  const buffer = new ArrayBuffer(4)
  new DataView(buffer).setUint32(0, value, false)
  return buffer
}

async function packStripBody(
  watermarked: Blob,
  clean: Blob,
  thumbnail: Blob | null
): Promise<Blob> {
  const type = uploadType(watermarked)
  if (!thumbnail) {
    return new Blob([u32(watermarked.size), watermarked, clean], { type })
  }
  return new Blob(
    [
      new TextEncoder().encode('MOMO'),
      u32(watermarked.size),
      watermarked,
      u32(clean.size),
      clean,
      thumbnail,
    ],
    { type }
  )
}

/**
 * Upload a composed strip; returns the stored strip's metadata.
 *
 * `clean` is the watermark-free copy that a paid print unlocks. It is optional only for
 * the strips that genuinely cannot supply one — a guest strip cached before this browser
 * kept the clean copy alongside it. Everything else must pass it: a strip saved without
 * one can never be unlocked, and nothing can repair it afterwards.
 *
 * Straight to R2 when it can be (see `uploadStripDirect`), retried directly once with
 * fresh URLs if that fails (`withDirectRetry`), and through the API only when both direct
 * attempts fail for a reason the API path could get past — see `shouldFallBack`. Every
 * attempt carries the same `clientKey`, so one that actually landed before failing is
 * answered as a replay by the next rather than saved twice.
 */
export async function uploadStrip(
  image: Blob,
  meta: StripUploadMeta = {},
  clean?: Blob | null,
  thumbnail?: Blob | null
): Promise<StoredStrip> {
  // One key for every attempt below — the direct retry and the API fallback included —
  // so whichever of them lands second is answered as a replay, never saved twice. The
  // app always passes one; this covers a caller that doesn't.
  const keyed = { ...meta, clientKey: meta.clientKey ?? newId('strip') }
  // Without a clean copy there's nothing the direct path accepts: it's the legacy
  // single-image save, which only the raw-body route still takes.
  if (clean) {
    try {
      return await withDirectRetry(() => uploadStripDirect(image, clean, thumbnail ?? null, keyed))
    } catch (err) {
      if (!shouldFallBack(err)) throw err
      // Costs Railway egress, not a failed save — so a warning, not an error. Usually
      // the bucket's CORS rule or the CSP's `connect-src` (docs/ARCHITECTURE.md §5).
      console.warn('[strips] direct upload failed; uploading through the API', err)
    }
  }
  return uploadStripThroughApi(image, keyed, clean ?? null, thumbnail ?? null)
}

/**
 * How long completing a direct upload may take: the server reads both copies back from
 * R2, validates them and copies them into place before it answers. No bytes go up.
 */
const STRIP_COMPLETE_TIMEOUT_MS = 60_000

/**
 * Save a strip whose bytes go browser → R2: declare the files, PUT each one to the URL
 * the server signed for it, then ask the server to complete the save.
 */
async function uploadStripDirect(
  watermarked: Blob,
  clean: Blob,
  thumbnail: Blob | null,
  meta: StripUploadMeta
): Promise<StoredStrip> {
  // The server only takes a WebP preview; anything else it renders itself, as it would
  // for a client that sent none.
  const preview = thumbnail?.type === 'image/webp' ? thumbnail : null
  const { data } = await client.postData<StripUploadStartResponse>(API_ROUTES.STRIPS.UPLOADS, {
    watermarked: { type: uploadType(watermarked), size: watermarked.size },
    clean: { type: uploadType(clean), size: clean.size },
    thumbnail: preview ? { type: preview.type, size: preview.size } : null,
    sessionId: meta.sessionId ?? null,
    mode: meta.mode ?? null,
    createdAt: meta.createdAt ?? null,
    clientKey: meta.clientKey ?? null,
  })
  // Already saved under this key — a retry of a save that landed. Nothing to upload.
  if ('strip' in data) return resolveUrl(data.strip)

  const { token, files } = data.upload
  await putDirect(
    [
      { target: files.watermarked, blob: watermarked },
      { target: files.clean, blob: clean },
      ...(files.thumbnail && preview ? [{ target: files.thumbnail, blob: preview }] : []),
    ],
    STRIP_UPLOAD_TIMEOUT_MS
  )
  const { data: done } = await client.postData<StripResponse>(
    API_ROUTES.STRIPS.UPLOADS_COMPLETE,
    { token },
    { timeout: STRIP_COMPLETE_TIMEOUT_MS }
  )
  return resolveUrl(done.strip)
}

/** Save a strip by sending its bytes to the API in one body — the fallback, and the original. */
async function uploadStripThroughApi(
  image: Blob,
  meta: StripUploadMeta,
  clean: Blob | null,
  thumbnail: Blob | null
): Promise<StoredStrip> {
  const params: Record<string, string> = {}
  if (meta.sessionId) params.sessionId = meta.sessionId
  if (meta.mode) params.mode = meta.mode
  if (meta.createdAt) params.createdAt = meta.createdAt
  if (meta.clientKey) params.clientKey = meta.clientKey
  // Without a clean copy the body stays a bare PNG, which the server still accepts and
  // marks unprintable — the legacy shape, not a path anything new should take.
  const body = clean ? await packStripBody(image, clean, thumbnail) : image
  const { data } = await client.postData<StripResponse>(API_ROUTES.STRIPS.ROOT, body, {
    headers: { 'Content-Type': uploadType(body) },
    params,
    // The largest request the app makes — two full-size PNGs (up to 8 MB each), then
    // three object-store writes and a thumbnail render before the server answers. On
    // the client's default 10s that routinely aborted *after* the server had already
    // committed the row, which is how a strip landed in the cart under a "save failed"
    // screen. Aborting here can no longer undo the save, so the timeout has to outlast
    // the upload rather than race it.
    timeout: STRIP_UPLOAD_TIMEOUT_MS,
  })
  return resolveUrl(data.strip)
}

/** Throw if Axios handed back an error envelope as a Blob (status 2xx mis-parse or 4xx). */
async function asImageBlob(data: Blob): Promise<Blob> {
  if (!(data instanceof Blob)) {
    throw new Error('Expected an image file')
  }
  const type = data.type || ''
  if (type.includes('json') || type.includes('text')) {
    throw new Error('Download failed')
  }
  return type.startsWith('image/') ? data : new Blob([data], { type: 'image/png' })
}

/** Give up on a download that hasn't finished in this long, either route. */
const PRINT_TIMEOUT_MS = 60_000

/**
 * Download the clean file (paid + auth gated) as a Blob.
 *
 * Straight from R2 when it can be: the API checks ownership and payment and answers
 * with a URL that's good for a minute, and the bytes never cross the server — which is
 * what makes a download free instead of billed Railway egress.
 *
 * A failure on that route is first retried on it, once, with a fresh URL — a dropped
 * connection or an R2 hiccup shouldn't cost a trip through Railway. If the retry fails
 * too, it falls back to streaming through the API, the way every download used to work.
 * The likely causes by then are configuration, not the user: the bucket's CORS policy or
 * the CSP's `connect-src` missing the R2 host (both a network error here), or a backend
 * from before `/print-url` existed (404, which skips the retry). A 402 is thrown as it
 * is. The fallback costs egress, not a broken button, so it's logged rather than
 * surfaced.
 */
export async function fetchPrintBlob(stripId: string): Promise<Blob> {
  try {
    // Each attempt asks for a new URL, so a retry never fetches one that has expired.
    return await withDirectRetry(() => fetchPrintBlobDirect(stripId))
  } catch (err) {
    // A 402 or 401 is the answer, not a fault of the route — the stream would only
    // repeat it.
    if (!shouldFallBack(err)) throw err
    console.warn('[strips] direct download failed; streaming through the API', err)
    return fetchPrintBlobStreamed(stripId)
  }
}

/** The clean file via a presigned R2 URL. */
async function fetchPrintBlobDirect(stripId: string): Promise<Blob> {
  const { data } = await client.getData<StripPrintUrlResponse>(API_ROUTES.STRIPS.PRINT_URL(stripId))
  // A plain cross-origin GET: no credentials (the signature is the credential) and no
  // custom headers, so the browser sends it without a CORS preflight.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PRINT_TIMEOUT_MS)
  try {
    const response = await fetch(data.url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`R2 responded ${response.status}`)
    return asImageBlob(await response.blob())
  } finally {
    clearTimeout(timer)
  }
}

/** The clean file streamed through the API — the fallback, and the only route before. */
async function fetchPrintBlobStreamed(stripId: string): Promise<Blob> {
  // `getData(url, params, config)` — responseType must be the 3rd arg, not query params.
  const { data } = await client.getData<Blob>(
    API_ROUTES.STRIPS.PRINT(stripId),
    {},
    {
      responseType: 'blob',
      timeout: PRINT_TIMEOUT_MS,
      headers: { Accept: 'image/webp,image/png,image/*;q=0.9,*/*;q=0.8' },
    }
  )
  return asImageBlob(data)
}

/** Delete one strip from the user's cart. */
export async function deleteStrip(id: string): Promise<void> {
  await client.deleteData(API_ROUTES.STRIPS.BY_ID(id))
}

/**
 * Remove one unlocked strip from the gallery. Its files are deleted for good; the server
 * keeps the record so the purchase that bought it still lists it. Returns the limits as
 * they stand afterwards.
 */
export async function removeGalleryStrip(id: string): Promise<StripQuota> {
  const { data } = await client.postData<StripRemoveResponse>(API_ROUTES.STRIPS.REMOVE(id))
  return data.quota
}
