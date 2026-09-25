/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** momoto-core: auth, strips, payments, avatars — every REST call except rooms/TURN. */
  readonly VITE_API_URL?: string
  /** momoto-realtime: the Socket.io server, `/rooms` and `/turn-credentials`. */
  readonly VITE_REALTIME_URL?: string
  /**
   * @deprecated From when one backend served everything. Still read as the fallback for
   * both URLs above, so a build that only sets this keeps pointing at a single host.
   */
  readonly VITE_SOCKET_URL?: string
  readonly VITE_PEERJS_HOST?: string
  readonly VITE_PEERJS_PORT?: string
  readonly VITE_PEERJS_PATH?: string
  readonly VITE_PEERJS_SECURE?: string
  readonly VITE_STUN_URLS?: string
  readonly VITE_TURN_URLS?: string
  readonly VITE_TURN_USERNAME?: string
  readonly VITE_TURN_CREDENTIAL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** Display-only price shown on the button; the server enforces the real charge. */
  readonly VITE_STRIP_PRINT_PRICE_IDR?: string
  /** Set to "true" to show checkout and require payment for clean downloads. */
  readonly VITE_PAYMENTS_ENABLED?: string
  /**
   * Set to "true" to offer group mode (2–4 people). Must be paired with a backend
   * `ROOM_CAPACITY_MAX` above 2 — that is what actually admits the third person.
   */
  readonly VITE_GROUP_MODE_ENABLED?: string
  /** Set to "true" to offer strip backdrops (background removal after capture). */
  readonly VITE_BACKDROPS_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
