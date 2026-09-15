import { Download, Loader2, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { StoredStrip } from '@/types/stripType'

import { tileDate } from './galleryData'
import styles from './StripTile.module.scss'

interface StripTileProps {
  strip: StoredStrip
  /** True while this strip's clean file is being fetched. */
  busy: boolean
  /**
   * Touch only: this tile's actions are showing because it was tapped. Ignored where the
   * pointer can hover, which reveals them on its own.
   */
  active: boolean
  onToggleActive: (id: string) => void
  onDownload: (strip: StoredStrip) => void
}

/**
 * One strip in the contact sheet: the image at its own true proportion — 1:3 for a
 * stacked strip, 2:3 for a grid template like green-red — a mode badge and a date
 * beneath, and Download on the image itself.
 *
 * The action lives *on* the tile — revealed by hovering it, or by tapping it on touch —
 * rather than in a row of buttons under it. That is what buys the density: a screen shows
 * a couple of dozen strips instead of four, which is the whole point once someone has a
 * hundred of them.
 *
 * Download is the only thing offered. A gallery strip has been paid for, so there is no
 * remove here — nothing on this page destroys something the user bought.
 */
export function StripTile({ strip, busy, active, onToggleActive, onDownload }: StripTileProps) {
  const { t, i18n } = useTranslation()
  const date = tileDate(strip, i18n.language)
  // Strips saved before the mode was recorded have none; they get the solo badge, which
  // is what an unlabelled strip has always shown.
  const mode = strip.sessionMode ?? 'solo'
  const stripAspect = strip.width && strip.height ? `${strip.width} / ${strip.height}` : null

  return (
    <div className={styles.tile}>
      {/* Templates don't share one shape, so the well takes the stored strip's own
          aspect rather than assuming 1:3 and cover-cropping a wider one to ribbons. */}
      <div
        className={styles.frame}
        data-active={active || undefined}
        style={stripAspect ? { aspectRatio: stripAspect } : undefined}
      >
        <img
          src={strip.thumbnailUrl}
          alt={t('gallery.stripAlt', { date: date.full })}
          loading="lazy"
          decoding="async"
          className={styles.image}
        />

        {/* Touch's stand-in for hover: a full-bleed target that reveals this tile's
            action. Hidden where the pointer can hover, so a desktop click never pins an
            overlay the mouse was about to dismiss anyway. */}
        <button
          type="button"
          className={styles.revealSurface}
          aria-expanded={active}
          aria-label={t('gallery.tileActions')}
          onClick={() => onToggleActive(strip.id)}
        />

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionPrimary}
            title={t('gallery.downloadStrip')}
            aria-label={t('gallery.downloadStrip')}
            disabled={busy}
            onClick={() => onDownload(strip)}
          >
            {busy ? <Loader2 className={styles.actionSpinner} /> : <Download />}
          </button>
        </div>
      </div>

      <div className={styles.meta}>
        {/* The badge carries the session mode and nothing else — it is what the Solo/Date
            filter dots refer to, so a "today" state here would cost the tile the one
            piece of information the caption exists for. */}
        <span
          className={cn(
            styles.badge,
            mode === 'date' && styles.badgeDate,
            mode === 'group' && styles.badgeGroup,
            mode === 'solo' && styles.badgeSolo
          )}
        >
          {t(`gallery.badge_${mode}`)}
        </span>
        <span className={styles.date}>
          <span className={styles.dateFull}>{date.full}</span>
          <span className={styles.dateDay}>{date.day}</span>
        </span>
      </div>
    </div>
  )
}

/**
 * The placeholder for a strip the gallery had no room for.
 *
 * It sits at the front of the newest month rather than in a banner of its own, so the
 * problem and its fix — "remove one of these" — are in the same line of sight as the
 * strips the user would remove.
 */
export function LockedTile() {
  const { t } = useTranslation()
  return (
    <div className={styles.tile}>
      <div className={styles.lockedFrame}>
        <span className={styles.lockedIcon} aria-hidden="true">
          <Lock />
        </span>
        <span className={styles.lockedTitle}>{t('gallery.notAdded')}</span>
        <span className={styles.lockedReason}>{t('gallery.notAddedReason')}</span>
      </div>
      <div className={styles.meta}>
        <span className={cn(styles.badge, styles.badgeDate)}>{t('gallery.badgeToday')}</span>
      </div>
    </div>
  )
}
