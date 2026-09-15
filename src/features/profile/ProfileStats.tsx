import { Calendar, Camera, Heart } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import styles from './ProfileStats.module.scss'

interface ProfileStatsProps {
  /** Unlocked strips — what the gallery holds. */
  galleryCount: number
  /** Of those, the ones made in a date session. */
  dateCount: number
  /** Whole months since the account was opened. */
  months: number
  /** When the account was opened, already formatted for the caption. */
  since: string
}

/**
 * Three counters under the hero.
 *
 * They exist to make the profile a record of use rather than a settings screen: how much
 * is in the gallery, how much of it was made together, and how long the account has been
 * running. Captions are short and uppercase so the numbers carry the row.
 */
export function ProfileStats({ galleryCount, dateCount, months, since }: ProfileStatsProps) {
  const { t } = useTranslation()

  const cells = [
    {
      key: 'strips',
      Icon: Camera,
      value: String(galleryCount),
      label: t('auth.profile.stats.strips'),
      short: t('auth.profile.stats.stripsShort'),
    },
    {
      key: 'date',
      Icon: Heart,
      value: String(dateCount),
      label: t('auth.profile.stats.date'),
      short: t('auth.profile.stats.dateShort'),
    },
    {
      key: 'age',
      Icon: Calendar,
      // Zero months is a real state on a fresh account, and "0 months" reads as broken.
      value:
        months > 0
          ? t('auth.profile.stats.months', { count: months })
          : t('auth.profile.stats.thisMonth'),
      label: t('auth.profile.stats.since', { date: since }),
      short: t('auth.profile.stats.activeShort'),
    },
  ]

  return (
    <div className={styles.row}>
      {cells.map(({ key, Icon, value, label, short }) => (
        <div key={key} className={styles.cell}>
          <span className={styles.icon} aria-hidden="true">
            <Icon className={styles.iconGlyph} />
          </span>
          <div className={styles.text}>
            <span className={styles.value}>{value}</span>
            {/* The full caption is too long for a third of a 390px screen, so the phone
             * gets the short one. Both are rendered and one is hidden, which keeps the
             * cell's width driven by the value rather than by a media query. */}
            <span className={styles.label}>{label}</span>
            <span className={styles.labelShort}>{short}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
