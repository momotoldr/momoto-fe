import { useTranslation } from 'react-i18next'

import styles from './PrivacyPage.module.scss'

/** Ordered policy sections — each maps to `privacy.sections.<key>.{title,body}` copy. */
const SECTION_KEYS = [
  'collect',
  'accounts',
  'media',
  'storage',
  'usage',
  'sharing',
  'retention',
  'children',
  'changes',
  'contact',
]

/** Privacy Policy — static legal page */
export function PrivacyPage() {
  const { t } = useTranslation()

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t('privacy.title')}</h1>
        <p className={styles.updated}>{t('privacy.lastUpdated')}</p>
        <p className={styles.intro}>{t('privacy.intro')}</p>
      </header>

      <div className={styles.sections}>
        {SECTION_KEYS.map((key, index) => {
          const body = t(`privacy.sections.${key}.body`, { returnObjects: true }) as string[]
          return (
            <section key={key} className={styles.section} aria-labelledby={`privacy-${key}`}>
              <h2 id={`privacy-${key}`} className={styles.sectionTitle}>
                {index + 1}. {t(`privacy.sections.${key}.title`)}
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
