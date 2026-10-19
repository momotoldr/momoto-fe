import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'
import type { StripLayout } from '@/constants/stripTemplates'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/store/useCartStore'
import type { StoredStrip } from '@/types/stripType'

import { stripLayoutOf } from './stripLayout'
import styles from './StripTray.module.scss'

type Filter = 'all' | 'unused'

interface StripTrayProps {
  /** The selected slot's family — only strips of this shape fit it. */
  layout: StripLayout
  /** The strip in the selected slot now, if any. */
  currentStripId?: string
  /** Strips already placed somewhere else in this scrapbook — marked "Used", still pickable. */
  usedStripIds: ReadonlySet<string>
  onPick: (strip: StoredStrip) => void
  /** Empty the selected slot. Offered only when it holds something. */
  onClear?: () => void
  /** The side panel fits four ribbons across; the phone's sheet, five smaller ones. */
  variant: 'panel' | 'sheet'
}

/**
 * The user's unlocked strips that fit the selected slot. Gallery strips only: the PDF is
 * drawn from each strip's clean copy, which only an unlocked strip has (plan, *Strip
 * source*). Reads the cart store, which already holds every strip; no new request.
 *
 * The strip in this place is ringed and tagged "Here"; one placed elsewhere in the book is
 * tagged "Used" and dimmed but can still be picked — the same photo twice is allowed, just
 * rarely meant. "Not used yet" hides those.
 */
export function StripTray({
  layout,
  currentStripId,
  usedStripIds,
  onPick,
  onClear,
  variant,
}: StripTrayProps) {
  const { t, i18n } = useTranslation()
  const items = useCartStore((state) => state.items)
  const status = useCartStore((state) => state.status)
  const load = useCartStore((state) => state.load)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    if (status === 'idle') void load()
  }, [status, load])

  const strips = useMemo(
    () => items.filter((strip) => strip.paid && stripLayoutOf(strip) === layout),
    [items, layout]
  )
  const unused = useMemo(
    () => strips.filter((strip) => !usedStripIds.has(strip.id) && strip.id !== currentStripId),
    [strips, usedStripIds, currentStripId]
  )
  const shown =
    filter === 'all'
      ? strips
      : strips.filter((strip) => strip.id === currentStripId || !usedStripIds.has(strip.id))

  const filters: { id: Filter; count: number }[] = [
    { id: 'all', count: strips.length },
    { id: 'unused', count: unused.length },
  ]

  if (status === 'loading' && strips.length === 0) {
    return (
      <p className={styles.note}>
        <Loader2 className={styles.spinner} aria-hidden="true" />
        {t('scrapbook.tray.loading')}
      </p>
    )
  }

  if (strips.length === 0) {
    return (
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
    )
  }

  return (
    <div className={cn(styles.tray, variant === 'sheet' && styles.traySheet)}>
      <div className={styles.chips} role="group">
        {filters.map(({ id, count }) => (
          <button
            key={id}
            type="button"
            className={cn(styles.chip, filter === id && styles.chipOn)}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {t(`scrapbook.tray.${id}`)}
            <span className={styles.chipCount}>{count}</span>
          </button>
        ))}
      </div>

      <ul className={cn(styles.stripGrid, styles[`grid_${variant}_${layout}`])}>
        {shown.map((strip) => {
          const here = strip.id === currentStripId
          const used = !here && usedStripIds.has(strip.id)
          return (
            <li key={strip.id}>
              <button
                type="button"
                className={cn(styles.strip, here && styles.stripHere, used && styles.stripUsed)}
                aria-pressed={here}
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
                {(here || used) && (
                  <span className={cn(styles.tag, here && styles.tagHere)}>
                    {t(here ? 'scrapbook.tray.here' : 'scrapbook.tray.used')}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <p className={styles.hint}>{t('scrapbook.tray.hint')}</p>

      {currentStripId && onClear && (
        <button type="button" className={styles.takeOut} onClick={onClear}>
          {t('scrapbook.tray.remove')}
        </button>
      )}
    </div>
  )
}
