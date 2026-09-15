import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { GalleryYear } from './galleryData'
import styles from './MonthSpine.module.scss'

interface MonthSpineProps {
  years: GalleryYear[]
  /** Month key currently in view, highlighted in the list. */
  activeKey: string | null
  onJump: (key: string) => void
}

/**
 * The desktop jump-to rail: every month the gallery holds, with its count, sticky beside
 * the sheet.
 *
 * Once time is the index, this is the index's table of contents — the thing that turns
 * "scroll until I recognise it" into one click. It lists months rather than paginating
 * because the set is small and bounded: a year of heavy use is twelve rows.
 */
export function MonthSpine({ years, activeKey, onJump }: MonthSpineProps) {
  const { t } = useTranslation()

  return (
    <nav className={styles.spine} aria-label={t('gallery.jumpTo')}>
      <span className={styles.label}>{t('gallery.jumpTo')}</span>
      <div className={styles.years}>
        {years.map((year) => (
          <div key={year.year} className={styles.year}>
            <span className={styles.yearLabel}>{year.year}</span>
            <div className={styles.months}>
              {year.months.map((month) => {
                const active = month.key === activeKey
                return (
                  <button
                    key={month.key}
                    type="button"
                    className={cn(styles.month, active && styles.monthActive)}
                    aria-current={active ? 'true' : undefined}
                    aria-label={t('gallery.jumpToMonth', { month: month.label })}
                    onClick={() => onJump(month.key)}
                  >
                    <span className={styles.monthName}>{month.shortLabel}</span>
                    <span className={styles.monthCount}>{month.strips.length}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
