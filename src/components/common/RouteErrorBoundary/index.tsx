import { RotateCw } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

import { ErrorCard } from '@/components/common/ErrorCard'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { errorMessage, reportError } from '@/lib/reportError'
import { NotFoundPage } from '@/pages/NotFoundPage'

import styles from './RouteErrorBoundary.module.scss'

/**
 * The router's `errorElement`. Necessary because `RouterProvider` catches render errors
 * from route elements itself and does *not* rethrow — so they never reach the
 * provider-level `ErrorBoundary` above it. Without this, any page crash showed React
 * Router's unstyled "Unexpected Application Error!" default.
 *
 * Handles both shapes that arrive here:
 *  - a thrown `ErrorResponse` (e.g. a 404 from a route that matched nothing)
 *  - a real render crash inside a page
 */
export function RouteErrorBoundary() {
  const { t } = useTranslation()
  const error = useRouteError()
  const isNotFound = isRouteErrorResponse(error) && error.status === 404

  // In an effect, not in render: render can run more than once for the same error
  // (StrictMode double-invokes in dev), and reporting is a side effect.
  useEffect(() => {
    if (isNotFound) return
    reportError(error, { source: 'RouteErrorBoundary' })
  }, [error, isNotFound])

  // A 404 isn't a fault — show the normal not-found page rather than a crash card.
  if (isNotFound) return <NotFoundPage />

  // Surface the raw message in dev *and* on staging. In production it's internal detail
  // that means nothing to a user (and can read as alarming), so fall back to the generic
  // copy. Staging is the exception because that is where crashes are hunted on real
  // phones, where there is no console to open — a card that says only "something went
  // wrong" turns a reproducible bug into a guess. `MODE` is set by `--mode staging`, so
  // this is inlined at build time and cannot leak into a production bundle.
  const isStaging = import.meta.env.MODE === 'staging'
  const showDetail = import.meta.env.DEV || isStaging
  // The message alone is often not enough to place a crash — a minified React invariant
  // ("Minified React error #185") names the fault but not where it happened. The first
  // few frames are, with the staging source map, enough to find the line. Phones have no
  // console to open, so what the card shows is the whole report.
  const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 4).join('\n') : undefined
  const detail = showDetail ? [errorMessage(error), stack].filter(Boolean).join('\n') : undefined

  return (
    <ErrorCard title={t('errors.somethingWrong')} message={detail || t('errors.unexpected')}>
      <Button onClick={() => window.location.reload()}>
        <RotateCw size={16} />
        {t('errors.refresh')}
      </Button>
      {/* A hard href, not a <Link> — the router is in an error state, so navigating
          within it may just re-throw. A full document load resets everything. */}
      <a className={styles.homeLink} href={ROUTES.home}>
        {t('errors.backHome')}
      </a>
    </ErrorCard>
  )
}

export default RouteErrorBoundary
