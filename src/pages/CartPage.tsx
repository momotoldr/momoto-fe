import {
  ArrowRight,
  Check,
  Clock,
  CreditCard,
  Info,
  Loader2,
  LockOpen,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ApiError from '@/api/apiError'
import { ANALYTICS_EVENTS, TRACK_IDS, trackClick, trackEvents, useTrackPageView } from '@/analytics'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { cartItems } from '@/features/gallery/selectors'
import { env } from '@/env'
import { CheckoutModal } from '@/features/checkout/CheckoutModal'
import { useCheckout } from '@/features/checkout/useCheckout'
import { useCountdown } from '@/features/checkout/useCountdown'
import { formatIdr } from '@/features/profile/profileData'
import { CartScrapbookCard } from '@/features/scrapbook/CartScrapbookCard'
import { cn } from '@/lib/utils'
import { reopenScrapbook, unlockScrapbook } from '@/api/services/scrapbooksService'
import { useCartStore } from '@/store/useCartStore'
import { useScrapbookStore } from '@/store/useScrapbookStore'
import type { ScrapbookSummary } from '@/types/scrapbookType'
import type { StoredStrip } from '@/types/stripType'

import styles from './CartPage.module.scss'

interface ModeGroup {
  key: string
  sessionMode: StoredStrip['sessionMode']
  strips: StoredStrip[]
}

/**
 * How long after a strip is saved its clean copy may still be in flight.
 *
 * The print copy uploads immediately after the strip itself, so a strip made seconds ago
 * can be `printable: false` and still be perfectly fine. Inside this window the cart says
 * "preparing" and offers a refresh; past it the copy is never arriving, and saying
 * "preparing" would be a second lie on top of the one the result screen already told.
 */
const PRINT_PENDING_MS = 2 * 60_000

type PrintState = 'ready' | 'pending' | 'unavailable'

/**
 * Whether a strip can be unlocked, is still waiting on its clean copy, or never will be.
 *
 * The server reports only the boolean; the age is what separates "not yet" from "not
 * ever", and it has to be decided here because the server can't know an upload is still
 * in flight.
 */
function printStateOf(strip: StoredStrip, now: number): PrintState {
  if (strip.printable) return 'ready'
  return now - new Date(strip.createdAt).getTime() < PRINT_PENDING_MS ? 'pending' : 'unavailable'
}

/**
 * Group strips into at most two buckets by how the session was played — Solo and
 * Date — newest strip (and group) first. (Each solo session has its own room code,
 * so grouping by session id would scatter them; mode keeps it to two lists.)
 */
function groupByMode(items: StoredStrip[]): ModeGroup[] {
  const byKey = new Map<string, ModeGroup>()
  // Newest first overall (ISO timestamps sort chronologically), so iterating in this
  // order makes both the groups and the strips within read recent→old.
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const strip of sorted) {
    const key = strip.sessionMode ?? '__unknown__'
    const group = byKey.get(key)
    if (group) {
      group.strips.push(strip)
    } else {
      byKey.set(key, { key, sessionMode: strip.sessionMode, strips: [strip] })
    }
  }
  return [...byKey.values()]
}

