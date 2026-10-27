import { useEffect, useState } from 'react'

import type { CheckoutTarget } from '@/api/services/paymentsService'
import { quoteOrder } from '@/api/services/promosService'
import { env } from '@/env'
import type { PaymentQuote } from '@/types/promoType'

/** Long enough that ticking three boxes in a row asks once, short enough not to show. */
const DEBOUNCE_MS = 200

/**
 * The latest answer for each selection, shared by every caller: the checkout modal opens
 * on what the pay bar just priced, so it shows that figure at once instead of flashing the
 * list price while it asks again. Still re-asked each time — this only fills the wait.
 * Bounded by what one cart can hold; cleared with the page.
 */
const lastQuotes = new Map<string, PaymentQuote>()

/**
 * What a checkout of `target` would cost with the soft-launch promos applied, asked of
 * the server (`POST /payments/quote`, docs/PLAN-promos.md). The cart keeps no copy of the
 * pricing rules: the quote comes from the same function the charge runs.
 *
 * Null while there's nothing to price, payments are dark, the answer for *this* target
 * hasn't arrived yet, or the quote failed — the caller then falls back to list prices,
 * which the charge will correct anyway. A late answer for an older target is dropped.
 */
export function useQuote(target: CheckoutTarget | null): PaymentQuote | null {
  const key =
    target && target.stripIds.length + target.scrapbookIds.length > 0
      ? JSON.stringify([[...target.stripIds].sort(), [...target.scrapbookIds].sort()])
      : null
  const [answer, setAnswer] = useState<{ key: string; quote: PaymentQuote } | null>(null)

  useEffect(() => {
    if (!env.paymentsEnabled || key === null) return
    const [stripIds, scrapbookIds] = JSON.parse(key) as [string[], string[]]
    let cancelled = false
    const id = window.setTimeout(() => {
      quoteOrder({ stripIds, scrapbookIds })
        .then((quote) => {
          lastQuotes.set(key, quote)
          if (!cancelled) setAnswer({ key, quote })
        })
        .catch(() => {
          // List prices stand in; the charge states the real total.
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [key])

  if (key === null) return null
  return answer && answer.key === key ? answer.quote : (lastQuotes.get(key) ?? null)
}
