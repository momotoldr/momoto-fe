/**
 * Typed, centralized access to runtime configuration.
 *
 * All real-time endpoints are env-configurable so the app can point at a real
 * backend or the local dev mock (Phase 4). PeerJS falls back to the public
 * cloud broker when no host is provided (Phase 5).
 */

interface PeerConfig {
  host?: string
  port?: number
  path?: string
  secure?: boolean
}

interface AppEnv {
  /**
   * `momoto-core`: every REST call except rooms and TURN, and the origin relative avatar
   * and strip URLs resolve against. Those images are core's — never build one from
   * `realtimeUrl`, which serves no files.
   */
  apiUrl: string
  /** `momoto-realtime`: the Socket.io connection, `/rooms` and `/turn-credentials`. */
  realtimeUrl: string
  peer: PeerConfig
  iceServers: RTCIceServer[]
  /** Google OAuth client id for "Sign in with Google". Empty string disables it. */
  googleClientId: string
  /** Display-only strip print price (IDR); the server enforces the real amount. */
  stripPrintPriceIdr: number
  /**
   * How many strips one user may keep at a time.
   *
   * Right now this bounds the signed-out cache only (`utils/guestStripsDb`), which is
   * unbounded storage sitting in the visitor's browser. The server-side cap on
   * `POST /strips` reads its own `STRIP_MAX_ITEMS` — set the two to the same number, or a
   * guest fills this device with strips the cart will then refuse. Same hand-matched pair
   * as SESSION_SECONDS / SESSION_DURATION_MS.
   */
  stripMaxItems: number
  /** Master switch for checkout / pay-to-download. Off = free downloads. */
  paymentsEnabled: boolean
  /**
   * Closed-beta switch. On, the booth and the room join the login wall — every route
   * that can start or join a session requires an account.
   *
   * That inverts the guest-first design on purpose and only for the beta: accounts are
   * seeded by hand (backend `npm run seed:testers`) and signup is shut via the
   * backend's INVITE_ONLY, so "signed in" is exactly "invited". Off restores the public
   * booth, with the login wall back at printing where it belongs.
   */
  betaMode: boolean
  /**
   * Group mode (a 2–4 person room) — see `PLAN-group-mode.md`. Off hides the Group
   * card on `/photobooth` and refuses `?mode=group`, leaving Solo and Date exactly as
   * they are.
   *
   * This is the *visibility* half of the switch, not the enforcement half. VITE_*
   * values are inlined into the public bundle, so the flag stops nobody hand-crafting
   * a request; what actually caps a room at two seats is the backend's room capacity
   * (`ROOM_CAPACITY_MAX`, default 2), which refuses the third join whatever this says.
   * Turning group mode on means raising **both** — another hand-matched pair, like
   * SESSION_SECONDS / SESSION_DURATION_MS.
   */
  groupModeEnabled: boolean
  /**
   * Strip backdrops — replacing the background behind the people in each cut after
   * capture (`utils/backdrop`). Off hides the Background tab and reads every stored
   * backdrop as `none`, so the ~73 MB model and runtime are never fetched; the build
   * doesn't even stage them (`scripts/stage-segmentation.mjs` reads the same flag).
   */
  backdropsEnabled: boolean
}

const DEFAULT_STUN_URL = 'stun:stun.l.google.com:19302'

function parseCsv(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * ICE servers for the WebRTC (PeerJS) media connection.
 *
 * - **STUN** lets each peer discover its public address so the two browsers can
 *   attempt a direct connection. Defaults to Google's public STUN.
 * - **TURN** *relays* the media when a direct path can't be established (symmetric
 *   NAT, restrictive corporate/mobile firewalls). Without it a meaningful slice of
 *   real-world peer pairs never connect. It's opt-in: provide all three of
 *   `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL`.
 *
 * These apply whether the broker is self-hosted or the public PeerJS cloud.
 */
function buildIceServers(): RTCIceServer[] {
  const stunUrls = parseCsv(import.meta.env.VITE_STUN_URLS)
  const servers: RTCIceServer[] = [{ urls: stunUrls.length > 0 ? stunUrls : [DEFAULT_STUN_URL] }]

  const turnUrls = parseCsv(import.meta.env.VITE_TURN_URLS)
  const turnUsername = import.meta.env.VITE_TURN_USERNAME
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL
  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrls,
      username: turnUsername,
      // NOTE: VITE_* values are inlined into the public client bundle, so a static
      // TURN credential is visible to anyone who loads the app. For production prefer
      // short-lived (ephemeral) TURN credentials minted server-side per session.
      // TODO: Securely load this value from an environment variable or secrets vault. Do not hardcode.
      credential: turnCredential,
    })
  }

  return servers
}

/**
 * Read before the object below so `googleClientId` can consult it — the beta hides the
 * Google button rather than letting testers click something that can't work for them.
 */
const betaMode = import.meta.env.VITE_BETA_MODE === 'true'

/**
 * Before the split into core and realtime, one backend served everything from
 * `VITE_SOCKET_URL`. Both URLs fall back to it, so a build configured the old way keeps
 * sending everything to that one host — which is right until realtime is deployed, and
 * means the two new variables can be introduced without a lockstep config change.
 */
const legacySingleBackendUrl = import.meta.env.VITE_SOCKET_URL || undefined

export const env: AppEnv = {
  apiUrl: import.meta.env.VITE_API_URL || legacySingleBackendUrl || 'http://localhost:3001',
  realtimeUrl:
    import.meta.env.VITE_REALTIME_URL || legacySingleBackendUrl || 'http://localhost:3003',
  peer: {
    host: import.meta.env.VITE_PEERJS_HOST || undefined,
    port: import.meta.env.VITE_PEERJS_PORT ? Number(import.meta.env.VITE_PEERJS_PORT) : undefined,
    path: import.meta.env.VITE_PEERJS_PATH || undefined,
    secure: import.meta.env.VITE_PEERJS_SECURE === 'true',
  },
  iceServers: buildIceServers(),
  // Blank during the closed beta: seeded accounts carry neither a googleId nor an
  // email, so Google can never match one — the backend (INVITE_ONLY) refuses to create
  // an account instead, and a visible button would only produce a confusing error.
  // Empty is the app's existing "Google is off" state, so every call site already
  // handles it: GoogleButton renders null and AppProviders skips the SDK entirely.
  googleClientId: betaMode ? '' : (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''),
  stripPrintPriceIdr: Number(import.meta.env.VITE_STRIP_PRINT_PRICE_IDR ?? '8999') || 8999,
  stripMaxItems: Number(import.meta.env.VITE_STRIP_MAX_ITEMS ?? '5') || 5,
  paymentsEnabled: import.meta.env.VITE_PAYMENTS_ENABLED === 'true',
  betaMode,
  groupModeEnabled: import.meta.env.VITE_GROUP_MODE_ENABLED === 'true',
  backdropsEnabled: import.meta.env.VITE_BACKDROPS_ENABLED === 'true',
}
