/**
 * Every click Momoto records, by id — `trackClick(TRACK_IDS.LOBBY_START_SESSION)` in the
 * control's handler. Clicks are tracked by hand: a button without a `trackClick` call is
 * not recorded at all, so a new primary action needs an entry here and a call.
 *
 * Ids are `area.action`; the area is the screen, not the component, so a query reads like
 * the product. Only primary actions — the steps of the funnel — are listed.
 */
export const TRACK_IDS = {
  // Landing
  LANDING_HERO_OPEN_PHOTOBOOTH: 'landing.hero_open_photobooth',
  LANDING_BANNER_OPEN_PHOTOBOOTH: 'landing.banner_open_photobooth',
  // Header
  NAV_LOGIN: 'nav.login',
  // Photobooth: the mode cards
  PHOTOBOOTH_MODE_SOLO: 'photobooth.mode_solo',
  PHOTOBOOTH_MODE_DATE: 'photobooth.mode_date',
  PHOTOBOOTH_MODE_GROUP: 'photobooth.mode_group',
  // Room
  LOBBY_START_SESSION: 'lobby.start_session',
  CAPTURE_START_SESSION: 'capture.start_session',
  // Arrange
  SELECT_CREATE_STRIP: 'select.create_strip',
  SELECT_RETAKE_ALL: 'select.retake_all',
  // Result
  RESULT_DOWNLOAD: 'result.download',
  RESULT_RETAKE: 'result.retake',
  RESULT_SHARE: 'result.share',
  // Share dialog
  SHARE_INSTAGRAM: 'share.instagram',
  SHARE_NATIVE: 'share.native',
  SHARE_DOWNLOAD: 'share.download',
  // Cart
  CART_UNLOCK: 'cart.unlock',
  // Auth
  AUTH_LOGIN_SUBMIT: 'auth.login_submit',
  AUTH_REGISTER_SUBMIT: 'auth.register_submit',
} as const

export type TrackId = (typeof TRACK_IDS)[keyof typeof TRACK_IDS]