/** The cart: saved strips grouped by session, with a batch checkout for the paid copies. */
export function CartPage() {
  useTrackPageView()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const items = useCartStore((state) => state.items)
  const status = useCartStore((state) => state.status)
  const load = useCartStore((state) => state.load)
  const removeStrip = useCartStore((state) => state.removeStrip)
  const unlock = useCartStore((state) => state.unlock)
  const clear = useCartStore((state) => state.clear)
  // Strips cached in this browser before sign-in that the full cart couldn't accept.
  const pendingGuestCount = useCartStore((state) => state.pendingGuestCount)

  // Checkout — selection, totals and the pay bar — is gated on this one flag
  // (`VITE_PAYMENTS_ENABLED`). With it off the cart is a free download shelf: no
  // checkboxes, no prices, no bar. Nothing below reaches Midtrans while it is false.
  const payEnabled = env.paymentsEnabled
  // Ids of the unpaid strips and scrapbooks the user ticked to pay for.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // A strip being moved to the gallery, or a scrapbook back to the shelf (free unlock).
  const [unlockingId, setUnlockingId] = useState<string | null>(null)
  // The strip pending a delete confirmation, or null when the dialog is closed.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  // Whether the "clear the whole cart" confirmation is open.
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  // Refresh on mount so a direct visit (or a strip created elsewhere) is up to date.
  useEffect(() => {
    void load()
  }, [load])

  // Finished scrapbooks wait here until they're paid for (user decision, 2026-10-17): the
  // cart is where every payment happens. They leave the shelf while they're here, and go
  // back to it once paid. Each is a cart item like a strip — it takes a slot, and it can
  // be ticked into the same checkout.
  const shelf = useScrapbookStore((state) => state.shelf)
  const loadShelf = useScrapbookStore((state) => state.loadShelf)
  const scrapbookQuota = useScrapbookStore((state) => state.quota)
  useEffect(() => {
    if (env.scrapbookEnabled) void loadShelf()
  }, [loadShelf])
  const scrapbooks = useMemo(
    () => (env.scrapbookEnabled ? shelf.filter((item) => item.state === 'finished') : []),
    [shelf]
  )

  // The clock `printStateOf` is read against, re-stamped on every list change so a strip
  // whose clean copy never arrived stops claiming to be "preparing" once the refresh that
  // would have found it comes back empty-handed. No interval: nothing here changes on its
  // own, and every path that could change it already goes through `load`.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
  }, [items])

  // Unlocked strips have moved to the gallery, so the cart shows only what is still
  // waiting — the two pages are one list split on `paid`, not two stores.
  const unpaid = useMemo(() => cartItems(items), [items])
  const groups = useMemo(() => groupByMode(unpaid), [unpaid])
  // What's in the cart: unpaid strips plus finished scrapbooks, one slot each. Only unpaid
  // items count against the cap — what they bought is theirs to keep. The server counts
  // the same way (`cartIsFull`).
  const cartCount = unpaid.length + scrapbooks.length
  // Clamped at zero: lowering the cap below what someone already holds is a real state,
  // and "-1 slots left" is not how to describe it.
  const slotsLeft = Math.max(0, env.stripMaxItems - cartCount)
  const cartFull = slotsLeft === 0
  // Pips to paint as taken. Clamped the same way, so an over-cap cart shows a full
  // meter rather than overflowing it.
  const slotsUsed = Math.min(cartCount, env.stripMaxItems)
  // Our own checkout owns the payment lifecycle: channel choice, the QR or deeplink,
  // polling, and resuming an attempt the user walked away from. It reloads the cart on
  // settlement so the paid strips leave for the gallery.
  const {
    phase: checkoutPhase,
    attempt,
    selection: checkoutSelection,
    liveAttempt,
    open: openCheckout,
    reopen: reopenCheckout,
    close: closeCheckout,
    choose: chooseMethod,
  } = useCheckout(async (wasVisible) => {
    setSelected(new Set())
    // Paid strips leave for the gallery, paid scrapbooks for the shelf.
    await Promise.all([load(), env.scrapbookEnabled ? loadShelf() : undefined])
    // The modal says this itself when it is open; a toast as well would say it twice.
    if (!wasVisible) {
      const { stripIds, scrapbookIds } = checkoutSelection
      const message =
        scrapbookIds.length === 0
          ? 'payment.success'
          : stripIds.length === 0
            ? 'scrapbook.cart.paid'
            : 'checkout.successMixed'
      toast.success(t(message), {
        action:
          stripIds.length === 0
            ? { label: t('scrapbook.cart.viewShelf'), onClick: () => navigate(ROUTES.scrapbook) }
            : { label: t('cart.viewGallery'), onClick: () => navigate(ROUTES.gallery) },
      })
    }
  })

  // Same clock the modal shows, so the banner and the QR never disagree.
  const liveCountdown = useCountdown(liveAttempt?.expiresAt ?? null)

  // Strips the payment currently running already covers — drives the badge and which
  // card offers to resume.
  const awaitingIds = useMemo(() => new Set(liveAttempt?.stripIds ?? []), [liveAttempt])
  const awaitingScrapbookIds = useMemo(
    () => new Set(liveAttempt?.scrapbookIds ?? []),
    [liveAttempt]
  )
  // The server allows one live payment per account, so while one is running there is
  // nothing a second selection could buy. The cart says so plainly rather than leaving a
  // pay bar that quietly reopens the *existing* QR and discards what was ticked.
  const paymentInFlight = liveAttempt !== null
  // Only strips with a clean copy can be sold, so they're the only ones the selection —
  // and the "select all" that mirrors it — can reach. Ticking one the checkout would
  // refuse is how a whole basket used to fail on account of a single bad strip. And
  // nothing at all is selectable while a payment is in flight, for the same reason: the
  // charge behind it would be refused.
  const selectableStrips = useMemo(
    () => (paymentInFlight ? [] : unpaid.filter((strip) => printStateOf(strip, now) === 'ready')),
    [unpaid, now, paymentInFlight]
  )
  // Only count selections that are still present + unpaid (a paid/removed strip drops out).
  const selectedStrips = useMemo(
    () => selectableStrips.filter((s) => selected.has(s.id)),
    [selectableStrips, selected]
  )
  // Every finished scrapbook is sellable — it has its PDF by definition.
  const selectableScrapbooks = useMemo(
    () => (payEnabled && !paymentInFlight ? scrapbooks : []),
    [payEnabled, paymentInFlight, scrapbooks]
  )
  const selectedScrapbooks = useMemo(
    () => selectableScrapbooks.filter((s) => selected.has(s.id)),
    [selectableScrapbooks, selected]
  )
  const selectedCount = selectedStrips.length + selectedScrapbooks.length

  /**
   * What a checkout for these would cost, as the server will compute it. Null while a
   * scrapbook is in it and its price isn't known here (`VITE_SCRAPBOOK_PRICE_IDR` unset) —
   * the modal then waits for the charge to state the real total.
   */
  const totalOf = (strips: number, scrapbookCount: number): number | null => {
    const scrapbookPrice = scrapbookCount > 0 ? env.scrapbookPriceIdr : 0
    if (scrapbookPrice === null) return null
    return env.stripPrintPriceIdr * strips + scrapbookPrice * scrapbookCount
  }
  const selectedTotal = totalOf(selectedStrips.length, selectedScrapbooks.length)
  const totalLabel = selectedTotal === null ? '' : formatIdr(selectedTotal)

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language]
  )

  const groupTitle = (group: ModeGroup): string => {
    if (group.sessionMode === 'solo') return t('cart.soloGroup')
    if (group.sessionMode === 'date') return t('cart.dateGroup')
    if (group.sessionMode === 'group') return t('cart.groupGroup')
    return t('cart.unknownSession')
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectableCount = selectableStrips.length + selectableScrapbooks.length
  const allUnpaidSelected = selectableCount > 0 && selectedCount === selectableCount
  const toggleSelectAll = () => {
    setSelected(
      allUnpaidSelected
        ? new Set()
        : new Set([...selectableStrips, ...selectableScrapbooks].map((item) => item.id))
    )
  }

  // The pay bar disables only while the charge request is in flight — once the modal
  // is showing a QR it is on top anyway, and the bar behind it is not reachable.
  const checkingOut = checkoutPhase === 'charging'

  const checkout = (stripIds: string[], scrapbookIds: string[] = []) => {
    if (stripIds.length + scrapbookIds.length === 0) return
    openCheckout({ stripIds, scrapbookIds })
  }

  /**
   * Unlock one strip — the cart's primary action, and its checkout.
   *
   * The cart holds strips that haven't been unlocked yet, so there is nothing clean here
   * to download; the clean file is the thing unlocking buys, and it's downloaded from the
   * gallery. That makes this one button the whole point of the page.
   *
   * Two funding paths, one control: with payments live it opens our checkout modal for
   * this strip, and while they're dark it flips the strip free of charge. The label follows
   * (`cart.unlock` either way) because what the user gets is identical — only who pays
   * differs.
   *
   * A full gallery is named as such: the fix is to delete something *there*, which no
   * amount of retrying here will do.
   */
  const unlockStrip = async (strip: StoredStrip) => {
    trackEvents(ANALYTICS_EVENTS.UNLOCK_CLICKED, { paymentsEnabled: payEnabled, item: 'strips' })
    if (payEnabled) {
      checkout([strip.id])
      return
    }
    setUnlockingId(strip.id)
    const result = await unlock([strip.id])
    setUnlockingId(null)
    if (result.ok) {
      toast.success(t('cart.unlocked'), {
        action: { label: t('cart.viewGallery'), onClick: () => navigate(ROUTES.gallery) },
      })
      return
    }
    if (result.reason === 'gallery_full') {
      toast.error(t('cart.galleryFull'))
      return
    }
    // Both of these already refetched the cart, so the strip is correcting itself on
    // screen as the toast lands — the message explains what the user just watched happen.
    if (result.reason === 'already_paid') {
      toast.message(t('cart.alreadyUnlocked'), {
        action: { label: t('cart.viewGallery'), onClick: () => navigate(ROUTES.gallery) },
      })
      return
    }
    if (result.reason === 'stale') {
      toast.message(t('cart.stripGone'))
      return
    }
    if (result.reason === 'not_printable') {
      toast.error(t('cart.printUnavailableToast'))
      return
    }
    toast.error(t('cart.unlockError'))
  }

  /**
   * Unlock one scrapbook — its card's own button. With payments live it checks out this
   * one alone (or resumes the payment that covers it); while they're dark it's free, and
   * the scrapbook goes straight back to the shelf.
   */
  const unlockOneScrapbook = async (scrapbook: ScrapbookSummary) => {
    trackEvents(ANALYTICS_EVENTS.UNLOCK_CLICKED, { paymentsEnabled: payEnabled, item: 'scrapbook' })
    if (payEnabled) {
      checkout([], [scrapbook.id])
      return
    }
    setUnlockingId(scrapbook.id)
    try {
      await unlockScrapbook(scrapbook.id)
      await loadShelf()
      toast.success(t('scrapbook.cart.unlocked'), {
        action: {
          label: t('scrapbook.cart.open'),
          onClick: () => navigate(ROUTES.scrapbookEdit.replace(':scrapbookId', scrapbook.id)),
        },
      })
    } catch {
      toast.error(t('scrapbook.cart.unlockError'))
    } finally {
      setUnlockingId(null)
    }
  }

  /**
   * Take a scrapbook out of the cart without deleting it: it reopens as a draft (user
   * decision, 2026-10-17), freeing its slot. Its PDF goes; the next Finish renders a new
   * one. The server refuses while a payment covers it, and the card hides Remove then.
   * Asked first, like a strip's delete: the PDF can't be had back without finishing again.
   */
  const [removingScrapbookId, setRemovingScrapbookId] = useState<string | null>(null)
  // The scrapbook pending a remove confirmation, or null when the dialog is closed.
  const [pendingRemoveScrapbook, setPendingRemoveScrapbook] = useState<ScrapbookSummary | null>(
    null
  )
  const confirmRemoveScrapbook = () => {
    const scrapbook = pendingRemoveScrapbook
    setPendingRemoveScrapbook(null)
    if (scrapbook) void removeScrapbookFromCart(scrapbook)
  }
  const removeScrapbookFromCart = async (scrapbook: ScrapbookSummary) => {
    setRemovingScrapbookId(scrapbook.id)
    try {
      await reopenScrapbook(scrapbook.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(scrapbook.id)
        return next
      })
      await loadShelf()
      toast.success(t('scrapbook.cart.removed'), {
        action: {
          label: t('scrapbook.cart.edit'),
          onClick: () => navigate(ROUTES.scrapbookEdit.replace(':scrapbookId', scrapbook.id)),
        },
      })
    } catch (error) {
      const paying = error instanceof ApiError && error.code === 'payment_in_progress'
      toast.error(t(paying ? 'scrapbook.viewer.paymentInProgress' : 'scrapbook.cart.removeError'))
      void loadShelf()
    } finally {
      setRemovingScrapbookId(null)
    }
  }

  const remove = async (id: string) => {
    try {
      await removeStrip(id)
    } catch {
      toast.error(t('cart.removeError'))
    }
  }

  // Deleting a strip is irreversible, so confirm first (the trash button opens this).
  const confirmDelete = () => {
    const id = pendingDeleteId
    setPendingDeleteId(null)
    if (id) void remove(id)
  }

  // What "Clear all" would do: delete these strips, send these scrapbooks back to drafts,
  // and keep what the running payment covers.
  const clearableStrips = unpaid.filter((strip) => !awaitingIds.has(strip.id))
  const clearableScrapbooks = scrapbooks.filter((item) => !awaitingScrapbookIds.has(item.id))
  const keptByPayment = cartCount - clearableStrips.length - clearableScrapbooks.length

  /**
   * Empty the cart (user decision, 2026-10-17): strips are deleted, scrapbooks go back to
   * being drafts — the same as their own Remove, so no book is lost to a sweep of strips.
   */
  const clearAll = async () => {
    setConfirmClearOpen(false)
    setSelected(new Set())
    const [strips, ...reopened] = await Promise.allSettled([
      // Strips inside the running payment are held back rather than deleted: the server
      // refuses them, and clearing the cart should not quietly leave a few cards behind
      // with no explanation for why they survived. The same goes for scrapbooks.
      clearableStrips.length > 0 ? clear([...awaitingIds]) : Promise.resolve(),
      ...clearableScrapbooks.map((item) => reopenScrapbook(item.id)),
    ])
    if (clearableScrapbooks.length > 0) await loadShelf()
    if (strips.status === 'rejected' || reopened.some((r) => r.status === 'rejected')) {
      toast.error(t('cart.removeError'))
      return
    }
    if (keptByPayment > 0) toast.message(t('cart.clearKeptPaying', { count: keptByPayment }))
  }

  /** The cap, drawn: one pip per allowed strip, filled left to right by what's held. */
  const renderSlotMeter = () => (
    <div className={styles.slots}>
      <span className={cn(styles.slotsLabel, cartFull && styles.slotsLabelFull)}>
        {cartFull
          ? t('cart.slotsNone')
          : t('cart.remaining', { count: slotsLeft, max: env.stripMaxItems })}
      </span>
      <div className={styles.slotMeter} aria-hidden="true">
        {Array.from({ length: env.stripMaxItems }).map((_, i) => (
          <span
            key={i}
            className={cn(
              styles.slot,
              i < slotsUsed && (cartFull ? styles.slotUsedFull : styles.slotUsed)
            )}
          />
        ))}
      </div>
    </div>
  )

  /** `shared` tints the well: someone else was in the frame. Solo strips stay plain. */
  const renderStrip = (strip: StoredStrip, shared: boolean) => {
    const isSelected = selected.has(strip.id) && !strip.paid
    // A strip with no clean copy has nothing to sell, so it is neither selectable for
    // checkout nor unlockable — and the card says which of the two reasons applies rather
    // than leaving a dead button to fail on click.
    const printState = printStateOf(strip, now)
    // Covered by the payment currently running: the card says so and its action resumes
    // that payment rather than starting another. The rest of the cart is frozen for the
    // duration — no checkbox anywhere, and unlock disabled on the strips this payment
    // does *not* cover, because a charge for them cannot be opened until it resolves.
    const awaitingPayment = awaitingIds.has(strip.id)
    const selectable = payEnabled && !strip.paid && printState === 'ready' && !paymentInFlight
    const frozen = paymentInFlight && !awaitingPayment
    const blocked = printState !== 'ready'
    return (
      <figure
        key={strip.id}
        className={cn(
          styles.card,
          isSelected && styles.cardSelected,
          awaitingPayment && styles.cardAwaiting
        )}
      >
        {selectable && (
          <label className={styles.selectArea}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={isSelected}
              onChange={() => toggleSelect(strip.id)}
              aria-label={t('cart.select')}
            />
            <span className={styles.checkboxBox} aria-hidden="true">
              <Check />
            </span>
          </label>
        )}

        <div className={cn(styles.well, shared && styles.wellShared)}>
          <img
            src={strip.thumbnailUrl}
            alt={t('cart.stripAlt')}
            className={styles.preview}
            loading="lazy"
            // Templates don't share one shape (a 2x2 card is landscape), so take the
            // stored strip's own aspect — a fixed 1:3 box would letterbox a wide card
            // into a sliver with dead well above and below it.
            style={
              strip.width && strip.height
                ? { aspectRatio: `${strip.width} / ${strip.height}` }
                : undefined
            }
          />
        </div>

        <div className={styles.cardBody}>
          <figcaption className={styles.meta}>
            {dateFmt.format(new Date(strip.createdAt))}
          </figcaption>

          {awaitingPayment && (
            <span className={styles.payBadge}>
              <Clock className={styles.payBadgeIcon} aria-hidden="true" />
              {t('cart.awaitingPayment')}
            </span>
          )}

          {blocked && (
            <p
              className={cn(styles.printNote, printState === 'unavailable' && styles.printNoteBad)}
            >
              {printState === 'pending' ? (
                <Info className={styles.printNoteIcon} aria-hidden="true" />
              ) : (
                <TriangleAlert className={styles.printNoteIcon} aria-hidden="true" />
              )}
              <span>
                {t(printState === 'pending' ? 'cart.printPending' : 'cart.printUnavailable')}
                {printState === 'pending' && (
                  <button
                    type="button"
                    className={styles.printNoteAction}
                    onClick={() => void load()}
                  >
                    {t('cart.printRefresh')}
                  </button>
                )}
              </span>
            </p>
          )}

          <div className={styles.cardActions}>
            <Button
              size="sm"
              className={styles.unlockBtn}
              disabled={unlockingId === strip.id || blocked || frozen}
              onClick={() => {
                trackClick(TRACK_IDS.CART_UNLOCK)
                void unlockStrip(strip)
              }}
            >
              {unlockingId === strip.id ? <Loader2 className={styles.btnSpinner} /> : <LockOpen />}
              {t(
                unlockingId === strip.id
                  ? 'cart.unlockBusy'
                  : awaitingPayment
                    ? 'cart.resumePayment'
                    : 'cart.unlock'
              )}
            </Button>
            {/* Gone entirely while this strip's payment is live: deleting it would drop
                the row the settling webhook needs, leaving the user charged for a strip
                that no longer exists. The server refuses this too — the control is
                removed so nobody is offered an action that can only fail.

                Still shown for `blocked` strips: removing one is the only thing left to
                do with a strip that can never be printed. */}
            {!awaitingPayment && (
              <Button
                size="sm"
                variant="outline"
                className={styles.iconBtn}
                disabled={unlockingId === strip.id}
                onClick={() => setPendingDeleteId(strip.id)}
                aria-label={t('cart.remove')}
                title={t('cart.remove')}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        </div>
      </figure>
    )
  }

  /* Closes a group's shelf with an invitation to shoot another strip in that mode, or
     nothing at all once the cap is reached.

     The split follows what the tile is *about*. The invitation is mode-specific, so every
     shelf gets its own; a tile on the Solo shelf alone reads as "solo is where you add
     strips". The cap is not mode-specific — it's one shared pool of 20 across both modes —
     so nothing describing it appears in here at all: the count lives in the header's pip
     meter and the full state in the banner, both page-level. Inside a shelf, either would
     read as a per-mode allowance. */
  const renderTrailingTile = (sessionMode: StoredStrip['sessionMode']) => {
    // A full cart ends its shelves plainly. There is nothing to invite, and the page
    // already says why twice above: the header meter reads "No slots left" and the banner
    // names the strip that didn't fit. A third copy inside a mode's shelf added nothing —
    // and read as that mode running out on its own.
    if (cartFull) return null
    // Named by mode so two shelves don't end in two identical cards, which reads as a
    // rendering fault. Both lead to `/photobooth`, which is where the mode is chosen.
    const title =
      sessionMode === 'date'
        ? 'cart.newStripDate'
        : sessionMode === 'group'
          ? 'cart.newStripGroup'
          : sessionMode === 'solo'
            ? 'cart.newStripSolo'
            : 'cart.newStrip'
    return (
      <Link to={ROUTES.photobooth} className={styles.tile}>
        <span className={styles.tileIcon}>
          <Plus />
        </span>
        <span className={styles.tileBody}>
          <span className={styles.tileTitle}>{t(title)}</span>
        </span>
      </Link>
    )
  }

  /**
   * The Scrapbooks shelf's own invitation, like each strip shelf's: it starts a new one at
   * the template picker. Gone when the cart is full (a finished scrapbook would have
   * nowhere to go) and when the scrapbook limit is reached (the picker would refuse).
   */
  const canStartScrapbook =
    env.scrapbookEnabled &&
    !cartFull &&
    !(scrapbookQuota && scrapbookQuota.limit > 0 && scrapbookQuota.used >= scrapbookQuota.limit)
  const renderScrapbookTile = () => {
    if (!canStartScrapbook) return null
    return (
      <Link to={ROUTES.scrapbookNew} className={styles.tile}>
        <span className={styles.tileIcon}>
          <Plus />
        </span>
        <span className={styles.tileBody}>
          <span className={styles.tileTitle}>{t('scrapbook.shelf.new')}</span>
        </span>
      </Link>
    )
  }

  // Skeleton placeholder for the fetch/flush loading state — mirrors the group →
  // shelf layout so real strips slot in without the page jumping.
  const renderSkeleton = () => (
    <div className={styles.sessions} role="status" aria-label={t('cart.loading')}>
      <section className={styles.session}>
        <div className={styles.skeletonHead}>
          <span className={styles.skeletonTitle} />
          <span className={styles.skeletonCount} />
        </div>
        <div className={styles.cards}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <span className={styles.skeletonWell}>
                <span className={styles.skeletonPreview} />
              </span>
              <div className={styles.skeletonBody}>
                <span className={styles.skeletonMeta} />
                <div className={styles.skeletonActions}>
                  <span className={styles.skeletonButton} />
                  <span className={styles.skeletonButtonSm} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )

  const renderScrapbooks = () =>
    scrapbooks.length > 0 && (
      <section className={styles.session}>
        <header className={styles.sessionHead}>
          <h2 className={styles.sessionTitle}>{t('cart.scrapbookGroup')}</h2>
          <span className={styles.sessionCount}>
            {t('cart.scrapbookCount', { count: scrapbooks.length })}
          </span>
        </header>
        <div className={styles.cards}>
          {scrapbooks.map((scrapbook) => {
            const awaiting = awaitingScrapbookIds.has(scrapbook.id)
            return (
              <CartScrapbookCard
                key={scrapbook.id}
                scrapbook={scrapbook}
                selectable={selectableScrapbooks.includes(scrapbook)}
                selected={selected.has(scrapbook.id)}
                onToggle={() => toggleSelect(scrapbook.id)}
                awaiting={awaiting}
                frozen={paymentInFlight && !awaiting}
                unlocking={unlockingId === scrapbook.id}
                onUnlock={() => void unlockOneScrapbook(scrapbook)}
                removing={removingScrapbookId === scrapbook.id}
                onRemove={() => setPendingRemoveScrapbook(scrapbook)}
              />
            )
          })}
          {renderScrapbookTile()}
        </div>
      </section>
    )

  const renderStrips = () => {
    if (status === 'loading' && items.length === 0) {
      return renderSkeleton()
    }

    if (status === 'error' && items.length === 0) {
      return (
        <div className={styles.empty}>
          <p className={styles.emptyMessage}>{t('cart.loadError')}</p>
          <Button variant="outline" onClick={() => void load()}>
            <RotateCcw /> {t('cart.retry')}
          </Button>
        </div>
      )
    }

    if (unpaid.length === 0) {
      if (scrapbooks.length > 0) return null
      return (
        <div className={styles.empty}>
          {/* Strips either side of a book once scrapbooks exist: the cart holds both. */}
          <div className={styles.emptyStrips} aria-hidden="true">
            <span className={cn(styles.emptyStrip, styles.emptyStripLeft)} />
            <span className={env.scrapbookEnabled ? styles.emptyBook : styles.emptyStrip} />
            <span className={cn(styles.emptyStrip, styles.emptyStripRight)} />
          </div>
          {/* Names no kind of item: the cart holds whatever an activity makes — strips
              and scrapbooks today, more later — so the way in is the activities list. */}
          <p className={styles.emptyMessage}>{t('cart.empty')}</p>
          <Button asChild className={styles.emptyCta}>
            <Link to={ROUTES.activities}>
              {t('cart.emptyCta')} <ArrowRight />
            </Link>
          </Button>
        </div>
      )
    }

    return (
      <div className={styles.sessions}>
        {groups.map((group) => (
          <section key={group.key} className={styles.session}>
            <header className={styles.sessionHead}>
              <h2 className={styles.sessionTitle}>{groupTitle(group)}</h2>
              <span className={styles.sessionCount}>
                {t('cart.stripCount', { count: group.strips.length })}
              </span>
            </header>

            <div className={styles.cards}>
              {group.strips.map((strip) =>
                renderStrip(strip, group.sessionMode === 'date' || group.sessionMode === 'group')
              )}
              {renderTrailingTile(group.sessionMode)}
            </div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.head}>
          <div className={styles.headMain}>
            <h1 className={styles.title}>{t('cart.title')}</h1>
            <p className={styles.subtitle}>
              {cartCount === 0
                ? t('cart.subtitleEmpty')
                : scrapbooks.length === 0
                  ? t('cart.subtitle', { count: unpaid.length })
                  : unpaid.length === 0
                    ? t('cart.subtitleScrapbooks', { count: scrapbooks.length })
                    : t('cart.subtitleItems', { count: cartCount })}
            </p>
          </div>

          {cartCount > 0 && (
            <div className={styles.headAside}>
              {renderSlotMeter()}
              <div className={styles.headActions}>
                {selectableCount > 0 && payEnabled && (
                  <Button variant="outline" className={styles.headButton} onClick={toggleSelectAll}>
                    {allUnpaidSelected ? t('cart.clearSelection') : t('cart.selectAll')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className={styles.headButton}
                  onClick={() => setConfirmClearOpen(true)}
                >
                  <Trash2 /> {t('cart.clearAll')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* A payment left running outlives the modal, so the cart has to say so — the
            user closed a QR, not the transaction, and nothing else on this page would
            hint that money is still expected. Leads the other banners because it is the
            only one with a live deadline attached. */}
        {liveAttempt && (
          <div className={cn(styles.banner, styles.bannerPayment)} role="status">
            <Clock className={styles.bannerIcon} />
            <p className={cn(styles.bannerText, styles.bannerTextPayment)}>
              {t('cart.paymentPending', { total: formatIdr(liveAttempt.grossAmount) })}
              {liveCountdown ? ` · ${t('checkout.expiresIn', { countdown: liveCountdown })}` : ''}
            </p>
            <Button size="sm" className={styles.bannerAction} onClick={reopenCheckout}>
              {t('cart.resumePayment')}
            </Button>
          </div>
        )}

        {/* One banner at a time, the more actionable one winning. A full cart is the
            blocking fact — and when guest strips are the thing waiting on that space,
            their message is the one that explains what happens after a delete. */}
        {cartCount > 0 && cartFull && (
          <div className={cn(styles.banner, styles.bannerFull)} role="status">
            <span className={styles.bannerIconTile} aria-hidden="true">
              <TriangleAlert />
            </span>
            <p className={cn(styles.bannerText, styles.bannerTextFull)}>
              {pendingGuestCount > 0
                ? t('cart.pendingBanner', { count: pendingGuestCount })
                : t('cart.fullBanner', { max: env.stripMaxItems })}
            </p>
          </div>
        )}
        {!cartFull && pendingGuestCount > 0 && (
          <div className={styles.banner} role="status">
            <Info className={styles.bannerIcon} />
            <p className={styles.bannerText}>
              {t('cart.pendingBanner', { count: pendingGuestCount })}
            </p>
          </div>
        )}

        {/* Scrapbooks lead: there are at most a handful, and one just finished is the
            reason the user was sent here. */}
        {renderScrapbooks()}
        {renderStrips()}
      </div>

      {payEnabled && selectedCount > 0 && (
        <div className={styles.checkoutBar}>
          <div className={styles.checkoutBarInner}>
            <div className={styles.checkoutInfo}>
              <div className={styles.checkoutFigures}>
                <span className={styles.checkoutCount}>
                  {selectedScrapbooks.length === 0
                    ? t('cart.selectedCount', { count: selectedCount })
                    : t('cart.selectedItems', { count: selectedCount })}
                </span>
                <span className={styles.checkoutTotal}>{totalLabel}</span>
              </div>
              <span className={styles.checkoutDivider} aria-hidden="true" />
              <button
                type="button"
                className={styles.clearSelection}
                onClick={() => setSelected(new Set())}
              >
                {t('cart.clearSelection')}
              </button>
            </div>
            <div className={styles.checkoutAction}>
              <span className={styles.checkoutNote}>{t('cart.checkoutNote')}</span>
              <Button
                className={styles.checkoutBtn}
                disabled={checkingOut}
                onClick={() =>
                  checkout(
                    selectedStrips.map((strip) => strip.id),
                    selectedScrapbooks.map((scrapbook) => scrapbook.id)
                  )
                }
              >
                {checkingOut ? <Loader2 className={styles.btnSpinner} /> : <CreditCard />}
                {t('cart.checkout')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t('cart.deleteTitle')}
        description={t('cart.deleteDescription')}
        confirmLabel={t('cart.deleteConfirm')}
        cancelLabel={t('cart.deleteCancel')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />

      <ConfirmDialog
        open={pendingRemoveScrapbook !== null}
        title={t('scrapbook.cart.removeTitle')}
        description={t('scrapbook.cart.removeDescription')}
        confirmLabel={t('scrapbook.cart.removeConfirm')}
        cancelLabel={t('cart.deleteCancel')}
        destructive
        onConfirm={confirmRemoveScrapbook}
        onCancel={() => setPendingRemoveScrapbook(null)}
      />

      <ConfirmDialog
        open={confirmClearOpen}
        title={t('cart.clearTitle')}
        // One sentence per thing that happens: strips deleted, scrapbooks back to drafts,
        // and whatever the running payment covers kept.
        description={[
          clearableStrips.length > 0 && t('cart.clearDescription'),
          clearableScrapbooks.length > 0 &&
            t('cart.clearDescriptionScrapbooks', { count: clearableScrapbooks.length }),
          keptByPayment > 0 && t('cart.clearDescriptionPaying', { count: keptByPayment }),
        ]
          .filter(Boolean)
          .join(' ')}
        confirmLabel={t('cart.clearConfirm')}
        cancelLabel={t('cart.deleteCancel')}
        destructive
        onConfirm={() => void clearAll()}
        onCancel={() => setConfirmClearOpen(false)}
      />

      <CheckoutModal
        phase={checkoutPhase}
        attempt={attempt}
        strips={checkoutSelection.stripIds.length}
        scrapbooks={checkoutSelection.scrapbookIds.length}
        grossAmount={totalOf(
          checkoutSelection.stripIds.length,
          checkoutSelection.scrapbookIds.length
        )}
        onChoose={(method) => void chooseMethod(method)}
        onClose={closeCheckout}
      />
    </main>
  )
}
