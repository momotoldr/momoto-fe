import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { env } from '@/env'
import { formatIdr } from '@/features/profile/profileData'
import { BundleMiniArt, ReadyMiniArt } from '@/features/promos/PromoArt'
import { cn } from '@/lib/utils'
import type { PaymentQuote, Promos } from '@/types/promoType'

import styles from './CheckoutPromos.module.scss'

interface CheckoutPromosProps {
  promos: Promos | null
  /** Unpaid strips and finished scrapbooks ticked for this checkout. */
  strips: number
  scrapbooks: number
  /** Whether the cart holds a finished scrapbook at all (ticked or not). */
  cartHasScrapbook: boolean
  /** The server's price for the selection; null until it answers. */
  quote: PaymentQuote | null
}

/**
 * The promos this checkout could use, in the checkout bar (user, 2026-10-27; mockup
 * "Momoto promo cards" › Checkout bar). Each one is **applied** — its colour, art and a ✓
 * — once the ticked items qualify, and greyed out with what's missing until then, so
 * people can see what to tick. No saving amounts on the cards (user): the struck total
 * says that.
 *
 * - **Scrapbook bundle** shows while the offer is on and the cart has a finished scrapbook.
 * - **Buy 1 Get 1** shows only to someone holding a ready reward.
 *
 * Applied follows the server's quote when it has answered; until then the same rule as
 * `priceOrder` (bundles take 3 strips each, then buy 1 get 1 on two of what's left) says
 * it, so the card doesn't wait on the network to react to a tick.
 */
export function CheckoutPromos({
  promos,
  strips,
  scrapbooks,
  cartHasScrapbook,
  quote,
}: CheckoutPromosProps) {
  const { t } = useTranslation()
  const bundle = promos?.bundle
  const perBundle = bundle?.strips ?? 3
  const showBundle =
    env.bundlePromoEnabled &&
    env.scrapbookEnabled &&
    bundle?.enabled === true &&
    bundle.price !== null &&
    cartHasScrapbook
  const showBogo =
    env.partnerPromoEnabled && promos?.partner.enabled === true && promos.partner.state === 'ready'
  if (!showBundle && !showBogo) return null

  const bundles = showBundle ? Math.min(scrapbooks, Math.floor(strips / perBundle)) : 0
  const bundleApplied = quote ? quote.bundles > 0 : bundles > 0
  const looseStrips = strips - bundles * perBundle
  const bogoApplied = quote ? quote.bogo : looseStrips >= 2

  // What to tick next, in the same order the server applies them.
  // (At least 1: the server can say "not applied" where the counts alone wouldn't.)
  const bundleHint =
    scrapbooks === 0
      ? t('promos.checkout.selectScrapbook')
      : t('promos.checkout.selectStrips', { count: Math.max(1, perBundle - strips) })
  const bogoHint = t('promos.checkout.selectStrips', { count: Math.max(1, 2 - looseStrips) })

  return (
    <div className={styles.promos}>
      {showBundle && (
        <PromoRow
          tone="mint"
          applied={bundleApplied}
          Art={BundleMiniArt}
          tag={t('promos.checkout.bundleTag')}
          line={t('promos.bundle.headline', {
            count: perBundle,
            price: formatIdr(bundle?.price ?? 0),
          })}
          hint={bundleHint}
        />
      )}
      {showBogo && (
        <PromoRow
          tone="rose"
          applied={bogoApplied}
          Art={ReadyMiniArt}
          tag={t('promos.tagBogo')}
          line={t('promos.ready.headline', { price: formatIdr(env.stripPrintPriceIdr) })}
          hint={bogoHint}
        />
      )}
    </div>
  )
}

function PromoRow({
  tone,
  applied,
  Art,
  tag,
  line,
  hint,
}: {
  tone: 'mint' | 'rose'
  applied: boolean
  Art: (props: { className?: string }) => React.JSX.Element
  tag: string
  line: string
  hint: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        styles.row,
        applied ? (tone === 'mint' ? styles.mint : styles.rose) : styles.waiting
      )}
    >
      <Art className={styles.art} />
      <span className={styles.text}>
        <span className={styles.tag}>{tag}</span>
        <span className={styles.line}>{line}</span>
      </span>
      {applied ? (
        <span className={styles.applied}>
          <Check aria-hidden="true" />
          {t('promos.checkout.applied')}
        </span>
      ) : (
        <span className={styles.hint}>{hint}</span>
      )}
    </div>
  )
}
