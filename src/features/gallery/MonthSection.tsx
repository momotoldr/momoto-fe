import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { StoredStrip } from '@/types/stripType'

import type { GalleryMonth } from './galleryData'
import styles from './MonthSection.module.scss'
import { LockedTile, StripTile } from './StripTile'

/**
 * How many strips a month shows on a phone before it collapses behind "show more".
 *
 * Desktop shows every strip in the month — the grid is seven wide there and scrolling
 * past a full month costs a flick. On a phone four-wide, a 30-strip month would be eight
 * rows of scrolling before the next heading, which buries the months underneath it.
 */
const MOBILE_PREVIEW_COUNT = 8

interface MonthSectionProps {
  month: GalleryMonth
  /** Strips to render, already filtered — may be fewer than `month.strips`. */
  strips: StoredStrip[]
  /** Touch only: the tile whose actions are showing, if it is in this month. */
  activeTileId: string | null
  busyId: string | null
  expanded: boolean
  /** Show the "didn't fit" placeholder at the head of this month. */
  showLocked: boolean
  onToggleExpanded: (key: string) => void
  onToggleTile: (id: string) => void
  onDownload: (strip: StoredStrip) => void
}

/** One month of the contact sheet: a heading, a dense grid, and a phone-only expander. */
export function MonthSection({
  month,
  strips,
  activeTileId,
  busyId,
  expanded,
  showLocked,
  onToggleExpanded,
  onToggleTile,
  onDownload,
}: MonthSectionProps) {
  const { t } = useTranslation()

  // The collapse is a phone affordance, so it's driven by a class on the grid rather than
  // by slicing the array: desktop keeps every tile in the DOM (and in the spine's counts)
  // no matter what the phone is currently showing.
  //
  // Counted in *tiles*, not strips — the locked placeholder occupies a cell like any
  // other, so leaving it out would make "show 6 more" hide seven.
  const tileCount = strips.length + (showLocked ? 1 : 0)
  const hidden = Math.max(0, tileCount - MOBILE_PREVIEW_COUNT)
  const collapsed = hidden > 0 && !expanded

  return (
    <section id={`gallery-month-${month.key}`} className={styles.section}>
      <header className={styles.head}>
        <h2 className={styles.title}>{month.label}</h2>
        {/* Two labels, switched by breakpoint rather than by `collapsed` alone: the
            collapse is a phone affordance, so desktop must always read "14 strips" even
            while the phone grid is showing eight of them. */}
        <span className={styles.count}>
          {collapsed && (
            <span className={styles.countCollapsed}>
              {t('gallery.monthShown', { total: strips.length, shown: MOBILE_PREVIEW_COUNT })}
            </span>
          )}
          <span className={collapsed ? styles.countFull : undefined}>
            {t('gallery.monthCount', { count: strips.length })}
          </span>
        </span>
      </header>

      <div className={styles.tiles} data-collapsed={collapsed || undefined}>
        {showLocked && <LockedTile />}
        {strips.map((strip) => (
          <StripTile
            key={strip.id}
            strip={strip}
            busy={busyId === strip.id}
            active={activeTileId === strip.id}
            onToggleActive={onToggleTile}
            onDownload={onDownload}
          />
        ))}
      </div>

      {collapsed && (
        <button type="button" className={styles.more} onClick={() => onToggleExpanded(month.key)}>
          {t('gallery.showMore', { count: hidden, month: month.shortLabel })}
          <ChevronDown />
        </button>
      )}
    </section>
  )
}
