/**
 * Tracking for Momoto — see `docs/plans/PLAN-observability.md`. Everything is explicit;
 * nothing is recorded automatically:
 *
 * - a page: `useTrackPageView()` as the first line of the page component;
 * - a primary action: `trackClick(TRACK_IDS.X)` in its handler;
 * - anything else: `trackEvents(ANALYTICS_EVENTS.X, props)`.
 */
export { ANALYTICS_EVENTS } from './events'
export type { MomotoEventName, MomotoEvents } from './events'
export { trackClick, useTrackPageView } from './manual'
export { TRACK_IDS, type TrackId } from './trackIds'
export { trackEvents } from './trackEvents'
export { tracker } from './tracker'
export { unlinkAccount } from './identify'
