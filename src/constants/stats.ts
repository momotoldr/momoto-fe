/**
 * Last known platform counters, so a returning visitor sees numbers on first paint
 * instead of waiting on the network — or, offline, sees them at all.
 *
 * The value is `{ users, strips, at }`. **`activeSessions` is deliberately not in
 * there**: that cell claims "right now", and a count from an earlier visit is simply
 * false. It renders as a dash until a live answer arrives.
 */
export const STATS_CACHE_STORAGE_KEY = 'momoto.stats.counts'

/**
 * How long a cached snapshot is worth showing.
 *
 * An hour, which is short enough that the cache only ever serves a revisit from around
 * the same sitting. Accounts and strips only grow, so a stale copy undercounts rather
 * than inventing anything — and since the display rounds down to a "+", an hour of
 * growth almost never changes the digits at all. This could safely be a day (the
 * server's own totals are on that clock), which would carry a returning visitor
 * through an offline stretch; an hour is the deliberately conservative choice.
 */
export const STATS_CACHE_MAX_AGE_MS = 60 * 60_000

/**
 * Floors the platform totals must clear before the landing page shows them at all.
 *
 * The counters exist as evidence that other people are in the booth — so a band
 * reading "9 users, 0 live, 10+ strips" argues the case *against* the product, and
 * the page is better off closing on its call to action instead. These are the point
 * where the numbers start reading as a crowd rather than as a list you could name;
 * they are meant to be moved as the product grows, and moving them is a one-line
 * change here.
 *
 * **Both must clear.** A band is only proof if every number in it is: plenty of
 * strips made by a dozen accounts still tells the visitor how few people are here.
 *
 * **Live sessions deliberately has no floor.** Zero is a truthful, ordinary answer at
 * four in the morning at any size, and gating on it would make the whole section
 * flicker in and out by the hour.
 */
export const STATS_MIN_USERS = 50
export const STATS_MIN_STRIPS = 100
