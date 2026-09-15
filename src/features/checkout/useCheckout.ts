import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createCharge,
  getPayment,
  getPendingPayment,
  PaymentInProgressError,
} from '@/api/services/paymentsService'
import { env } from '@/env'
import type { PaymentAttempt, PaymentMethod } from '@/types/stripType'

/**
 * Where the checkout modal is in its flow.
 *
 * `awaiting` is the long one — the user is off in a wallet app and we are polling. It
 * ends only on a terminal status from the server or on the attempt expiring.
 */
export type CheckoutPhase =
  'closed' | 'method' | 'charging' | 'awaiting' | 'paid' | 'failed' | 'expired'

/** How often to re-ask the server while a payment is outstanding. */
const POLL_INTERVAL_MS = 3000

/** Whether an attempt can still be paid — pending, and not past its own deadline. */
function isLive(attempt: PaymentAttempt | null): attempt is PaymentAttempt {
  if (!attempt || attempt.status !== 'pending') return false
  if (!attempt.expiresAt) return true
  return new Date(attempt.expiresAt).getTime() > Date.now()
}

/**
 * Drives our own checkout: pick a channel, charge, then poll until the webhook settles
 * the order. Nothing here decides entitlement — it only reflects what the server says,
 * because the notification is the sole thing that flips a strip to paid.
 *
 * The attempt outlives the modal. Closing the modal never cancels a payment, so a live
 * attempt is kept in state (and polled) while the cart shows a banner offering to
 * reopen it.
 */
export function useCheckout(onPaid: (wasVisible: boolean) => void | Promise<void>) {
  const [phase, setPhase] = useState<CheckoutPhase>('closed')
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null)
  const [stripIds, setStripIds] = useState<string[]>([])

  // Kept in a ref so the polling effect can read the latest callback without being
  // re-created on every status change — restarting the interval would drift the cadence.
  const onPaidRef = useRef(onPaid)
  useEffect(() => {
    onPaidRef.current = onPaid
  }, [onPaid])

  /** Take ownership of an attempt without deciding whether to show it. */
  const adopt = useCallback((existing: PaymentAttempt) => {
    setAttempt(existing)
    setStripIds(existing.stripIds)
  }, [])

  /** Adopt an attempt *and* show it — used when the user just asked to pay. */
  const resume = useCallback(
    (existing: PaymentAttempt) => {
      adopt(existing)
      setPhase('awaiting')
    },
    [adopt]
  )

  /**
   * On mount, pick up any still-payable attempt — but deliberately do not open the
   * modal. Forcing it open on every visit to the cart would fight the user who closed
   * it on purpose; the banner is how they get back to it.
   *
   * Skipped entirely while checkout is dark. The cart mounts this hook unconditionally
   * — `VITE_PAYMENTS_ENABLED` only gates the pay UI it renders — so without this guard
   * every cart load asks the server about a payment that cannot exist.
   */
  useEffect(() => {
    if (!env.paymentsEnabled) return
    let cancelled = false
    void getPendingPayment()
      .then((pending) => {
        if (!cancelled && pending) adopt(pending)
      })
      // A failure here is not worth surfacing: the user simply gets the normal flow,
      // and a duplicate charge is refused server-side anyway.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [adopt])

  const open = useCallback(
    (ids: string[]) => {
      // A payment already running wins over a fresh channel choice — the server would
      // refuse a second charge anyway.
      if (isLive(attempt)) {
        setPhase('awaiting')
        return
      }
      setStripIds(ids)
      setAttempt(null)
      setPhase('method')
    },
    [attempt]
  )

  /** Reopen the running attempt — what the cart's banner calls. */
  const reopen = useCallback(() => {
    if (isLive(attempt)) setPhase('awaiting')
  }, [attempt])

  const close = useCallback(() => {
    // Deliberately does not cancel the attempt: the QR stays payable, polling continues,
    // and the banner keeps offering it. Closing the modal is not abandoning the payment.
    setPhase('closed')
  }, [])

  const choose = useCallback(
    async (method: PaymentMethod) => {
      setPhase('charging')
      try {
        const created = await createCharge(stripIds, method)
        resume(created)
      } catch (error) {
        if (error instanceof PaymentInProgressError) {
          resume(error.payment)
          return
        }
        setPhase('failed')
      }
    },
    [stripIds, resume]
  )

  // Poll while an attempt is live, whether or not the modal is showing — otherwise a
  // payment that settles behind a closed modal would leave the banner claiming to be
  // waiting for money that already arrived.
  useEffect(() => {
    if (!isLive(attempt)) return

    let stopped = false
    const orderId = attempt.orderId
    const tick = async () => {
      try {
        const latest = await getPayment(orderId)
        if (stopped) return
        setAttempt(latest)
        if (latest.status === 'paid') {
          // Only take over the screen if the user is watching; otherwise let the banner
          // go and refresh the cart under them. `wasVisible` tells the caller which
          // happened, so settlement behind a closed modal can be announced instead of
          // silently rearranging the page.
          let wasVisible = false
          setPhase((current) => {
            wasVisible = current === 'awaiting'
            return wasVisible ? 'paid' : 'closed'
          })
          await onPaidRef.current(wasVisible)
          return
        }
        if (latest.status !== 'pending') {
          setPhase((current) => (current === 'awaiting' ? 'failed' : 'closed'))
        }
      } catch {
        // Transient — keep polling. A truly dead order resolves via expiry.
      }
    }

    const id = setInterval(() => void tick(), POLL_INTERVAL_MS)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [attempt])

  // Expiry is a client-side deadline as well as a server status: the `expire`
  // notification can lag by minutes, and a QR visibly counting down to zero should stop
  // claiming to be payable the moment it gets there.
  useEffect(() => {
    if (!isLive(attempt)) return
    if (!attempt.expiresAt) return
    const remaining = new Date(attempt.expiresAt).getTime() - Date.now()
    const expire = () => {
      setPhase((current) => (current === 'awaiting' ? 'expired' : 'closed'))
      // Drop it so the banner goes with it; the row stays `pending` server-side until
      // Midtrans says otherwise, which is why `isLive` checks the clock too.
      setAttempt(null)
    }
    if (remaining <= 0) {
      expire()
      return
    }
    const id = setTimeout(expire, remaining)
    return () => clearTimeout(id)
  }, [attempt])

  return {
    phase,
    attempt,
    stripIds,
    /** A payment is outstanding — drives the cart's resume banner. */
    liveAttempt: isLive(attempt) ? attempt : null,
    open,
    reopen,
    close,
    choose,
  }
}
