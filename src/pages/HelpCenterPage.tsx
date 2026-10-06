import {
  Camera,
  ChevronDown,
  CircleHelp,
  Images,
  LifeBuoy,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { useTrackPageView } from '@/analytics'
import { openSupportDialog } from '@/components/common/SupportFab/openSupport'
import { Button } from '@/components/ui/button'
import { SUPPORT_TOPICS } from '@/constants/feedback'
import { HELP_CATEGORIES, HELP_FAQ_KEYS } from '@/constants/help'
import type { SupportTopic } from '@/types/feedbackType'

import styles from './HelpCenterPage.module.scss'

const CATEGORY_ICONS: Record<SupportTopic, LucideIcon> = {
  session: Camera,
  strip: Images,
  payment: Wallet,
  account: UserRound,
  other: CircleHelp,
}

const PANEL_ID = 'help-category-panel'

/** The open category, read off the URL hash (`/help#payment`), or null for none. */
function topicFromHash(hash: string): SupportTopic | null {
  const key = hash.replace(/^#/, '')
  return (SUPPORT_TOPICS as readonly string[]).includes(key) ? (key as SupportTopic) : null
}

/**
 * The Help Center: troubleshooting by category, then the FAQ, then a way to reach us.
 *
 * The categories are the support dialog's topics on purpose. Someone who reads "Payment
 * & unlocking" here and still needs a hand gets a contact button that opens the dialog
 * already set to that topic — the triage they did by picking a card isn't thrown away.
 *
 * The open category lives in the URL hash rather than component state, so a page can
 * link straight to one (`/help#account`) and the back button closes it.
 *
 * Public on purpose: half the FAQ ("do I need an app?", "is it free?") is for people
 * who don't have an account yet, and the sign-in category is for people who can't get
 * into theirs.
 */
export function HelpCenterPage() {
  useTrackPageView()
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const panelRef = useRef<HTMLElement>(null)

  const active = topicFromHash(location.hash)

  const select = (topic: SupportTopic) => {
    // A second tap on the open card closes it again.
    navigate({ hash: active === topic ? '' : topic }, { replace: true })
  }

  // Bring the answers into view: on a phone the panel opens below a screenful of cards.
  useEffect(() => {
    if (active) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [active])

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <span className={styles.badge}>
          <LifeBuoy className={styles.badgeIcon} />
          {t('help.badge')}
        </span>
        <h1 className={styles.title}>{t('help.title')}</h1>
        <p className={styles.intro}>{t('help.intro')}</p>
      </header>

      <section className={styles.section} aria-labelledby="help-categories-title">
        <h2 id="help-categories-title" className={styles.sectionTitle}>
          {t('help.categoriesTitle')}
        </h2>
        <div className={styles.categoryGrid}>
          {SUPPORT_TOPICS.map((topic) => {
            const Icon = CATEGORY_ICONS[topic]
            const isActive = active === topic
            return (
              <button
                key={topic}
                type="button"
                className={styles.categoryCard}
                data-active={isActive || undefined}
                aria-expanded={isActive}
                aria-controls={PANEL_ID}
                onClick={() => select(topic)}
              >
                <span className={styles.categoryIcon}>
                  <Icon />
                </span>
                <span className={styles.categoryText}>
                  <span className={styles.categoryLabel}>{t(`support.topics.${topic}.label`)}</span>
                  <span className={styles.categoryHint}>{t(`support.topics.${topic}.hint`)}</span>
                </span>
              </button>
            )
          })}
        </div>

        {active ? <CategoryPanel key={active} panelRef={panelRef} topic={active} /> : null}
      </section>

      <section className={styles.faqCard} aria-labelledby="help-faq-title">
        <div className={styles.faqHead}>
          <h2 id="help-faq-title" className={styles.sectionTitle}>
            {t('help.faqTitle')}
          </h2>
          <p className={styles.faqHint}>{t('help.faqHint')}</p>
        </div>
        <div className={styles.faqList}>
          {HELP_FAQ_KEYS.map((key) => (
            <details key={key} className={styles.faqItem}>
              <summary className={styles.faqQuestion}>
                <span>{t(`help.items.${key}.q`)}</span>
                <ChevronDown className={styles.faqIcon} />
              </summary>
              <p className={styles.faqAnswer}>{t(`help.items.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.contact}>
        <div className={styles.contactText}>
          <h2 className={styles.contactTitle}>{t('help.contactTitle')}</h2>
          <p className={styles.contactHint}>{t('help.contactHint')}</p>
        </div>
        {/* Opens the same dialog as the floating button in the corner — a page about
         * getting unstuck shouldn't ask the reader to go find a bubble. */}
        <Button onClick={() => openSupportDialog()}>{t('support.open')}</Button>
      </section>
    </main>
  )
}

interface CategoryPanelProps {
  topic: SupportTopic
  panelRef: Ref<HTMLElement>
}

/** One category opened up: what it covers, its common issues, and a topic-preset contact. */
function CategoryPanel({ topic, panelRef }: CategoryPanelProps) {
  const { t } = useTranslation()
  const Icon = CATEGORY_ICONS[topic]
  const issues = HELP_CATEGORIES[topic].filter((issue) => issue.shown !== false)
  const base = `help.categories.${topic}`

  return (
    <section
      ref={panelRef}
      id={PANEL_ID}
      className={styles.panel}
      aria-labelledby="help-category-title"
    >
      <header className={styles.panelHead}>
        <span className={styles.panelIcon}>
          <Icon />
        </span>
        <div className={styles.panelText}>
          <h3 id="help-category-title" className={styles.panelTitle}>
            {t(`support.topics.${topic}.label`)}
          </h3>
          <p className={styles.panelSummary}>{t(`${base}.summary`)}</p>
        </div>
      </header>

      <div className={styles.issueList}>
        {issues.map(({ key }) => {
          const steps = t(`${base}.issues.${key}.steps`, {
            returnObjects: true,
            defaultValue: [],
          }) as string[]
          return (
            <details key={key} className={styles.issue}>
              <summary className={styles.issueQuestion}>
                <span>{t(`${base}.issues.${key}.q`)}</span>
                <ChevronDown className={styles.faqIcon} />
              </summary>
              <div className={styles.issueBody}>
                <p>{t(`${base}.issues.${key}.a`)}</p>
                {steps.length > 0 ? (
                  <ol className={styles.steps}>
                    {steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                ) : null}
              </div>
            </details>
          )
        })}
      </div>

      <footer className={styles.panelFoot}>
        <p className={styles.panelFootText}>{t('help.panelContact')}</p>
        <Button variant="outline" onClick={() => openSupportDialog(topic)}>
          {t('support.open')}
        </Button>
      </footer>
    </section>
  )
}
