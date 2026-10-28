/**
 * Attaches a `.pattern` string to a dynamic route function.
 * The function is used to build the actual URL; `.pattern` is used as an object key
 * (e.g. in error message maps) and for regex-based route matching.
 *
 * @example
 * const BY_ID = route('/rooms/:id', (id: string) => `/rooms/${id}`)
 * BY_ID('abc')        // "/rooms/abc"
 * BY_ID.pattern       // "/rooms/:id"
 */
function route<TArgs extends unknown[]>(
  pattern: string,
  fn: (...args: TArgs) => string
): ((...args: TArgs) => string) & { readonly pattern: string } {
  return Object.assign(fn, { pattern } as const)
}

/**
 * Every HTTP endpoint the frontend talks to. Two hosts serve them: `ROOMS` and `TURN`
 * belong to momoto-realtime (`env.realtimeUrl`), alongside the Socket.io signaling in
 * `utils/socket.ts`; everything else belongs to momoto-core (`env.apiUrl`). Which host a
 * call reaches is decided by the service's `AxiosClient`, not by the path here.
 */
export const API_ROUTES = {
  /** Liveness probe used to detect whether the backend is reachable. `GET /healthz`. */
  HEALTH: '/healthz',

  /** Public counters for the landing page. `GET /stats`. */
  STATS: '/stats',

  /** Provinces + country codes for the profile's location field. `GET /locations/provinces`. */
  LOCATIONS: '/locations/provinces',

  /** One province's cities and regencies. `GET /locations/provinces/:code/regions`. */
  LOCATION_REGIONS: route(
    '/locations/provinces/:code/regions',
    (provinceCode: string) => `/locations/provinces/${encodeURIComponent(provinceCode)}/regions`
  ),

  /** Published landing-page testimonials. `GET /testimonials`. */
  TESTIMONIALS: '/testimonials',

  AUTH: {
    /** Create an account. `POST /auth/register` → `{ user, accessToken }`. */
    REGISTER: '/auth/register',
    /** Email + password login. `POST /auth/login` → `{ user, accessToken }`. */
    LOGIN: '/auth/login',
    /** Google sign-in — redeems the redirect's authorization code. `POST /auth/google`. */
    GOOGLE: '/auth/google',
    /** Rotate the refresh cookie for a new access token. `POST /auth/refresh`. */
    REFRESH: '/auth/refresh',
    /** Revoke the refresh token + clear the cookie. `POST /auth/logout`. */
    LOGOUT: '/auth/logout',
    /** Current user (GET) / update profile (PATCH). `/auth/me`. */
    ME: '/auth/me',
    /**
     * Upload (POST) / remove (DELETE) the profile picture. `/auth/me/avatar`. The upload
     * here sends the bytes through the API — now the fallback to the direct pair below.
     */
    AVATAR: '/auth/me/avatar',
    /** Start a direct-to-R2 avatar upload. `POST` `{ type, size }` → `{ upload }`. */
    AVATAR_UPLOADS: '/auth/me/avatar/uploads',
    /** Finish one. `POST` `{ token }` → `{ user }`. */
    AVATAR_UPLOADS_COMPLETE: '/auth/me/avatar/uploads/complete',
    /** Claim an address; mails a confirmation link. `POST /auth/me/email` → 202. */
    EMAIL: '/auth/me/email',
    /** Re-send the pending confirmation link. `POST /auth/me/email/resend` → 202. */
    EMAIL_RESEND: '/auth/me/email/resend',
    /** Prove an address with the emailed token. `POST /auth/verify-email` → `{ user }`. */
    VERIFY_EMAIL: '/auth/verify-email',
    /** Change / set the password while signed in. `POST /auth/me/password`. */
    PASSWORD: '/auth/me/password',
    /** Ask for a reset link. `POST /auth/forgot-password` → always 202. */
    FORGOT_PASSWORD: '/auth/forgot-password',
    /**
     * Reset-link handling. `GET` pre-checks a token (`{ valid }`) so an expired link
     * can say so before the user types a password twice; `POST` redeems it (204).
     */
    RESET_PASSWORD: '/auth/reset-password',
  },

  /** The soft-launch promos and where the caller stands. `GET /promos` → `Promos`. */
  PROMOS: '/promos',

  PARTNER: {
    /** Mint an invite code to share. `POST /partner/invite` → `{ code, expiresAt }`. */
    INVITE: '/partner/invite',
    /** Link accounts with a code. `POST /partner/accept` → `{ user, promo }`. */
    ACCEPT: '/partner/accept',
    /** Unlink the partner. `DELETE /partner` → `{ user }`. */
    ROOT: '/partner',
  },

  ROOMS: {
    /** Mint a fresh, unique room code for a date session. `POST /rooms` → `{ roomId }`. */
    CREATE: '/rooms',
    /** Pre-join joinability check for a typed code. `GET /rooms/:id` → `{ status }`. */
    BY_ID: route('/rooms/:id', (id: string) => `/rooms/${encodeURIComponent(id)}`),
  },

  STRIPS: {
    /**
     * List the user's saved strips (GET) / upload a new one (POST). `/strips`. The upload
     * here sends the bytes through the API — now the fallback to the direct pair below.
     */
    ROOT: '/strips',
    /**
     * Start a direct-to-R2 strip upload. `POST` with the files' types and sizes and the
     * save metadata → `{ strip }` (already saved) or `{ upload }` (presigned PUTs + token).
     */
    UPLOADS: '/strips/uploads',
    /** Finish one. `POST` `{ token }` → `{ strip }`. */
    UPLOADS_COMPLETE: '/strips/uploads/complete',
    /** Serve (GET) / delete (DELETE) one strip. `/strips/:id`. */
    BY_ID: route('/strips/:id', (id: string) => `/strips/${encodeURIComponent(id)}`),
    /**
     * Move strips from the cart to the gallery **free of charge**, while checkout is
     * dark. `POST /strips/unlock`. Refused with `403 payments_enabled` once payments
     * are live — the paid checkout is the only unlock path then.
     */
    UNLOCK: '/strips/unlock',
    /**
     * Take an unlocked strip out of the gallery. `POST /strips/:id/remove`. A soft
     * delete: the files go, the row stays so the payment that bought it still names it.
     */
    REMOVE: route('/strips/:id/remove', (id: string) => `/strips/${encodeURIComponent(id)}/remove`),
    /**
     * Download the clean file (paid), streamed through the API. `GET /strips/:id/print`.
     * Now only the fallback when the direct R2 download below fails.
     */
    PRINT: route('/strips/:id/print', (id: string) => `/strips/${encodeURIComponent(id)}/print`),
    /**
     * A presigned, ~60 s R2 URL for the clean file (paid), so the browser downloads it
     * straight from the bucket. `GET /strips/:id/print-url` → `{ url, expiresAt }`.
     */
    PRINT_URL: route(
      '/strips/:id/print-url',
      (id: string) => `/strips/${encodeURIComponent(id)}/print-url`
    ),
  },

  /** Scrapbooks (docs/PLAN-scrapbook.md §2). Every route needs a signed-in user. */
  SCRAPBOOKS: {
    /** The shelf (GET) / start a new draft (POST `{ templateId }`). `/scrapbooks`. */
    ROOT: '/scrapbooks',
    /** One scrapbook (GET), autosave its layout (PUT), delete an unpaid one (DELETE). */
    BY_ID: route('/scrapbooks/:id', (id: string) => `/scrapbooks/${encodeURIComponent(id)}`),
    /**
     * Start a direct-to-R2 finish. `POST` with the PDF's and cover's types and sizes and the
     * page count → `{ upload }` (presigned PUTs + token).
     */
    FINISH_UPLOADS: route(
      '/scrapbooks/:id/finish/uploads',
      (id: string) => `/scrapbooks/${encodeURIComponent(id)}/finish/uploads`
    ),
    /** Complete one. `POST` `{ token }` → `{ scrapbook }`. */
    FINISH_UPLOADS_COMPLETE: route(
      '/scrapbooks/:id/finish/uploads/complete',
      (id: string) => `/scrapbooks/${encodeURIComponent(id)}/finish/uploads/complete`
    ),
    /** The fallback finish, bytes through the API. `POST` raw `MOMS` body → `{ scrapbook }`. */
    FINISH: route(
      '/scrapbooks/:id/finish',
      (id: string) => `/scrapbooks/${encodeURIComponent(id)}/finish`
    ),
    /** Back to a draft (finished, unpaid only). `POST` → `{ scrapbook }`. */
    REOPEN: route(
      '/scrapbooks/:id/reopen',
      (id: string) => `/scrapbooks/${encodeURIComponent(id)}/reopen`
    ),
    /** Free unlock while payments are dark; `403 payments_enabled` otherwise. */
    UNLOCK: route(
      '/scrapbooks/:id/unlock',
      (id: string) => `/scrapbooks/${encodeURIComponent(id)}/unlock`
    ),
    /** Soft remove of a paid scrapbook (files deleted, row kept). `POST` → `{ quota }`. */
    REMOVE: route(
      '/scrapbooks/:id/remove',
      (id: string) => `/scrapbooks/${encodeURIComponent(id)}/remove`
    ),
    /** A presigned, ~60 s R2 URL for the paid PDF. `GET` → `{ url, expiresAt }`. */
    PDF_URL: route(
      '/scrapbooks/:id/pdf-url',
      (id: string) => `/scrapbooks/${encodeURIComponent(id)}/pdf-url`
    ),
    /** The paid PDF streamed through the API — the fallback for `PDF_URL`. */
    PDF: route('/scrapbooks/:id/pdf', (id: string) => `/scrapbooks/${encodeURIComponent(id)}/pdf`),
  },

  PAYMENTS: {
    /** The account's recent orders + lifetime spend. `GET /payments` → `{ orders, spent }`. */
    ROOT: '/payments',
    /** Open a payment on one channel. `POST /payments/charge`. */
    CHARGE: '/payments/charge',
    /**
     * What a selection would cost with the promos applied, nothing charged.
     * `POST /payments/quote` `{ stripIds, scrapbookIds }` → `PaymentQuote`.
     */
    QUOTE: '/payments/quote',
    /** The live attempt to resume, if any. `GET /payments/pending`. */
    PENDING: '/payments/pending',
    /** Save the attempt's QR image. `GET /payments/:orderId/qr`. */
    QR: route('/payments/:orderId/qr', (id: string) => `/payments/${encodeURIComponent(id)}/qr`),
    /** Poll one attempt. `GET /payments/:orderId`. */
    BY_ID: route('/payments/:orderId', (id: string) => `/payments/${encodeURIComponent(id)}`),
  },

  TURN: {
    /** Fresh STUN + ephemeral TURN ICE servers for WebRTC. `GET /turn-credentials`. */
    CREDENTIALS: '/turn-credentials',
  },

  FEEDBACK: {
    /** Submit a feedback / support message. `POST /feedback` → `{ ok: true }`. */
    ROOT: '/feedback',
  },
}
