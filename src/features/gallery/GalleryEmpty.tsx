import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'

import type { GalleryFilter } from './galleryData'
import styles from './GalleryEmpty.module.scss'

interface GalleryEmptyProps {
  /** The gallery's capacity, quoted so the page states its own rule up front. */
  limit: number
}

/**
 * The empty gallery.
 *
 * It drops the spine, the filters and the selection bar entirely — there is nothing to
 * index, filter or select, and leaving the chrome up would make the page look broken
 * rather than new. In their place it explains how a strip gets here at all, since a paid
 * strip is the only kind this page ever shows and that isn't guessable from an empty grid.
 */
export function GalleryEmpty({ limit }: GalleryEmptyProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.empty}>
      <div className={styles.stack} aria-hidden="true">
        <span className={styles.ghost} data-tilt="left" />
        <span className={styles.ghost} />
        <span className={styles.ghost} data-tilt="right" />
      </div>

      <div className={styles.copy}>
        <span className={styles.title}>{t('gallery.emptyTitle')}</span>
        <p className={styles.text}>{t('gallery.emptyText', { limit })}</p>
      </div>

      <div className={styles.actions}>
        <Link to={ROUTES.photobooth} className={styles.primary}>
          {t('gallery.emptyCta')}
          <ArrowRight />
        </Link>
        <Link to={ROUTES.activities} className={styles.secondary}>
          {t('gallery.emptyCtaAlt')}
        </Link>
      </div>
    </div>
  )
}

interface FilterEmptyProps {
  /** The pill that matched nothing. Never `all` — that only empties when the gallery does. */
  mode: Exclude<GalleryFilter, 'all'>
  /** How many strips the gallery holds in total, offered as the way back. */
  total: number
  onShowAll: () => void
}

/**
 * A filter that matched nothing.
 *
 * Deliberately not the full empty state: the gallery isn't empty, one pill is, and the
 * fix is a click away rather than a trip to the photobooth. So this keeps the toolbar and
 * the meter above it untouched, drops the spine (there are no months to index), and
 * offers the only useful action — go back to everything.
 */
export function FilterEmpty({ mode, total, onShowAll }: FilterEmptyProps) {
  const { t } = useTranslation()
  const label = t(`gallery.mode_${mode}`)

  return (
    <div className={styles.filterEmpty}>
      <div className={styles.stack} aria-hidden="true">
        <span className={styles.ghostSmall} data-tilt="left" />
        <span className={styles.ghostSmall} />
        <span className={styles.ghostSmall} data-tilt="right" />
      </div>

      <div className={styles.copy}>
        <span className={styles.title}>{t('gallery.filterEmptyTitle', { mode: label })}</span>
        <p className={styles.text}>{t('gallery.filterEmptyText', { mode: label })}</p>
      </div>

      <button type="button" className={styles.secondary} onClick={onShowAll}>
        {t('gallery.filterEmptyCta', { count: total })}
      </button>
    </div>
  )
}
