import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'

import styles from './NotFoundPage.module.scss'

/**
 * Shown for any URL that matches no route. Registered as the catch-all *child* of the
 * root route, so it keeps the app bar and footer — a wrong URL should still feel like
 * being inside Momoto, with a way out.
 */
export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <main className={styles.page}>
      <span className={styles.icon} aria-hidden="true">
        <SearchX className="h-8 w-8" />
      </span>

      <div className={styles.text}>
        <p className={styles.code}>{t('notFound.code')}</p>
        <h1 className={styles.title}>{t('notFound.title')}</h1>
        <p className={styles.message}>{t('notFound.message')}</p>
      </div>

      <div className={styles.actions}>
        <Button size="lg" asChild>
          <Link to={ROUTES.home}>{t('notFound.backHome')}</Link>
        </Button>
        <Link className={styles.hint} to={ROUTES.activities}>
          {t('notFound.browseActivities')}
        </Link>
      </div>
    </main>
  )
}
