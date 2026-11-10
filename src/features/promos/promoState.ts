import { useEffect } from 'react'

import { env } from '@/env'
import { useAuthStore } from '@/store/useAuthStore'
import { usePromoStore } from '@/store/usePromoStore'
import type { Promos } from '@/types/promoType'

/**
 * Which promo card a surface should show (docs/PLAN-promos.md §5a). Each promo needs both
 * halves of its flag pair: the FE's `VITE_*_PROMO_ENABLED` and core's `enabled`.
 */
export type PromoCardKind = 'partnerInvite' | 'partnerReady' | 'bundle'

/** Whether an end date (ISO) has passed. Null never ends. */
function ended(endsAt: string | null): boolean {
  return endsAt !== null && new Date(endsAt).getTime() <= Date.now()
}

/**
 * The partner promo's card, or null.
 *
 * - A guest sees the invite while links still earn it — they'd sign in first.
 * - Signed in: `ready` shows the reward; `available` shows the invite only to someone not
 *   linked yet. Someone already linked whose link earned nothing (two older accounts)
 *   can't earn it by linking again, so there's nothing to offer them.
 */
export function partnerCard(
  promos: Promos | null,
  viewer: { isAuthenticated: boolean; linked: boolean }
): PromoCardKind | null {
  if (!env.partnerPromoEnabled || !promos?.partner.enabled) return null
  if (!viewer.isAuthenticated) return ended(promos.partner.endsAt) ? null : 'partnerInvite'
  if (promos.partner.state === 'ready') return 'partnerReady'
  if (promos.partner.state === 'available' && !viewer.linked) return 'partnerInvite'
  return null
}

/** Whether the bundle offer shows. Scrapbooks have to be on for it to mean anything. */
export function bundleOn(promos: Promos | null): boolean {
  return env.bundlePromoEnabled && env.scrapbookEnabled && promos?.bundle.enabled === true
}

/**
 * The result screen's one card: the partner promo first (it's the one tied to this
 * account's next purchase), then the bundle offer.
 */
export function resultCard(
  promos: Promos | null,
  viewer: { isAuthenticated: boolean; linked: boolean }
): PromoCardKind | null {
  return partnerCard(promos, viewer) ?? (bundleOn(promos) ? 'bundle' : null)
}

/**
 * Which activity has a promo on (docs/PLAN-promos.md): the partner buy 1 get 1 rides on
 * the photobooth, the scrapbook bundle on the scrapbook — by the same rules as their
 * cards. Keyed by `ACTIVITIES` key; null where there's none. Fetches the promos itself.
 */
export function useActivityPromos(): Record<string, PromoCardKind | null> {
  const promos = usePromoStore((s) => s.promos)
  const loadPromos = usePromoStore((s) => s.load)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const linked = useAuthStore((s) => Boolean(s.user?.partner))
  useEffect(() => {
    void loadPromos()
  }, [loadPromos, isAuthenticated])
  return {
    photobooth: partnerCard(promos, { isAuthenticated, linked }),
    scrapbook: env.paymentsEnabled && bundleOn(promos) ? 'bundle' : null,
  }
}

// ── The profile card's "hide for 7 days" ────────────────────────────────────────

const DISMISS_KEY = 'momoto.promo.partnerHiddenUntil'
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Whether the profile's invite card was hidden in this browser within the last 7 days.
 * A per-viewer convenience only, so storage that's blocked or cleared just shows the card.
 */
export function partnerInviteHidden(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY))
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}

export function hidePartnerInvite(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS))
  } catch {
    // Storage unavailable: the card simply comes back next visit.
  }
}
