import { CloudOff, Loader2, ServerOff, SignalLow, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import { pingServer } from '@/api/services/healthService'
import { ROUTES } from '@/constants/routes'
import { useNetworkStore } from '@/store/useNetworkStore'
import { useServerStore } from '@/store/useServerStore'

import styles from './ConnectionChip.module.scss'

/**
 * A small standing chip in the bottom-left corner whenever the connection isn't
 * behaving: the device is offline, the backend isn't answering, or the link is slow
 * enough to be worth warning about.
 *
 * **Why a chip and not a wall.** Almost all of this app works without a server:
 * capture, filters, composing and downloading a strip are entirely client-side, and a
 * running session holds photos that exist only in that tab. Throwing up a full-page
 * error over a dropped connection would destroy work that was never at risk. Only the
 * handful of routes that genuinely need a backend get bounced, and that's `ServerGate`'s
 * job — this tells everyone else what's going on while they keep working.
 *
 * **Why not a toast.** This describes a live condition with no natural end, and toasts
 * are a queue of things that came and went. Parking a permanent one in the stack would
 * both misuse the convention and crowd out the transient messages the app actually
 * needs to deliver. A chip owns its corner and leaves when the condition does.
 *
 * **Why the slow variant is dismissible and the others aren't.** Offline, down and
 * unknown describe something the user cannot work around, and they clear themselves
 * the moment the condition lifts; a close button would only hide the reason the next
 * save is going to fail. A slow connection is different — the app still works, the
 * person may well already know, and on a bad line the warning could otherwise sit
 * there for an entire session. So that one can be waved off, and comes back if the
 * connection recovers and degrades again.
 *
 * **Why `down` and `unknown` are two messages and not one.** They are the difference
 * between a verdict and a shrug, and only one of them has earned the right to say
 * "this one's on us". Nothing the browser exposes can tell a dead backend from a
 * broken path to a healthy one — `navigator.onLine` stays `true` through a captive
 * portal, a router with a dead uplink and an expired hotspot — so a request that
 * simply got no answer proves nothing about whose fault it is. Asserting an outage
 * there tells someone whose wifi is the problem that their connection looks fine,
 * which sends them off to check our status page instead of their router. Only the
 * health probe getting a real (bad) answer is proof, and only that shows `serverDown`.
 */
export function ConnectionChip() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const online = useNetworkStore((s) => s.online)
  const quality = useNetworkStore((s) => s.quality)
  const serverStatus = useServerStore((s) => s.status)
  const [checking, setChecking] = useState(false)
  const [slowDismissed, setSlowDismissed] = useState(false)

  // Re-arm once the connection is measured healthy again: the next slowdown is new
  // news, not the one they already waved off.
  useEffect(() => {
    if (quality === 'good') setSlowDismissed(false)
  }, [quality])

  const onRetry = async () => {
    setChecking(true)
    // Re-read the browser's own flag first: a retry is often the user telling us they
    // just fixed their wifi, and no event fires for a tab that was already loaded.
    if (useNetworkStore.getState().refresh()) await pingServer()
    setChecking(false)
  }

  // The server-down page is this same message at full size, with its own retry.
  if (pathname === ROUTES.serverUnavailable) return null

  // Most certain news first: being offline explains a failing server too, and telling
  // someone their connection is slow when it's actually gone is just wrong. `unknown`
  // still outranks `slow` — requests failing outright is the bigger problem, and its
  // copy already allows that the link may be the cause.
  const state = !online
    ? 'offline'
    : serverStatus === 'down'
      ? 'serverDown'
      : serverStatus === 'unknown'
        ? 'unknown'
        : quality === 'slow'
          ? 'slow'
          : null
  if (!state) return null
  if (state === 'slow' && slowDismissed) return null

  const copy = {
    offline: { title: 'network.offlineTitle', body: 'network.offlineBody' },
    serverDown: { title: 'network.serverTitle', body: 'network.serverBody' },
    unknown: { title: 'network.unknownTitle', body: 'network.unknownBody' },
    slow: { title: 'network.slowTitle', body: 'network.slowBody' },
  }[state]

  return (
    <div className={styles.chip} role="status" aria-live="polite">
      <span className={styles.icon} aria-hidden="true">
        {state === 'offline' && <WifiOff className={styles.glyph} />}
        {/* A server we know is broken gets the server glyph; one we simply can't get an
            answer out of gets the vaguer cloud, matching what each message claims. */}
        {state === 'serverDown' && <ServerOff className={styles.glyph} />}
        {state === 'unknown' && <CloudOff className={styles.glyph} />}
        {state === 'slow' && <SignalLow className={styles.glyph} />}
      </span>

      <div className={styles.text}>
        <p className={styles.title}>{t(copy.title)}</p>
        <p className={styles.body}>{t(copy.body)}</p>
      </div>

      {/* Retrying a slow connection is meaningless — it's already being measured, and
          the chip leaves on its own when the probes come back clean. */}
      {state === 'slow' ? (
        <button
          type="button"
          className={styles.close}
          onClick={() => setSlowDismissed(true)}
          aria-label={t('common.close')}
        >
          <X className={styles.glyph} />
        </button>
      ) : (
        <button
          type="button"
          className={styles.action}
          disabled={checking}
          onClick={() => void onRetry()}
        >
          {checking && <Loader2 className={styles.spinner} />}
          {checking ? t('network.checking') : t('network.retry')}
        </button>
      )}
    </div>
  )
}
