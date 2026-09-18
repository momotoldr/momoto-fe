import type { PublicStats } from '@/types/statsType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const statsClient = new AxiosClient()

/**
 * The landing page is the first paint a visitor gets, and these numbers are a garnish
 * on it — not worth holding the render on a slow link. Well under the client's 10s
 * default: if the counters haven't arrived by now, the section stays away.
 */
const STATS_TIMEOUT_MS = 4000

/** A count is only usable if it's a finite, non-negative number. */
function toCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null
}

/**
 * Fetch the public counters. Rejects (via the client's `ApiError`) when the server is
 * unreachable or answers `503 stats_unavailable`, and with a plain `Error` on a
 * malformed body — callers drop the section either way rather than showing zeros,
 * which would read as "nobody uses this" instead of "we couldn't ask".
 */
export async function fetchPublicStats(signal?: AbortSignal): Promise<PublicStats> {
  const { data } = await statsClient.getData<Partial<PublicStats> & { activeSessions?: unknown }>(
    API_ROUTES.STATS,
    {},
    { timeout: STATS_TIMEOUT_MS, signal }
  )
  const users = toCount(data?.users)
  // `activeSessions` is the pre-split field: a live count of occupied rooms, replaced by
  // `sessions`, a historical total, when the room layer moved to momoto-realtime. Both are
  // read because this bundle can be live against a backend that has not been redeployed
  // yet — that window is the cutover itself, and without the fallback the counters would
  // vanish from the landing page for the length of it.
  const sessions = toCount(data?.sessions) ?? toCount(data?.activeSessions)
  const strips = toCount(data?.strips)
  if (users === null || sessions === null || strips === null) {
    throw new Error('stats returned an invalid body')
  }
  return { users, sessions, strips }
}
