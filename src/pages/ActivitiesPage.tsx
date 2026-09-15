import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { ACTIVITIES } from '@/constants/activities'

import styles from './ActivitiesPage.module.scss'

/** Modes an activity can be played in, in order. Copy is read from
 * `activities.modes.<mode>`. Keyed by the activity `key` from `ACTIVITIES` so the
 * chips follow whichever activity is live rather than being hard-wired to the booth;
 * an activity with no entry here simply renders no chips. */
const ACTIVITY_MODES: Record<string, string[]> = {
  photobooth: ['solo', 'date', 'group'],
}

/* ---- Strip preview ----
 *
 * Two miniature strips taped beside the live card. The cells are colour placeholders
 * standing in for real strip screenshots, so the whole preview is decorative and is
 * hidden from assistive tech by the `aria-hidden` on its container. */

/** Single-frame strip: one photo per cell. */
const SOLO_CELLS = [styles.tonePink, styles.toneBlue, styles.toneAmber, styles.toneMint]

/** Two-up strip — each cell is split down the middle, one half per person. */
const DATE_CELLS = [
  styles.splitPinkMint,
  styles.splitAmberBlue,
  styles.splitMintPink,
  styles.splitBluePeach,
]

/** Full listing of Momoto activities (menus), laid out as a pinboard in the same
 * language as the landing redesign: taped paper, tape as the labelling system, slate
 * ink. The one live activity is a full-width taped card carrying its own strip
 * preview; the rest are dashed notes pinned below. */
export function ActivitiesPage() {
  const { t } = useTranslation()

  // Which card is which is read from ACTIVITIES rather than fixed here, so the page
  // stays honest when the next activity goes live.
  const live = ACTIVITIES.find((activity) => activity.available && activity.to)
  const comingSoon = ACTIVITIES.filter((activity) => !activity.available)
  const liveCount = ACTIVITIES.filter((activity) => activity.available).length
  const modes = live ? (ACTIVITY_MODES[live.key] ?? []) : []

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <h1 className={styles.title}>{t('activities.title')}</h1>
            <p className={styles.subtitle}>{t('activities.subtitle')}</p>
          </div>

          <div className={styles.counts}>
            <span className={styles.count}>
              <span className={styles.countNumber}>{liveCount}</span>
              <span className={styles.countLabel}>{t('activities.live')}</span>
            </span>
            <span className={styles.countRule} aria-hidden="true" />
            <span className={styles.count}>
              <span className={styles.countNumber}>{comingSoon.length}</span>
              <span className={styles.countLabel}>{t('activities.comingSoon')}</span>
            </span>
          </div>
        </div>
      </section>

      <div className={styles.body}>
        {live?.to && (
          <Link to={live.to} className={styles.liveCard}>
            <span className={styles.tapeGrey} aria-hidden="true" />
            <span className={styles.tapeLive}>{t('activities.live')}</span>

            <div className={styles.liveText}>
              <div className={styles.liveHead}>
                <span className={styles.liveIcon} aria-hidden="true">
                  <live.Icon />
                </span>
                <h2 className={styles.liveTitle}>{t(`activities.items.${live.key}.title`)}</h2>
              </div>
              <p className={styles.liveDesc}>{t(`activities.items.${live.key}.desc`)}</p>

              {modes.length > 0 && (
                <div className={styles.modes}>
                  {modes.map((mode) => (
                    <span key={mode} className={styles.mode}>
                      {t(`activities.modes.${mode}`)}
                    </span>
                  ))}
                </div>
              )}

              <span className={styles.pillDark}>
                {t('activities.open')}
                <ArrowRight className={styles.pillIcon} />
              </span>
            </div>

            <div className={styles.preview} aria-hidden="true">
              <span className={styles.stripSolo}>
                {SOLO_CELLS.map((tone, index) => (
                  <span key={index} className={`${styles.cell} ${tone}`} />
                ))}
              </span>
              <span className={styles.stripDate}>
                {DATE_CELLS.map((split, index) => (
                  <span key={index} className={`${styles.cell} ${split}`} />
                ))}
              </span>
              {/* Painted as a CSS background rather than an <img>: the preview is
               * `display:none` below lg, and a background inside a hidden subtree is
               * never fetched — so phones don't pay for the sticker. */}
              <span className={styles.stickerSparkle} />
            </div>
          </Link>
        )}

        {comingSoon.length > 0 && (
          <section className={styles.soon} aria-labelledby="soon-heading">
            <h2 id="soon-heading" className={styles.soonLabel}>
              {t('activities.comingSoon')}
            </h2>
            <ul className={styles.soonGrid}>
              {comingSoon.map(({ key, Icon }) => (
                <li key={key} className={styles.soonCard}>
                  <span className={styles.soonTape} aria-hidden="true" />
                  <span className={styles.soonIcon} aria-hidden="true">
                    <Icon />
                  </span>
                  <h3 className={styles.soonTitle}>{t(`activities.items.${key}.title`)}</h3>
                  <p className={styles.soonText}>{t(`activities.items.${key}.desc`)}</p>
                  {/* Repeats the section heading on desktop, where the three notes sit
                   * side by side and the heading is far from the last one. */}
                  <span className={styles.soonNote} aria-hidden="true">
                    {t('activities.comingSoon')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
