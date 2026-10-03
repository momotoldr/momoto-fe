import { matchPath } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'

/** Every route the app declares, as patterns (`/room/:roomId`). */
const PATTERNS = Object.values(ROUTES)

/** What a path the router doesn't know is recorded as — never the path itself. */
export const UNKNOWN_ROUTE = '*'

/**
 * A pathname → the route **pattern** it matched, which is all page views and clicks ever
 * record. `/room/AB12CD` becomes `/room/:roomId`, so room codes (the room's only access
 * control), reset tokens and anything else in a path never leave the browser. The tracker
 * hands this the pathname alone; the query string and hash are never read.
 */
export function normalizeRoute(pathname: string): string {
  for (const pattern of PATTERNS) {
    if (matchPath({ path: pattern, end: true }, pathname)) return pattern
  }
  return UNKNOWN_ROUTE
}
