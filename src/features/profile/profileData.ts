import type { StoredStrip } from '@/types/stripType'

/**
 * Pure helpers behind the profile's counters and money.
 *
 * They take plain arrays and strings rather than reading the stores, so the panels can
 * wrap them in `useMemo` over `items` — the same discipline the gallery's selectors
 * follow, and for the same reason (a selector returning a fresh array never settles
 * under `useSyncExternalStore`).
 */

/** Whole months elapsed since an ISO timestamp, floored at zero. */
export function monthsSince(iso: string, now: Date = new Date()): number {
  const start = new Date(iso)
  if (Number.isNaN(start.getTime())) return 0
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  // The month only counts once its day-of-month has come round again, so an account
  // opened on the 30th isn't "1 month old" on the 2nd.
  const partial = now.getDate() < start.getDate() ? 1 : 0
  return Math.max(0, months - partial)
}

/** Strips that came out of a date session — the pair's own count, not the gallery's. */
export function countDateStrips(strips: StoredStrip[]): number {
  return strips.reduce((total, strip) => total + (strip.sessionMode === 'date' ? 1 : 0), 0)
}

/**
 * Rupiah, in Indonesian grouping ("Rp 8.999") whatever the interface language.
 *
 * The amount is always IDR — it's what Midtrans charged — so formatting it with an
 * English locale would render "Rp 8,999" for a number the receipt spells with dots.
 * Fractions are dropped because the currency has none in practice.
 */
export function formatIdr(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** The profile's three sections. Also the value stored in the URL's `?tab=`. */
export const PROFILE_TABS = ['account', 'partner', 'purchases'] as const

export type ProfileTab = (typeof PROFILE_TABS)[number]

/** Narrow an arbitrary `?tab=` value, falling back to the first tab. */
export function toProfileTab(value: string | null): ProfileTab {
  return PROFILE_TABS.find((tab) => tab === value) ?? 'account'
}
