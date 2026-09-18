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
   * Shared sessions ever held — date and group rooms that produced at least one saved
   * strip. Solo booths never share a room, so they aren't in here: this is people
   * taking strips *together*. A lower bound (a session nobody saved from, or a guest's
   * never-synced strips, left nothing to count), which the display's "N+" already says.
   */
  sessions: number
  /** Strips created, ever — locked and unlocked alike. */
  strips: number
}
