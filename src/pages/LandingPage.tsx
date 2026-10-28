import { ArrowRight, ChevronDown, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { TRACK_IDS, trackClick, useTrackPageView } from '@/analytics'
import { LandingStats } from '@/components/landing/LandingStats'
import { LandingTestimonials } from '@/components/landing/LandingTestimonials'
import { ACTIVITIES } from '@/constants/activities'
import { ROUTES } from '@/constants/routes'
import { PromoChip } from '@/features/promos/PromoChip'
import { useActivityPromos } from '@/features/promos/promoState'

import styles from './LandingPage.module.scss'

/** "How it works" step keys per activity, in order. Copy is read from
 * `landing.steps.<activity>.<step>.{title,desc}`; the steps are numbered rather than
 * illustrated, so unlike the previous pass there are no per-step icons. Keyed by the
 * activity `key` from `ACTIVITIES`, so the tabs and their steps stay in sync. */
const ACTIVITY_STEPS: Record<string, string[]> = {
  photobooth: ['pick', 'pose', 'share'],
  scrapbook: ['fill', 'write', 'keep'],
}

/* ---- Hero collage ----
 *
 * Three photo strips taped to the hero at angles. The cells are colour placeholders
 * standing in for real strip screenshots, so the whole collage is decorative and is
 * hidden from assistive tech by the `aria-hidden` on its container. */

/** Cell fills, as class names on the module. Indexed by the arrays below. */
const TONES: Record<string, string> = {
  pink: styles.tonePink,
  blue: styles.toneBlue,
  amber: styles.toneAmber,
  mint: styles.toneMint,
  purple: styles.tonePurple,
  sky: styles.toneSky,
  sun: styles.toneSun,
  peach: styles.tonePeach,
}

/** Single-frame strip: one photo per cell. */
const SOLO_CELLS = ['pink', 'blue', 'amber', 'mint']

/** Two-up strip — each cell is split down the middle, one half per person. */
const DATE_CELLS = [
  styles.splitPinkMint,
  styles.splitAmberBlue,
  styles.splitMintPink,
  styles.splitBluePeach,
]

/** Group strip: every frame is a 2x2 of four faces. */
const GROUP_FRAMES = [
  ['purple', 'pink', 'sky', 'sun'],
  ['peach', 'mint', 'purple', 'blue'],
  ['sky', 'amber', 'pink', 'mint'],
  ['sun', 'blue', 'peach', 'purple'],
]

/** Momoto platform landing — the flagship Photobooth plus what's coming next.
 *
 * The page is laid out as a pinboard: strips and cards taped down at slight angles,
 * with tape doing the labelling. Only the structure is new — the palette, the hero
 * gradient and every string are the ones the app already had. */
export function LandingPage() {
  useTrackPageView()
  const { t } = useTranslation()
  const [activeHow, setActiveHow] = useState(ACTIVITIES[0].key)
  const steps = ACTIVITY_STEPS[activeHow] ?? []
  // The promo chip on each activity card (docs/PLAN-promos.md), as on /activities.
  const activityPromo = useActivityPromos()

  /** The activity picker is a tab row on desktop and a dropdown on phones, where four
   * tabs would either wrap or scroll out of sight. Both render; CSS shows one. */
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCard}>
            <span className={styles.tapeGrey} aria-hidden="true" />
            <span className={styles.tapePink} aria-hidden="true" />

            <span className={styles.badge}>
              <Sparkles className={styles.badgeIcon} />
              {t('landing.badge')}
            </span>
            <h1 className={styles.title}>{t('landing.heroTitle')}</h1>
            <p className={styles.subtitle}>{t('landing.heroSubtitle')}</p>
            <div className={styles.heroActions}>
              <Link
                to={ROUTES.photobooth}
                className={styles.pillDark}
                onClick={() => trackClick(TRACK_IDS.LANDING_HERO_OPEN_PHOTOBOOTH, 'a')}
              >
                {t('landing.ctaSecondary')}
                <ArrowRight className={styles.pillIcon} />
              </Link>
              <Link to={ROUTES.activities} className={styles.quietLink}>
                {t('landing.ctaPrimary')}
              </Link>
            </div>
          </div>

          <div className={styles.collage} aria-hidden="true">
            <div className={styles.stripSolo}>
              <span className={styles.stripTapeSolo}>{t('landing.strips.solo')}</span>
              {SOLO_CELLS.map((tone, index) => (
                <span key={index} className={`${styles.cell} ${TONES[tone]}`} />
              ))}
            </div>

            <div className={styles.stripDate}>
              <span className={styles.stripTapeDate}>{t('landing.strips.date')}</span>
              {DATE_CELLS.map((split, index) => (
                <span key={index} className={`${styles.cell} ${split}`} />
              ))}
            </div>

            <div className={styles.stripGroup}>
              <span className={styles.stripTapeGroup}>{t('landing.strips.group')}</span>
              {GROUP_FRAMES.map((quad, index) => (
                <span key={index} className={styles.quadCell}>
                  {quad.map((tone, cell) => (
                    <span key={cell} className={TONES[tone]} />
                  ))}
                </span>
              ))}
            </div>

            {/* Painted as CSS backgrounds rather than <img>: the collage is
             * `display:none` below lg, and a background inside a hidden subtree is
             * never fetched — which keeps the 120KB heart off phones entirely. */}
            <span className={styles.stickerHeart} />
            <span className={styles.stickerSparkle} />
            <span className={styles.stickerStar} />
          </div>
        </div>
      </section>

      <div className={styles.body}>
        <section className={styles.how} aria-labelledby="how-heading">
          <div className={styles.howHead}>
            <h2 id="how-heading" className={styles.howTitle}>
              {t('landing.howTitle')}
            </h2>

            <div className={styles.howTabs} role="tablist" aria-label={t('landing.howTitle')}>
              {ACTIVITIES.map(({ key }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={key === activeHow}
                  className={key === activeHow ? styles.howTabActive : styles.howTab}
                  onClick={() => setActiveHow(key)}
                >
                  {t(`activities.items.${key}.title`)}
                </button>
              ))}
            </div>

            <div className={styles.howMenu} ref={menuRef}>
              <button
                type="button"
                className={styles.howMenuButton}
                aria-expanded={menuOpen}
                aria-haspopup="listbox"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {t(`activities.items.${activeHow}.title`)}
                <ChevronDown className={styles.howMenuIcon} />
              </button>
              {menuOpen && (
                <ul
                  className={styles.howMenuList}
                  role="listbox"
                  aria-label={t('landing.howTitle')}
                >
                  {ACTIVITIES.map(({ key }) => (
                    <li key={key}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={key === activeHow}
                        className={
                          key === activeHow ? styles.howMenuItemActive : styles.howMenuItem
                        }
                        onClick={() => {
                          setActiveHow(key)
                          setMenuOpen(false)
                        }}
                      >
                        {t(`activities.items.${key}.title`)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <ol className={styles.steps}>
            <span className={styles.tapeCentre} aria-hidden="true" />
            {steps.map((key, index) => (
              <li key={key} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <div className={styles.stepBody}>
                  <h3 className={styles.stepTitle}>
                    {t(`landing.steps.${activeHow}.${key}.title`)}
                  </h3>
                  <p className={styles.stepText}>{t(`landing.steps.${activeHow}.${key}.desc`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.menu} aria-labelledby="menu-heading">
          <div className={styles.menuHead}>
            <div className={styles.menuHeadText}>
              <h2 id="menu-heading" className={styles.sectionTitle}>
                {t('landing.menuTitle')}
              </h2>
              {/* "One booth today" stays true only while the booth is the one live activity. */}
              <p className={styles.sectionSubtitle}>
                {t(ACTIVITIES.length > 1 ? 'landing.menuSubtitleMany' : 'landing.menuSubtitle')}
              </p>
            </div>
            <Link to={ROUTES.activities} className={styles.quietLink}>
              {t('landing.browseActivities')}
            </Link>
          </div>

          {/* Every live activity gets its card — not just the first, or a second one is
              neither live nor coming soon here, and simply missing. */}
          {ACTIVITIES.map((activity, index) => (
            <Link
              key={activity.key}
              to={activity.to}
              className={`${styles.liveCard} ${index % 2 === 1 ? styles.liveCardAlt : ''}`}
            >
              <span className={styles.tapeGrey} aria-hidden="true" />
              <span className={styles.tapeLive}>{t('activities.live')}</span>
              <div className={styles.liveText}>
                <h3 className={styles.liveTitle}>{t(`activities.items.${activity.key}.title`)}</h3>
                <p className={styles.liveDesc}>{t(`activities.items.${activity.key}.desc`)}</p>
                {activityPromo[activity.key] && (
                  <PromoChip kind={activityPromo[activity.key]!} placement="landing" />
                )}
              </div>
              <span className={styles.pillDark}>
                {t(`activities.items.${activity.key}.open`, {
                  defaultValue: t('activities.open'),
                })}
                <ArrowRight className={styles.pillIcon} />
              </span>
            </Link>
          ))}

          {/* What's next is one generic note rather than named activities, so nothing is
              promised before it ships. */}
          <div className={styles.soonCard}>
            <span className={styles.soonTape} aria-hidden="true" />
            <span className={styles.soonIcon} aria-hidden="true">
              <Sparkles />
            </span>
            <div className={styles.soonBody}>
              <h3 className={styles.soonTitle}>{t('activities.more.title')}</h3>
              <p className={styles.soonText}>{t('activities.more.desc')}</p>
            </div>
          </div>
        </section>

        <LandingStats />

        <LandingTestimonials />

        <section className={styles.cta}>
          <h2 className={styles.ctaTitle}>{t('landing.ctaBannerTitle')}</h2>
          <Link
            to={ROUTES.photobooth}
            className={styles.pillLight}
            onClick={() => trackClick(TRACK_IDS.LANDING_BANNER_OPEN_PHOTOBOOTH, 'a')}
          >
            {t('landing.ctaSecondary')}
            <ArrowRight className={styles.pillIcon} />
          </Link>
        </section>
      </div>
    </div>
  )
}
