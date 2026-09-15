import { SUPPORTED_LANGUAGES } from '@/constants/i18n'
import { useTranslation } from 'react-i18next'
import styles from './LanguageSwitcher.module.scss'

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const current = i18n.resolvedLanguage ?? i18n.language

  return (
    <div className={styles.root} role="group" aria-label={t('language.label')}>
      {SUPPORTED_LANGUAGES.map((language) => {
        const isActive = current === language
        return (
          <button
            key={language}
            type="button"
            className={isActive ? `${styles.option} ${styles.active}` : styles.option}
            aria-pressed={isActive}
            onClick={() => {
              void i18n.changeLanguage(language)
            }}
          >
            {t(`language.${language}`)}
          </button>
        )
      })}
    </div>
  )
}
