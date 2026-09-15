import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { probeServer } from '@/api/services/healthService'
import { notifySuccess } from '@/lib/notify'
import { useNetworkStore } from '@/store/useNetworkStore'
import { useServerStore } from '@/store/useServerStore'

/**
 * A health probe slower than this means the link is struggling. `/healthz` is a few
 * bytes and does no work, so its round trip is close to pure network cost — on any
 * ordinary connection it lands in the low hundreds of ms.
 */
const SLOW_RTT_MS = 1000

/** Consecutive agreeing samples before we change our mind, in either direction. */
const CONFIRM_SAMPLES = 2

/**
 * Gap between probes while a problem is suspected, and its ceiling once backed off.
 * The ceiling is deliberately low: it also sets how long a *recovered* connection can
 * sit under a stale "slow connection" banner, since only a probe can clear it. One
 * clean sample resets the interval to the base, so the worst case is a single long
 * gap and not a whole sequence of them.
 */
const PROBE_INTERVAL_MS = 20_000
const MAX_PROBE_INTERVAL_MS = 60_000

interface NetworkInformation extends EventTarget {
  effectiveType?: string
}

/** Chrome/Android only; absent in Safari and Firefox, hence every check being optional. */
const connectionInfo = (): NetworkInformation | undefined =>
  (navigator as Navigator & { connection?: NetworkInformation }).connection

/**
 * Keeps `useNetworkStore` in step with reality: online/offline from the browser, and
 * connection *quality* from an active latency probe. Renders nothing.
 *
 * **Why probe at all, and why not continuously.** Nothing in the browser will tell you
 * "this connection is bad" — `navigator.onLine` is binary and the Network Information
 * API is Chromium-only and describes the radio, not the path to our server. The only
 * honest measure is timing a real request. But polling a healthy connection forever to
 * find out it's healthy is pure waste, so we probe *only once something has already
 * gone wrong* (`trouble`, or a server status that has left `up`), and stop as soon as
 * two samples come back clean.
 *
 * **Why a failed probe keeps probing.** `unknown` is the app admitting it doesn't know
 * whose fault an outage is, and something has to go and find out — otherwise the first
 * failed request wins the argument forever and the chip sits there unchallenged until
 * the user presses Retry. So a probe that gets no answer schedules the next one on the
 * same backoff instead of giving up: recovery is noticed without user action, and the
 * moment the server does answer, that same sample times the link and can resolve the
 * situation to the far more useful "your connection is slow".
 *
 * **Why two samples either way.** One slow request is a fluke — a cold Lambda, a
 * garbage-collecting phone, a single lost packet. Requiring agreement stops the banner
 * flickering on and off over noise, at the cost of a few seconds' latency in showing it.
 *
 * **Why a ping on recovery.** The `online` event only says an interface came up; it
 * says nothing about whether our server is reachable through it. Meanwhile every
 * request that failed during the outage has already knocked the server status off
 * `up`, which is what parks a user on the server-down page. Without an active probe
 * that stays stale until the user happens to make another request — so the app would
 * still be showing "can't reach the server" over a connection that works.
 *
 * **Why `visibilitychange` too.** Phones suspend tabs. A device that slept on wifi and
 * woke on cellular often fires no event at all, so returning to the tab is the only
 * signal we get that the world may have changed underneath us.
 */
