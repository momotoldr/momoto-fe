import { BookHeart, Check, Clock, Loader2, LockOpen, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { getScrapbookTemplate } from '@/constants/scrapbookTemplates'
import { env } from '@/env'
import { formatIdr } from '@/features/profile/profileData'
import { cn } from '@/lib/utils'
import type { ScrapbookSummary } from '@/types/scrapbookType'

import styles from './CartScrapbookCard.module.scss'

const editPath = (id: string) => ROUTES.scrapbookEdit.replace(':scrapbookId', id)

interface CartScrapbookCardProps {
  scrapbook: ScrapbookSummary
  /** Offered a checkbox: payments are live and no payment is in flight. */
  selectable: boolean
  selected: boolean
  onToggle: () => void
  /** Covered by the payment currently running: the button resumes it. */
  awaiting: boolean
  /** A payment that doesn't cover this one is running, so nothing can start here. */
  frozen: boolean
  /** Its free unlock (payments dark) is in flight. */
  unlocking: boolean
  /** Checkout for this one alone while payments are live; the free unlock while dark. */
  onUnlock: () => void
  /** Being taken out of the cart. */
  removing: boolean
  /** Take it out of the cart: back to a draft, the book kept (reopen). */
  onRemove: () => void
}

/**
 * A finished scrapbook waiting in the cart. It's an item like a strip (user decision,
 * 2026-10-17): it takes a cart slot, it can be ticked into the same checkout as strips,
 * and its own Unlock checks out just this one. The cart owns the checkout; this card only
 * shows its part of it. Paid, it's "Yours" on the shelf.
 *
 * Remove takes it out of the cart without deleting it (user decision, 2026-10-17): it goes
 * back to being a draft — the same as Keep editing — its PDF discarded and re-rendered on
 * the next Finish. Not offered while a payment covers it; the server refuses that too.
 */
export function CartScrapbookCard({
  scrapbook,
  selectable,
  selected,
  onToggle,
  awaiting,
  frozen,
  unlocking,
  onUnlock,
  removing,
  onRemove,
}: CartScrapbookCardProps) {
  const { t } = useTranslation()
  const price = env.scrapbookPriceIdr
  const pages = getScrapbookTemplate(scrapbook.templateId)?.pages.length ?? 0
  const title = scrapbook.title || t('scrapbook.shelf.untitled')

  return (
    <article
      className={cn(styles.card, selected && styles.cardSelected, awaiting && styles.cardAwaiting)}
    >
      {selectable && (
        <label className={styles.selectArea}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={selected}
            onChange={onToggle}
            aria-label={t('scrapbook.cart.select')}
          />
          <span className={styles.checkboxBox} aria-hidden="true">
            <Check />
          </span>
        </label>
      )}

      {/* The strip card's well, holding the cover; it opens the scrapbook. */}
      <Link to={editPath(scrapbook.id)} className={styles.well} aria-label={title}>
        <span className={styles.cover}>
          {scrapbook.coverUrl ? (
            <img src={scrapbook.coverUrl} alt="" className={styles.coverImage} loading="lazy" />
          ) : (
            <BookHeart className={styles.coverIcon} aria-hidden="true" />
          )}
        </span>
      </Link>

      <div className={styles.body}>
        <div className={styles.text}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.meta}>
            {t('scrapbook.cart.meta', { count: pages })}
            {env.paymentsEnabled && price !== null && ` · ${formatIdr(price)}`}
          </p>
        </div>

        {awaiting && (
          <span className={styles.payBadge}>
            <Clock className={styles.payBadgeIcon} aria-hidden="true" />
            {t('cart.awaitingPayment')}
          </span>
        )}

        <div className={styles.actions}>
          <Button
            size="sm"
            className={styles.unlockBtn}
            disabled={unlocking || removing || frozen}
            onClick={onUnlock}
          >
            {unlocking ? <Loader2 className={styles.spin} /> : <LockOpen />}
            {t(
              unlocking
                ? 'scrapbook.cart.unlocking'
                : awaiting
                  ? 'cart.resumePayment'
                  : 'scrapbook.cart.unlock'
            )}
          </Button>
          {!awaiting && (
            // The strip card's delete button, to look the same — though this one keeps the
            // book: it goes back to being a draft.
            <Button
              size="sm"
              variant="outline"
              className={styles.iconBtn}
              disabled={unlocking || removing}
              onClick={onRemove}
              aria-label={t('scrapbook.cart.remove')}
              title={t('scrapbook.cart.remove')}
            >
              {removing ? <Loader2 className={styles.spin} /> : <Trash2 />}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
