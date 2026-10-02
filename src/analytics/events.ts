/**
 * Every event Momoto tracks, and its props — the taxonomy from
 * `docs/plans/PLAN-observability.md`. `track('shot_takn', …)` is a type error.
 *
 * **Adding an event here means adding its name to momoto-analytics' `src/allowlist.ts`
 * too**, in the same change. The service drops names it doesn't know (and counts them in
 * `analytics_session.rejected`), so an event missing there is silently lost.
 *
 * Props are scalars only — no objects, and nothing personal: no free text, no email, no
 * room code, no raw path (routes are patterns, see `routes.ts`).
 *
 * A `type` alias, not an `interface`: the tracker's `EventMap` constraint needs the
 * implicit index signature only aliases get.
 */

export type BoothMode = 'solo' | 'date' | 'group'
export type BoothStageName = 'lobby' | 'booth' | 'arrange' | 'result'

/** Every booth event says which booth run it belongs to (a hash of room + start, never the code). */
type Booth = { boothSessionId: string; mode: BoothMode }

export type MomotoEvents = {
  // ── Lifecycle (L6) ────────────────────────────────────────────────────────────
  app_open: {
    referrerHost: string | null
    utmSource: string | null
    utmCampaign: string | null
    isPwa: boolean
  }
  page_view: { route: string; fromRoute: string | null; msOnPrevious: number | null }
  click: { id: string | null; el: string; route: string; to?: string | null }
  visit_hidden: { msVisible: number }
  signed_out: Record<string, never>

  // ── Auth ──────────────────────────────────────────────────────────────────────
  auth_submitted: { method: 'password' | 'google'; intent: 'login' | 'register' }
  auth_succeeded: { method: 'password' | 'google'; intent: 'login' | 'register' }
  auth_failed: { method: 'password' | 'google'; intent: 'login' | 'register'; code: string }
  email_verification_opened: { outcome: 'ok' | 'expired' | 'invalid' }
  password_reset_requested: Record<string, never>
  password_reset_completed: Record<string, never>

  // ── Booth funnel ──────────────────────────────────────────────────────────────
  booth_mode_selected: { mode: BoothMode }
  camera_requested: Booth
  camera_granted: Booth & { msToReady: number; deviceCount: number }
  camera_denied: Booth & { reason: string }
  room_created: Booth & { seats: number }
  room_joined: Booth & { seats: number }
  room_refused: Booth & { reason: 'full' | 'ended' | 'not_found' | 'busy' }
  peer_connected: Booth & { msToConnect: number; viaTurn: boolean }
  peer_failed: Booth & { reason: string; msElapsed: number }
  peer_dropped: Booth & { msIntoSession: number }
  session_started: Booth & { seats: number }
  shot_taken: Booth & { index: number }
  capture_completed: Booth & { msFromStart: number }
  retake_requested: Booth & { shotIndex: number | null }
  stage_entered: Booth & { stage: BoothStageName; msInPreviousStage: number | null }
  template_selected: Booth & { templateId: string; family: 'ribbon' | 'card' }
  filter_selected: Booth & { filterId: string }
  backdrop_selected: Booth & { backdropId: string }
  sticker_added: Booth & { stickerId: string }
  strip_created: Booth & {
    templateId: string
    filterId: string
    stickerCount: number
    msToCompose: number
  }
  strip_downloaded: { format: string; watermarked: boolean }
  strip_shared: { surface: string }
  session_finished: Booth & { byHost: boolean; hadStrip: boolean; secondsUsed: number }
  session_expired: Booth & { hadStrip: boolean }

  // ── Commerce ──────────────────────────────────────────────────────────────────
  cart_viewed: { itemCount: number; slotsUsed: number }
  strip_added_to_cart: { source: 'result' | 'guest_sync' }
  unlock_clicked: { paymentsEnabled: boolean }
  checkout_started: Record<string, never>
  payment_succeeded: { amountIdr: number }
  payment_failed: { code: string }
  gallery_viewed: { itemCount: number }
  strip_deleted: { from: 'cart' | 'gallery' }

  // ── Health ────────────────────────────────────────────────────────────────────
  client_error: { source: string; name: string; messageHash: string; route: string }
  api_failed: { route: string; method: string; status: number; code: string }
  network_trouble: { route: string }
  server_status_changed: { status: 'up' | 'down' | 'unknown' }
  web_vital: { metric: 'LCP' | 'INP' | 'CLS' | 'TTFB'; value: number; rating: string }
  timing: { name: string; ms: number }
}

export type MomotoEventName = keyof MomotoEvents