export function NetworkWatcher() {
  const { t } = useTranslation()
  // Read through a ref so the effect can stay mount-only: re-subscribing to window
  // events on every connection flip would tear down the listeners we rely on.
  const wasOffline = useRef(!useNetworkStore.getState().online)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let slowSamples = 0
    let goodSamples = 0
    let failSamples = 0
    let inFlight = false

    const stopProbing = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }

    /**
     * Back off as a bad connection stays bad — it needs our traffic least. Slow and
     * failed samples share one ladder: they're both "still wrong", and a link that
     * degrades from crawling to dropping shouldn't get its patience reset for it.
     */
    const schedule = () => {
      stopProbing()
      const strikes = Math.max(slowSamples, failSamples)
      const backoff = PROBE_INTERVAL_MS * 2 ** Math.max(0, strikes - CONFIRM_SAMPLES)
      timer = setTimeout(() => void probe(), Math.min(backoff, MAX_PROBE_INTERVAL_MS))
    }

    const onSlowSample = () => {
      goodSamples = 0
      failSamples = 0
      slowSamples += 1
      if (slowSamples >= CONFIRM_SAMPLES) useNetworkStore.getState().setQuality('slow')
      schedule()
    }

    const onGoodSample = () => {
      slowSamples = 0
      failSamples = 0
      goodSamples += 1
      if (goodSamples < CONFIRM_SAMPLES) {
        schedule()
        return
      }
      useNetworkStore.getState().setQuality('good')
      stopProbing()
    }

    /**
     * The probe got nothing back. That's not a speed reading — there's no round trip
     * to time — so it can't move `quality` in either direction. It just means the
     * question is still open, so keep asking.
     */
    const onFailedSample = () => {
      slowSamples = 0
      goodSamples = 0
      failSamples += 1
      schedule()
    }

    const probe = async () => {
      // Nothing to measure: with no connection the offline banner already has the
      // floor, and a hidden tab is throttled hard enough that any timing we took
      // would be the browser's doing, not the network's. Park the investigation —
      // `onVisible` picks it up again if it was ever confirmed.
      if (!useNetworkStore.getState().online || document.hidden) {
        stopProbing()
        return
      }
      // Reports can arrive in bursts (several requests time out together). One probe
      // in flight is enough; a pile of them would measure the congestion they cause.
      if (inFlight) return
      inFlight = true

      const { ok, ms, timedOut } = await probeServer().finally(() => {
        inFlight = false
      })
      if (timedOut) return onSlowSample()
      // `probeServer` has already recorded the failure as `down` or `unknown`; our job
      // is only to make sure we ask again.
      if (!ok) return onFailedSample()
      return ms > SLOW_RTT_MS ? onSlowSample() : onGoodSample()
    }

    /** Measure now. Fresh evidence supersedes whatever was already scheduled. */
    const startProbing = () => {
      stopProbing()
      void probe()
    }

    const clearQuality = () => {
      stopProbing()
      slowSamples = 0
      goodSamples = 0
      failSamples = 0
      useNetworkStore.getState().setQuality('good')
    }

    const goOnline = () => {
      useNetworkStore.getState().setOnline(true)
      // Confirm the backend before telling anyone we're back — an interface coming up
      // behind a captive portal is not a working connection. The same probe doubles as
      // the first quality sample of the new connection.
      void probeServer().then(({ ok, ms, timedOut }) => {
        if (timedOut) {
          onSlowSample()
          return
        }
        // An interface came up but our server still isn't answering through it — the
        // captive-portal case exactly. Don't announce a recovery that hasn't happened;
        // keep probing until something answers.
        if (!ok) return onFailedSample()
        if (wasOffline.current) notifySuccess(t('network.restored'))
        wasOffline.current = false
        if (ms > SLOW_RTT_MS) onSlowSample()
      })
    }

    const goOffline = () => {
      wasOffline.current = true
      useNetworkStore.getState().setOnline(false)
      // A connection that no longer exists has no speed to report on.
      clearQuality()
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      // Trust an explicit `false` and stop there; otherwise re-probe, but only when
      // something already looks wrong, so a tab switch isn't a health check.
      if (!useNetworkStore.getState().refresh()) return
      if (useServerStore.getState().status !== 'up' || wasOffline.current) goOnline()
      else if (useNetworkStore.getState().quality === 'slow') startProbing()
    }

    // The browser downgrading us (wifi → 2g, or a radio losing bars) is a hint, not a
    // verdict: it describes the first hop, and says nothing about the path to our
    // server. So it opens an investigation rather than closing one — the probes decide.
    const onConnectionChange = () => {
      const effectiveType = connectionInfo()?.effectiveType
      if (effectiveType === 'slow-2g' || effectiveType === '2g') {
        useNetworkStore.getState().reportTrouble()
      }
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisible)
    connectionInfo()?.addEventListener('change', onConnectionChange)

    // Something elsewhere in the app just watched the network misbehave (a request
    // that timed out, a socket that dropped). That's one slow observation in its own
    // right — start measuring, and let the probes confirm or clear it.
    const unsubscribe = useNetworkStore.subscribe((state, prev) => {
      if (state.trouble === prev.trouble) return
      if (!state.online) return
      onSlowSample()
      startProbing()
    })

    // The server status left `up`, which means some request somewhere got no answer
    // and the app is now showing a message it can't fully justify. Go and measure so
    // it gets justified — or withdrawn — without the user pressing anything. No slow
    // sample is recorded here: a failure isn't a timing, and pretending otherwise
    // would let one dropped request convict the connection.
    const unsubscribeServer = useServerStore.subscribe((state, prev) => {
      if (state.status === prev.status) return
      if (state.status === 'up') {
        failSamples = 0
        return
      }
      startProbing()
    })

    // The connection can drop between module load and mount.
    useNetworkStore.getState().refresh()

    return () => {
      stopProbing()
      unsubscribe()
      unsubscribeServer()
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisible)
      connectionInfo()?.removeEventListener('change', onConnectionChange)
    }
  }, [t])

  return null
}
