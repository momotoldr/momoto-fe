import ApiError from '@/api/apiError'
import { useServerStore } from '@/store/useServerStore'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const healthClient = new AxiosClient()

// A liveness probe should feel snappy — override the client's default 10s timeout.
const PING_TIMEOUT_MS = 5000

export interface ProbeResult {
  /** The server answered. */
  ok: boolean
  /** Round-trip time in ms. Only meaningful when `ok`. */
  ms: number
  /** The probe ran out of time rather than failing outright — see below. */
  timedOut: boolean
}

/**
 * Probe `GET /healthz`, timing the round trip and updating `useServerStore.status`.
 *
 * **Why a timeout isn't "the server is down".** A refused connection and a request
 * that crawled past five seconds look the same to a caller that only gets a boolean,
 * but they mean opposite things to a user: one is our outage, the other is their
 * connection. So a timeout leaves the status alone and is reported back as `timedOut`,
 * which `NetworkWatcher` reads as evidence of a slow link.
 *
 * **This is the only place that can say `down`.** Everywhere else in the app sees at
 * most "no response", which proves nothing about whose fault it is. But the probe asks
 * a question with no business logic behind it, so if `/healthz` *answers* and the
 * answer is bad, the path is demonstrably fine and the server demonstrably isn't —
 * the one case where blaming ourselves is accurate. A probe that never gets a reply
 * is `unknown`, like any other request.
 */
export async function probeServer(): Promise<ProbeResult> {
  const startedAt = Date.now()
  try {
    await healthClient.getData(API_ROUTES.HEALTH, {}, { timeout: PING_TIMEOUT_MS })
    return { ok: true, ms: Date.now() - startedAt, timedOut: false }
  } catch (err) {
    const timedOut =
      err instanceof ApiError && (err.errorType === 'ECONNABORTED' || err.errorType === 'ETIMEDOUT')
    // A status of 0 means nothing came back at all; anything else is the server
    // answering badly, which the success/error interceptors have already optimistically
    // recorded as `up`.
    if (!timedOut) {
      const answered = err instanceof ApiError && err.status > 0
      useServerStore.getState().setStatus(answered ? 'down' : 'unknown')
    }
    return { ok: false, ms: Date.now() - startedAt, timedOut }
  }
}

/**
 * Probe the server and report whether it answered. Used at bootstrap and by the retry /
 * auto-poll on the server-down page, which care about reachability but not latency.
 */
export async function pingServer(): Promise<boolean> {
  return (await probeServer()).ok
}
