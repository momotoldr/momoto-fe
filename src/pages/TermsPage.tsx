import { useTranslation } from 'react-i18next'

import styles from './TermsPage.module.scss'

/** Ordered T&C sections — each maps to `terms.sections.<key>.{title,body}` copy. */
const SECTION_KEYS = [
  'service',
  'eligibility',
  'accounts',
  'content',
  'payments',
  'acceptableUse',
  'availability',
  'liability',
  'governingLaw',
  'contact',
]

/** Terms & Conditions — static legal page */
export function TermsPage() {
  const { t } = useTranslation()

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t('terms.title')}</h1>
        <p className={styles.updated}>{t('terms.lastUpdated')}</p>
        <p className={styles.intro}>{t('terms.intro')}</p>
      </header>

      <div className={styles.sections}>
        {SECTION_KEYS.map((key, index) => {
          const body = t(`terms.sections.${key}.body`, { returnObjects: true }) as string[]
          return (
            <section key={key} className={styles.section} aria-labelledby={`terms-${key}`}>
              <h2 id={`terms-${key}`} className={styles.sectionTitle}>
                {index + 1}. {t(`terms.sections.${key}.title`)}
              </h2>
              {body.map((paragraph, i) => (
                <p key={i} className={styles.paragraph}>
                  {paragraph}
                </p>
              ))}
            </section>
          )
        })}
      </div>
    </main>
  )
}
