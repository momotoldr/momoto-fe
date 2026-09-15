import { ChevronDown, LifeBuoy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { openSupportDialog } from '@/components/common/SupportFab/openSupport'
import { Button } from '@/components/ui/button'

import styles from './HelpCenterPage.module.scss'

/** The questions, in the order they get asked. Copy lives at `help.items.<key>.{q,a}`. */
const FAQ_KEYS = ['install', 'free', 'print', 'friend', 'privacy', 'need']

/**
 * The Help Center — the FAQ that used to sit at the bottom of the landing page.
 *
 * It moved because a visitor scrolling the landing page is deciding whether to try the
 * booth, not troubleshooting it; the questions are what someone comes looking for
 * *after* something confused them, and a page they can be linked to answers that better
 * than a section they have to scroll past. The landing page now spends that space on
 * the live counters instead.
 *
 * Reached from the footer, and public on purpose: half these answers ("do I need an
 * app?", "is it free?") are for people who don't have an account yet, so putting the
 * way in behind a sign-in would hide it from the readers who need it most.
 */
export function HelpCenterPage() {
  const { t } = useTranslation()

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

      <div className={styles.faqList}>
        {FAQ_KEYS.map((key) => (
          <details key={key} className={styles.faqItem}>
            <summary className={styles.faqQuestion}>
              <span>{t(`help.items.${key}.q`)}</span>
              <ChevronDown className={styles.faqIcon} />
            </summary>
            <p className={styles.faqAnswer}>{t(`help.items.${key}.a`)}</p>
          </details>
        ))}
      </div>

      <section className={styles.contact}>
        <div className={styles.contactText}>
          <h2 className={styles.contactTitle}>{t('help.contactTitle')}</h2>
          <p className={styles.contactHint}>{t('help.contactHint')}</p>
        </div>
        {/* Opens the same dialog as the floating button in the corner — a page about
         * getting unstuck shouldn't ask the reader to go find a bubble. */}
        <Button onClick={openSupportDialog}>{t('support.open')}</Button>
      </section>
    </main>
  )
}
