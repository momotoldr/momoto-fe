import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { ANALYTICS_EVENTS, trackEvents } from '@/analytics'
import type { PromoPlacement } from '@/analytics/events'
import { Button } from '@/components/ui/button'
import { env } from '@/env'
import { formatIdr } from '@/features/profile/profileData'
import { cn } from '@/lib/utils'
import { usePromoStore } from '@/store/usePromoStore'

import { BundleArt, PartnerArt, ReadyArt } from './PromoArt'
import type { PromoCardKind } from './promoState'
import styles from './PromoModal.module.scss'

/** How long after the page settles the pop-up opens, so it doesn't land on a blank page. */
const OPEN_DELAY_MS = 600

const seenKey = (kind: PromoCardKind) => `momoto.promoModal.${kind}`

/**
 * Shown this browser session already? Once per visit (user, 2026-10-27): a new session
 * shows it again. Storage that's blocked just counts as not seen — it's only a pop-up.
 */
function seenThisVisit(kind: PromoCardKind): boolean {
  try {
    return sessionStorage.getItem(seenKey(kind)) !== null
  } catch {
    return false
  }
}

function markSeen(kind: PromoCardKind): void {
  try {
    sessionStorage.setItem(seenKey(kind), '1')
  } catch {
    // Storage unavailable: it may show again this visit.
  }
}

interface PromoModalProps {
  /** The promo to announce, or null when there's none — then nothing ever opens. */
  kind: PromoCardKind | null
  placement: PromoPlacement
  /** The main button. A `to` goes there; without one it just closes the pop-up. */
  action: { label: string; to?: string }
}

/**
 * A soft-launch promo announced as a pop-up when someone opens the page it belongs to
 * (user, 2026-10-27): the scrapbook bundle on the scrapbook shelf, the partner buy 1 get 1
 * on the photobooth. **Once per visit** — the first time in a browser session.
 *
 * The promo cards' art and colours, a tag, one headline and one sentence; a main button
 * and "Maybe later". Escape, the backdrop and × close it too.
 */
export function PromoModal({ kind, placement, action }: PromoModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const bundle = usePromoStore((s) => s.promos?.bundle)
  const [open, setOpen] = useState(false)
  const actionRef = useRef<HTMLButtonElement>(null)
  const promo = kind === 'bundle' ? 'bundle' : 'partner'

  // Opens once the page knows there's a promo, unless this visit already saw it.
  useEffect(() => {
    if (!kind || seenThisVisit(kind)) return
    const id = window.setTimeout(() => {
      markSeen(kind)
      setOpen(true)
      trackEvents(ANALYTICS_EVENTS.PROMO_CARD_SHOWN, { promo, state: kind, placement })
    }, OPEN_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [kind, promo, placement])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    actionRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open || !kind) return null

  const copy =
    kind === 'bundle'
      ? {
          tag: t('promos.modal.bundleTag', { percent: bundle?.discountPercent ?? 25 }),
          lead: null,
          headline: t('promos.bundle.headline', {
            count: bundle?.strips ?? 3,
            price: formatIdr(bundle?.price ?? 0),
          }),
          text: t('promos.modal.bundleText', { count: bundle?.strips ?? 3 }),
          Art: BundleArt,
        }
      : kind === 'partnerReady'
        ? {
            tag: t('promos.ready.tag'),
            lead: null,
            headline: t('promos.ready.headline', { price: formatIdr(env.stripPrintPriceIdr) }),
            text: t('promos.modal.readyText'),
            Art: ReadyArt,
          }
        : {
            tag: t('promos.partner.tag'),
            lead: t('promos.partner.lead'),
            headline: t('promos.partner.headline'),
            text: t('promos.modal.partnerText'),
            Art: PartnerArt,
          }
  const { Art } = copy

  const onAction = () => {
    trackEvents(ANALYTICS_EVENTS.PROMO_CARD_CLICKED, { promo, state: kind, placement })
    setOpen(false)
    if (action.to) navigate(action.to)
  }

  return createPortal(
    <div className={styles.overlay} onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-modal-title"
        aria-describedby="promo-modal-text"
        className={cn(styles.dialog, kind === 'bundle' ? styles.mint : styles.rose)}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.hero}>
          <Art className={styles.art} />
          <button
            type="button"
            className={styles.close}
            onClick={() => setOpen(false)}
            aria-label={t('common.close')}
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.tag}>{copy.tag}</p>
          <h2 id="promo-modal-title" className={styles.headline}>
            {copy.lead && <span className={styles.lead}>{copy.lead} </span>}
            {copy.headline}
          </h2>
          <p id="promo-modal-text" className={styles.text}>
            {copy.text}
          </p>

          <div className={styles.actions}>
            <Button ref={actionRef} className={styles.action} onClick={onAction}>
              {action.label}
            </Button>
            <button type="button" className={styles.later} onClick={() => setOpen(false)}>
              {t('promos.modal.later')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
