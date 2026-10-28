import { Gift } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { ANALYTICS_EVENTS, trackEvents } from '@/analytics'
import type { PromoPlacement } from '@/analytics/events'
import { cn } from '@/lib/utils'
import { usePromoStore } from '@/store/usePromoStore'

import type { PromoCardKind } from './promoState'
import styles from './PromoChip.module.scss'

/**
 * That a promo applies to an activity, as one chip (user, 2026-10-27: a chip, not a
 * card): "Promo · Buy 1 Get 1" on the photobooth, "Promo · Scrapbook disc 25%" on the
 * scrapbook, in the promo's fixed colour. It only says there is one — the details are on
 * the cards inside. Shaped like the activity cards' mode chips, so it sits among them.
 */
export function PromoChip({
  kind,
  placement,
  className,
}: {
  kind: PromoCardKind
  placement: PromoPlacement
  className?: string
}) {
  const { t } = useTranslation()
  const promo = kind === 'bundle' ? 'bundle' : 'partner'
  // The bundle is named by its discount (user, 2026-10-27): "Scrapbook disc 25%".
  const bundlePercent = usePromoStore((s) => s.promos?.bundle.discountPercent)

  useEffect(() => {
    trackEvents(ANALYTICS_EVENTS.PROMO_CARD_SHOWN, { promo, state: kind, placement })
  }, [promo, kind, placement])

  return (
    <span className={cn(styles.chip, kind === 'bundle' ? styles.mint : styles.rose, className)}>
      <Gift className={styles.icon} aria-hidden="true" />
      {t('promos.chip', {
        name:
          kind === 'bundle'
            ? t('promos.chipBundle', { percent: bundlePercent ?? 25 })
            : t('promos.tagBogo'),
      })}
    </span>
  )
}
