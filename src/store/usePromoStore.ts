import { create } from 'zustand'

import { getPromos } from '@/api/services/promosService'
import type { Promos } from '@/types/promoType'

interface PromoStoreState {
  /** The last answer from `GET /promos`, or null before the first one (or after a failure). */
  promos: Promos | null
  /**
   * Fetch it again. Every surface that shows a promo calls this on mount, and anything
   * that changes the caller's standing — a settled payment, a partner link, sign-in or
   * sign-out — calls it after. It's one cheap GET, so there's no caching to go stale.
   *
   * A failure keeps whatever was there and shows nothing new: a promo card is never worth
   * an error message.
   */
  load: () => Promise<void>
}

/** The soft-launch promos (docs/PLAN-promos.md), shared by every card, line and tag. */
export const usePromoStore = create<PromoStoreState>((set) => ({
  promos: null,
  load: async () => {
    try {
      set({ promos: await getPromos() })
    } catch {
      // Nothing to say: the cards just don't appear.
    }
  },
}))
