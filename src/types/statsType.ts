/**
 * The public counters behind the landing page's numbers, from `GET /stats`.
 *
 * Platform-wide totals, not this user's — the profile's own counters
 * (`features/profile/ProfileStats`) are a different, per-account thing.
 */
export interface PublicStats {
  /** Registered accounts. */
  users: number
  /**
   * Shared rooms with somebody in them right now. Solo booths never touch the
   * server, so they aren't in here — this is people taking strips *together*.
   */
  activeSessions: number
  /** Strips created, ever — locked and unlocked alike. */
  strips: number
}
