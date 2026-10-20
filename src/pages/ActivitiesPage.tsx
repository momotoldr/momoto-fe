import { ArrowRight, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useTrackPageView } from '@/analytics'
import { ACTIVITIES } from '@/constants/activities'

import styles from './ActivitiesPage.module.scss'

/** Modes an activity can be played in, in order. Copy is read from
 * `activities.modes.<mode>`. Keyed by the activity `key` from `ACTIVITIES` so the
 * chips follow whichever activity is live rather than being hard-wired to the booth;
 * an activity with no entry here simply renders no chips. */
const ACTIVITY_MODES: Record<string, string[]> = {
  photobooth: ['solo', 'date', 'group'],
  scrapbook: ['solo'],
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

/** Two strips taped beside the booth's card. */
function StripPreview() {
  return (
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
  )
}

/** An open scrapbook beside its card: a strip taped on one page, a note on the other. */
function BookPreview() {
  return (
    <div className={styles.preview} aria-hidden="true">
      <span className={styles.book}>
        <span className={styles.bookPage}>
          <span className={styles.bookStrip}>
            {SOLO_CELLS.map((tone, index) => (
              <span key={index} className={`${styles.cell} ${tone}`} />
            ))}
          </span>
        </span>
        <span className={`${styles.bookPage} ${styles.bookPageRight}`}>
          <span className={styles.bookHeading} />
          <span className={styles.bookNote}>
            <span />
            <span />
            <span />
            <span />
          </span>
        </span>
      </span>
    </div>
  )
}

/** Each live activity's preview, by `ACTIVITIES` key. */
const PREVIEWS: Record<string, () => JSX.Element> = {
  photobooth: StripPreview,
  scrapbook: BookPreview,
}

/** Full listing of Momoto activities (menus), laid out as a pinboard in the same
 * language as the landing redesign: taped paper, tape as the labelling system, slate
 * ink. Each live activity is a full-width taped card carrying its own preview; a single
 * dashed note pinned below says more are on the way. */
export function ActivitiesPage() {
  useTrackPageView()
  const { t } = useTranslation()

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
              <span className={styles.countNumber}>{ACTIVITIES.length}</span>
              <span className={styles.countLabel}>{t('activities.live')}</span>
            </span>
          </div>
        </div>
      </section>

      <div className={styles.body}>
        {ACTIVITIES.map((activity, index) => {
          const modes = ACTIVITY_MODES[activity.key] ?? []
          const Preview = PREVIEWS[activity.key]
          return (
            <Link
              key={activity.key}
              to={activity.to}
              className={`${styles.liveCard} ${index % 2 === 1 ? styles.liveCardAlt : ''}`}
            >
              <span className={styles.tapeGrey} aria-hidden="true" />
              <span className={styles.tapeLive}>{t('activities.live')}</span>

              <div className={styles.liveText}>
                <div className={styles.liveHead}>
                  <span className={styles.liveIcon} aria-hidden="true">
                    <activity.Icon />
                  </span>
                  <h2 className={styles.liveTitle}>
                    {t(`activities.items.${activity.key}.title`)}
                  </h2>
                </div>
                <p className={styles.liveDesc}>{t(`activities.items.${activity.key}.desc`)}</p>

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
                  {t(`activities.items.${activity.key}.open`, {
                    defaultValue: t('activities.open'),
                  })}
                  <ArrowRight className={styles.pillIcon} />
                </span>
              </div>

              {Preview && <Preview />}
            </Link>
          )
        })}

        <div className={styles.soonCard}>
          <span className={styles.soonTape} aria-hidden="true" />
          <span className={styles.soonIcon} aria-hidden="true">
            <Sparkles />
          </span>
          <div className={styles.soonBody}>
            <h2 className={styles.soonTitle}>{t('activities.more.title')}</h2>
            <p className={styles.soonText}>{t('activities.more.desc')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
