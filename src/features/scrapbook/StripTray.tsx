import { Loader2, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'
import type { StripLayout } from '@/constants/stripTemplates'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/store/useCartStore'
import type { StoredStrip } from '@/types/stripType'

import { stripLayoutOf } from './stripLayout'
import styles from './StripTray.module.scss'

interface StripTrayProps {
  /** The selected slot's family — only strips of this shape fit it. */
  layout: StripLayout
  /** The strip in the selected slot now, if any. */
  currentStripId?: string
  onPick: (strip: StoredStrip) => void
  /** Empty the selected slot. Offered only when it holds something. */
  onClear?: () => void
}

/**
 * The user's unlocked strips that fit the selected slot. Gallery strips only: the PDF is
 * drawn from each strip's clean copy, which only an unlocked strip has (plan, *Strip
 * source*). Reads the cart store, which already holds every strip; no new request.
 */
export function StripTray({ layout, currentStripId, onPick, onClear }: StripTrayProps) {
  const { t, i18n } = useTranslation()
  const items = useCartStore((state) => state.items)
  const status = useCartStore((state) => state.status)
  const load = useCartStore((state) => state.load)

  useEffect(() => {
    if (status === 'idle') void load()
  }, [status, load])

  const strips = useMemo(
    () => items.filter((strip) => strip.paid && stripLayoutOf(strip) === layout),
    [items, layout]
  )

  return (
    <section className={styles.tray} aria-label={t(`scrapbook.tray.title_${layout}`)}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t(`scrapbook.tray.title_${layout}`)}</h2>
        {currentStripId && onClear && (
          <button type="button" className={styles.clear} onClick={onClear}>
            <X aria-hidden="true" />
            {t('scrapbook.tray.remove')}
          </button>
        )}
      </div>

      {status === 'loading' && strips.length === 0 ? (
        <p className={styles.note}>
          <Loader2 className={styles.spinner} aria-hidden="true" />
          {t('scrapbook.tray.loading')}
        </p>
      ) : strips.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.note}>{t(`scrapbook.tray.empty_${layout}`)}</p>
          <p className={styles.hint}>{t('scrapbook.tray.hint')}</p>
          <div className={styles.links}>
            <Link to={ROUTES.cart} className={styles.link}>
              {t('scrapbook.tray.toCart')}
            </Link>
            <Link to={ROUTES.photobooth} className={styles.link}>
              {t('scrapbook.tray.toBooth')}
            </Link>
          </div>
        </div>
      ) : (
        <ul className={cn(styles.list, layout === '2x2' && styles.listCards)}>
          {strips.map((strip) => (
            <li key={strip.id}>
              <button
                type="button"
                className={cn(styles.strip, strip.id === currentStripId && styles.stripCurrent)}
                aria-pressed={strip.id === currentStripId}
                onClick={() => onPick(strip)}
              >
                <img
                  src={strip.thumbnailUrl}
                  alt={t('scrapbook.tray.stripAlt', {
                    date: new Date(strip.createdAt).toLocaleDateString(i18n.language, {
                      day: 'numeric',
                      month: 'short',
                    }),
                  })}
                  className={styles.image}
                  style={{ aspectRatio: `${strip.width} / ${strip.height}` }}
                  loading="lazy"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
