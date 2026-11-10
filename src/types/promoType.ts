import type { PaymentMethod } from '@/types/stripType'

/**
 * The soft-launch promos (docs/PLAN-promos.md), as `GET /promos` reports them.
 *
 * `enabled` is core's flag (for the bundle, its price and end date too). The UI shows a
 * promo only when that and its own `VITE_*_PROMO_ENABLED` are both on.
 */

/**
 * Where the partner promo stands for this account: `available` — not earned, and a link
 * now could earn it; `ready` — earned and unused; `used` — spent; `unavailable` — not
 * earned, and links no longer earn it.
 */
export type PartnerPromoState = 'available' | 'ready' | 'used' | 'unavailable'

export interface Promos {
  partner: {
    enabled: boolean
    endsAt: string | null
    newAccountDays: number
    /** Signed in only. */
    state?: PartnerPromoState
  }
  bundle: {
    enabled: boolean
    endsAt: string | null
    /** Unpaid strips in one bundle, with one finished scrapbook (3). */
    strips: number
    /** The scrapbook and its strips together, in whole rupiah. Null while it's off. */
    price: number | null
    /** The discount behind that price, as a whole percentage (25). Null while it's off. */
    discountPercent: number | null
    /** The same items at list price, for the struck-through figure. */
    listPrice: number | null
  }
}

/** `POST /payments/quote`: what a selection would cost, promos applied. */
export interface PaymentQuote {
  /**
   * The items alone, before any admin fee (no method is picked yet). Null when a
   * scrapbook is in it and its list price isn't set.
   */
  grossAmount: number | null
  /** The same items at list price. */
  listAmount: number | null
  /** Two of the strips are priced as one. */
  bogo: boolean
  /** Scrapbook bundles in it: each one finished scrapbook + 3 of its unpaid strips. */
  bundles: number
  /** The channels switched on in core, in display order. Absent from an older core. */
  methods?: PaymentMethod[]
  /**
   * What each switched-on method adds on top of `grossAmount` as its admin fee (0 for
   * none). Null when `grossAmount` is; absent from a core that predates the fee.
   */
  adminFees?: Partial<Record<PaymentMethod, number>> | null
}

/** What `POST /partner/accept` says about the promo: whether the accepter just earned it. */
export interface PartnerLinkPromo {
  partnerBogo: 'earned' | null
}
