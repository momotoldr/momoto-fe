import { ArrowRight, Loader2, ShoppingBag, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { listOrders } from '@/api/services/paymentsService'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { env } from '@/env'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/store/useCartStore'
import type { PaymentOrder } from '@/types/stripType'

import { formatIdr } from './profileData'
import { ProfileCard } from './ProfileCard'
import styles from './PurchasesPanel.module.scss'

/** How many thumbnails a row shows before it stops and counts the rest. */
const MAX_ROW_THUMBS = 3

type LoadState = 'loading' | 'ready' | 'error'

interface PurchasesPanelProps {
  /** Unlocked strips — the "prints unlocked" half of the summary. */
  galleryCount: number
}

/**
 * The Purchases tab: what this account has paid for.
 *
 * Deliberately short — five orders, capped server-side. It's a receipt strip for
 * checking a charge, not an accounting page, and the full history lives in the Midtrans
 * receipts. While checkout is dark nothing has been charged, so this is the empty state
 * for everyone, which is the honest thing for it to show.
 */
export function PurchasesPanel({ galleryCount }: PurchasesPanelProps) {
  const { t, i18n } = useTranslation()
  const items = useCartStore((state) => state.items)

  const [state, setState] = useState<LoadState>('loading')
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [spent, setSpent] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    listOrders()
      .then((history) => {
        if (cancelled) return
        setOrders(history.orders)
        setSpent(history.spent)
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The order rows carry strip ids, not image URLs — the cart store already holds every
  // strip this account owns, so the thumbnails come from there rather than from a second
  // serialization of the same rows on the server.
  const thumbnails = useMemo(
    () => new Map(items.map((strip) => [strip.id, strip.thumbnailUrl])),
    [items]
  )

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }),
    [i18n.language]
  )

  return (
    <ProfileCard
      title={t('auth.profile.purchases.title')}
      subtitle={t('auth.profile.purchases.subtitle')}
    >
      {state === 'loading' && (
        <p className={styles.status}>
          <Loader2 className={styles.spinner} />
          {t('common.loading')}
        </p>
      )}

      {state === 'error' && (
        <p className={styles.error} role="alert">
          <TriangleAlert className={styles.errorIcon} />
          {t('auth.profile.purchases.loadError')}
        </p>
      )}

      {state === 'ready' && (
        <>
          <div className={styles.summary}>
            <div className={styles.summaryCell}>
              <span className={styles.summaryLabel}>{t('auth.profile.purchases.spent')}</span>
              <span className={styles.summaryValue}>{formatIdr(spent)}</span>
            </div>
            <span className={styles.summaryRule} aria-hidden="true" />
            <div className={styles.summaryCell}>
              <span className={styles.summaryLabel}>{t('auth.profile.purchases.unlocked')}</span>
              <span className={styles.summaryValue}>
                {t('auth.profile.purchases.stripCount', { count: galleryCount })}
              </span>
            </div>
            <span className={styles.summarySpacer} />
            <span className={styles.summaryPrice}>
              {t('auth.profile.purchases.perStrip', { price: formatIdr(env.stripPrintPriceIdr) })}
            </span>
          </div>

          {orders.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <ShoppingBag className={styles.emptyGlyph} />
              </span>
              <h3 className={styles.emptyTitle}>{t('auth.profile.purchases.emptyTitle')}</h3>
              <p className={styles.emptyBody}>{t('auth.profile.purchases.emptyBody')}</p>
              <Button asChild variant="outline">
                <Link to={ROUTES.cart}>
                  {t('auth.profile.purchases.openCart')}
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          ) : (
            <div className={styles.table}>
              <div className={cn(styles.row, styles.headRow)} aria-hidden="true">
                <span className={styles.colStrips}>{t('auth.profile.purchases.colStrips')}</span>
                <span className={styles.colOrder}>{t('auth.profile.purchases.colOrder')}</span>
                <span className={styles.colDate}>{t('auth.profile.purchases.colDate')}</span>
                <span className={styles.colAmount}>{t('auth.profile.purchases.colAmount')}</span>
                <span className={styles.colStatus} />
              </div>

              {orders.map((order) => {
                const shown = order.stripIds.slice(0, MAX_ROW_THUMBS)
                const overflow = order.stripIds.length - shown.length
                return (
                  <div key={order.orderId} className={styles.row}>
                    <div className={styles.colStrips}>
                      {shown.map((id) => {
                        const src = thumbnails.get(id)
                        return src ? (
                          <img key={id} className={styles.thumb} src={src} alt="" />
                        ) : (
                          // The strip was deleted, or belongs to a page the cart hasn't
                          // loaded. The order still bought it, so keep its place.
                          <span key={id} className={styles.thumbMissing} aria-hidden="true" />
                        )
                      })}
                      {overflow > 0 && <span className={styles.thumbMore}>+{overflow}</span>}
                    </div>

                    <div className={styles.colOrder}>
                      <span className={styles.orderTitle}>
                        {t('auth.profile.purchases.orderLine', { count: order.stripIds.length })}
                      </span>
                      <span className={styles.orderRef}>{order.orderId}</span>
                    </div>

                    <span className={styles.colDate}>
                      {dateFmt.format(new Date(order.createdAt))}
                    </span>
                    <span className={styles.colAmount}>{formatIdr(order.grossAmount)}</span>
                    <span className={styles.colStatus}>
                      <span className={cn(styles.badge, styles[`badge_${order.status}`])}>
                        {t(`payment.status.${order.status}`)}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </ProfileCard>
  )
}
