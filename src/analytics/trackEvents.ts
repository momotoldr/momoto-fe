import type { EventOptions } from '@momotoldr/tracker'

import type { MomotoEventName, MomotoEvents } from './events'
import { tracker } from './tracker'

/** Props are optional only for events that have none (`signed_out`, `checkout_started`, …). */
type EventArgs<K extends MomotoEventName> =
  MomotoEvents[K] extends Record<string, never>
    ? [data?: MomotoEvents[K], options?: EventOptions]
    : [data: MomotoEvents[K], options?: EventOptions]

/**
 * Sends one event: `trackEvents(ANALYTICS_EVENTS.SHOT_TAKEN, { index: 2, … })`.
 *
 * Fire-and-forget — it never throws, never blocks, and returns nothing to await; delivery,
 * batching and retries are the tracker's job. The props are checked against the event, so
 * a missing or misspelled prop is a type error. Call it from event handlers, effects and
 * store subscriptions, never during render (render can run more than once).
 *
 * Page views and clicks are recorded automatically and need no call.
 */
export function trackEvents<K extends MomotoEventName>(event: K, ...args: EventArgs<K>): void {
  const [data, options] = args
  void tracker.track(event, (data ?? {}) as MomotoEvents[K], options)
}
