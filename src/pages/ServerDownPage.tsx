import { CloudOff, ServerOff, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { pingServer } from '@/api/services/healthService'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { useNetworkStore } from '@/store/useNetworkStore'
import { useServerStore } from '@/store/useServerStore'
import { safeRedirectPath } from '@/utils/common'

import styles from './ServerDownPage.module.scss'

const POLL_INTERVAL_MS = 5000

/**
 * Shown when a server-dependent route can't reach the backend. Retries + auto-polls,
 * then returns on recovery.
 *
 * Covers three different failures with one page, because from here they need the same
 * thing from the user (wait, then come back) and differ only in what to blame — which
 * is the whole point, since blaming the wrong side sends someone to fix something that
 * isn't broken. The device is offline: say so, rather than telling someone in a tunnel
 * that our server is having trouble. The probe got a bad answer out of the server: that
 * is a real outage and we own it. Nothing came back at all: we genuinely cannot tell
 * which it is, so the page says that and points at the connection as a possibility
 * without asserting it.
 */
export function ServerDownPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const serverStatus = useServerStore((s) => s.status)
  const online = useNetworkStore((s) => s.online)
  const [checking, setChecking] = useState(false)

  // Never navigate straight to an attacker-supplied value — see `safeRedirectPath`.
  const redirectTarget = safeRedirectPath(params.get('redirect'), ROUTES.home)

  // Leave the moment the server answers again (from the poll, a retry, or any other
  // successful request elsewhere).
  useEffect(() => {
    if (serverStatus === 'up') navigate(redirectTarget, { replace: true })
  }, [serverStatus, redirectTarget, navigate])

  // Light background poll so recovery is picked up without user action. Suspended
  // while the device is offline: every ping is guaranteed to fail, and the browser's
  // `online` event (see `NetworkWatcher`) already probes the moment that changes.
  useEffect(() => {
    if (!online) return
    const id = window.setInterval(() => void pingServer(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [online])

  const onRetry = async () => {
    setChecking(true)
    // The user may have just fixed their connection; no event fires for that on a tab
    // that never lost the page, so re-read the browser's flag before probing.
    if (useNetworkStore.getState().refresh()) await pingServer()
    setChecking(false)
  }

  const view = !online
    ? {
        icon: <WifiOff className="h-8 w-8" />,
        title: 'network.offlineTitle',
        message: 'network.offlinePage',
      }
    : serverStatus === 'down'
      ? {
          icon: <ServerOff className="h-8 w-8" />,
          title: 'serverDown.title',
          message: 'serverDown.message',
        }
      : {
          icon: <CloudOff className="h-8 w-8" />,
          title: 'serverDown.unknownTitle',
          message: 'serverDown.unknownMessage',
        }

  return (
    <main className={styles.page}>
      <span className={styles.icon} aria-hidden="true">
        {view.icon}
      </span>

      <div className={styles.text}>
        <h1 className={styles.title}>{t(view.title)}</h1>
        <p className={styles.message}>{t(view.message)}</p>
      </div>

      <div className={styles.actions}>
        <Button size="lg" disabled={checking} onClick={() => void onRetry()}>
          {checking ? t('serverDown.retrying') : t('serverDown.retry')}
        </Button>
        <Link className={styles.hint} to={ROUTES.home}>
          {t('serverDown.backHome')}
        </Link>
      </div>
    </main>
  )
}
