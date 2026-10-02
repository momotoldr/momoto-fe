/**
 * Tracking for Momoto — see `docs/plans/PLAN-observability.md`.
 *
 * `track(name, props)` never throws and never blocks; call it from event handlers,
 * effects and store subscriptions, never during render (render can run more than once).
 * Name a button for click tracking with a `data-track="area.action"` attribute.
 */
import { tracker } from './tracker'

export { tracker } from './tracker'
export { unlinkAccount } from './identify'
export type { MomotoEventName, MomotoEvents } from './events'

export const track: typeof tracker.track = (name, data, options) =>
  tracker.track(name, data, options)
