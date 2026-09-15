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
 * Every HTTP endpoint the frontend talks to. The real-time signaling/sync happens
 * over Socket.io (see `utils/socket.ts`); these are the plain-HTTP room endpoints
 * served alongside it on the same host (`env.socketUrl`).
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
    /** Google sign-in — verifies a Google ID token. `POST /auth/google`. */
    GOOGLE: '/auth/google',
    /** Rotate the refresh cookie for a new access token. `POST /auth/refresh`. */
    REFRESH: '/auth/refresh',
    /** Revoke the refresh token + clear the cookie. `POST /auth/logout`. */
    LOGOUT: '/auth/logout',
    /** Current user (GET) / update profile (PATCH). `/auth/me`. */
    ME: '/auth/me',
    /** Upload (POST) / remove (DELETE) the profile picture. `/auth/me/avatar`. */
    AVATAR: '/auth/me/avatar',
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

  PARTNER: {
    /** Mint an invite code to share. `POST /partner/invite` → `{ code, expiresAt }`. */
    INVITE: '/partner/invite',
    /** Link accounts with a code. `POST /partner/accept` → `{ user }`. */
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
    /** List the user's saved strips (GET) / upload a new one (POST). `/strips`. */
    ROOT: '/strips',
    /** Serve (GET) / delete (DELETE) one strip. `/strips/:id`. */
    BY_ID: route('/strips/:id', (id: string) => `/strips/${encodeURIComponent(id)}`),
    /**
     * Move strips from the cart to the gallery **free of charge**, while checkout is
     * dark. `POST /strips/unlock`. Refused with `403 payments_enabled` once payments
     * are live — the paid checkout is the only unlock path then.
     */
    UNLOCK: '/strips/unlock',
    /** Upload the clean (paid) copy. `POST /strips/:id/print-image`. */
    PRINT_IMAGE: route(
      '/strips/:id/print-image',
      (id: string) => `/strips/${encodeURIComponent(id)}/print-image`
    ),
    /** Download the clean file (paid). `GET /strips/:id/print`. */
    PRINT: route('/strips/:id/print', (id: string) => `/strips/${encodeURIComponent(id)}/print`),
  },

  PAYMENTS: {
    /** The account's recent orders + lifetime spend. `GET /payments` → `{ orders, spent }`. */
    ROOT: '/payments',
    /** Open a payment on one channel. `POST /payments/charge`. */
    CHARGE: '/payments/charge',
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
