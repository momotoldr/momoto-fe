import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { ANALYTICS_EVENTS } from './events'
import { normalizeRoute } from './routes'
import type { TrackId } from './trackIds'
import { trackEvents } from './trackEvents'

/**
 * Page views and clicks are tracked by hand — nothing is recorded automatically.
 *
 * - Every page component calls `useTrackPageView()` as its first line.
 * - Every primary action calls `trackClick(TRACK_IDS.X)` in its handler.
 *
 * Both record route **patterns** (`/room/:roomId`), never a raw path, query or hash.
 */

/** The page last recorded in this tab — module state, so it spans page components. */
let previous: { route: string; at: number } | null = null

/**
 * Records `page_view` when the page opens: its route, the route before it and how long
 * that one was open.
 *
 * One view per route: React StrictMode runs this effect twice in development, and a page
 * that changes only its params (`/room/A` → `/room/B`) is the same route — both are
 * skipped because the route matches the one just recorded.
 */
export function useTrackPageView(): void {
  const { pathname } = useLocation()
  const route = normalizeRoute(pathname)

  useEffect(() => {
    if (previous?.route === route) return
    const now = Date.now()
    trackEvents(ANALYTICS_EVENTS.PAGE_VIEW, {
      route,
      fromRoute: previous?.route ?? null,
      msOnPrevious: previous ? now - previous.at : null,
    })
    previous = { route, at: now }
  }, [route])
}

/**
 * Records a `click` on a primary action — call it first thing in the control's handler.
 * `el` is `'a'` for links (so a query can tell navigation from actions).
 */
export function trackClick(id: TrackId, el: 'button' | 'a' = 'button'): void {
  trackEvents(ANALYTICS_EVENTS.CLICK, {
    id,
    el,
    route: normalizeRoute(window.location.pathname),
  })
}
