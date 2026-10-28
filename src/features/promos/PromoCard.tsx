import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { ANALYTICS_EVENTS, trackEvents } from '@/analytics'
import type { PromoPlacement } from '@/analytics/events'
import { env } from '@/env'
import { formatIdr } from '@/features/profile/profileData'
import { cn } from '@/lib/utils'
import { usePromoStore } from '@/store/usePromoStore'

import { BundleArt, PartnerArt, ReadyArt } from './PromoArt'
import type { PromoCardKind } from './promoState'
import styles from './PromoCard.module.scss'

interface PromoCardProps {
  kind: PromoCardKind
  /** Where tapping the card goes. */
  to: string
  placement: PromoPlacement
  /** Shows the × (the profile's "hide for 7 days"). */
  onDismiss?: () => void
}

/**
 * One soft-launch promo, as a one-glance banner (docs/PLAN-promos.md §5a; mockup "Momoto
 * promo cards"): a small tag and one bold line beside an illustration. No body text and
 * no button of its own — the whole card is the link, because a card people have to read
 * is a card people skip (user, 2026-10-27). The longer story lives where it leads.
 *
 * Partner promo in rose (the profile hero's), the bundle in mint (the landing gradient's
 * other end), so the two never read as one offer.
 */
export function PromoCard({ kind, to, placement, onDismiss }: PromoCardProps) {
  const { t } = useTranslation()
  const bundle = usePromoStore((state) => state.promos?.bundle)
  const promo = kind === 'bundle' ? 'bundle' : 'partner'

  useEffect(() => {
    trackEvents(ANALYTICS_EVENTS.PROMO_CARD_SHOWN, { promo, state: kind, placement })
  }, [promo, kind, placement])

  const copy = (() => {
    switch (kind) {
      case 'partnerInvite':
        return {
          tag: t('promos.partner.tag'),
          lead: t('promos.partner.lead'),
          headline: t('promos.partner.headline'),
          Art: PartnerArt,
        }
      case 'partnerReady':
        return {
          tag: t('promos.ready.tag'),
          lead: null,
          headline: t('promos.ready.headline', { price: formatIdr(env.stripPrintPriceIdr) }),
          Art: ReadyArt,
        }
      case 'bundle': {
        // One finished scrapbook + 3 unpaid strips, bought together for one price.
        const strips = bundle?.strips ?? 3
        return {
          tag: t('promos.bundle.tag'),
          lead: null,
          headline: t('promos.bundle.headline', {
            count: strips,
            price: formatIdr(bundle?.price ?? 0),
          }),
          Art: BundleArt,
        }
      }
    }
  })()
  const { Art } = copy

  return (
    <section
      className={cn(styles.card, kind === 'bundle' ? styles.mint : styles.rose)}
      aria-label={copy.tag}
    >
      <Link
        to={to}
        className={styles.link}
        onClick={() =>
          trackEvents(ANALYTICS_EVENTS.PROMO_CARD_CLICKED, { promo, state: kind, placement })
        }
      >
        <span className={styles.text}>
          <span className={styles.tag}>{copy.tag}</span>
          <span className={styles.headline}>
            {copy.lead && <span className={styles.lead}>{copy.lead}</span>}
            {copy.lead && ' '}
            {copy.headline}
          </span>
        </span>
        <Art className={styles.art} />
      </Link>

      {onDismiss && (
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={t('promos.dismiss')}
          title={t('promos.dismiss')}
        >
          <span className={styles.dismissDisc}>
            <X aria-hidden="true" />
          </span>
        </button>
      )}
    </section>
  )
}
