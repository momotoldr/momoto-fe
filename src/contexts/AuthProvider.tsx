import { useEffect, type ReactNode } from 'react'

import ApiError from '@/api/apiError'
import { setAuthHandlers } from '@/api/client/axiosClient'
import { getMe, hasStoredToken } from '@/api/services/authService'
import { pingServer } from '@/api/services/healthService'
import { useAuthStore } from '@/store/useAuthStore'
import { useCartStore } from '@/store/useCartStore'
import { useServerStore } from '@/store/useServerStore'

/**
 * Wires the auth lifecycle for the whole app:
 * - registers the axios `onSessionExpired` reaction (fires only when a 401 could
 *   not be recovered by a refresh) → local sign-out, which makes ProtectedRoute
 *   reactively redirect to login;
 * - probes the server once at startup so an outage is known even before the first
 *   authed call;
 * - hydrates the current user: if an access token is stored, `getMe` populates the
 *   session. A **network** failure (server down) does NOT sign the user out — it
 *   keeps the session pending and re-attempts once the server answers again,
 *   so an outage shows the server-down page instead of a false logout.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const serverStatus = useServerStore((s) => s.status)
  const authStatus = useAuthStore((s) => s.status)

  // Keep the cart in step with the session: on sign-in, flush any browser-cached guest
  // strips to the server then load the cart; on sign-out, drop the cart so a signed-out
  // (or next) user never sees someone else's strips. The guest cache is left intact on
  // sign-out — it's only ever written while signed out and cleared as it syncs.
  useEffect(() => {
    if (authStatus === 'authenticated') void useCartStore.getState().syncGuestStrips()
    else if (authStatus === 'unauthenticated') useCartStore.getState().reset()
  }, [authStatus])

  useEffect(() => {
    setAuthHandlers({
      onSessionExpired: () => useAuthStore.getState().clearLocal(),
      onPermissionDenied: null,
    })
    void pingServer()
  }, [])

  useEffect(() => {
    // Only (re)hydrate while the session is still pending and the server is up.
    if (serverStatus !== 'up') return
    if (useAuthStore.getState().status !== 'loading') return

    if (!hasStoredToken()) {
      useAuthStore.getState().setUnauthenticated()
      return
    }

    let cancelled = false
    getMe()
      .then((user) => {
        if (!cancelled) useAuthStore.getState().setSession(user)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 0) {
          // Nothing came back, so we can't tell a dead backend from a dead link —
          // either way, keep the session pending rather than signing someone out over
          // it. The ServerGate shows the dedicated page and this effect retries on
          // recovery.
          useServerStore.getState().setStatus('unknown')
        } else {
          useAuthStore.getState().clearLocal()
        }
      })

    return () => {
      cancelled = true
    }
  }, [serverStatus])

  return <>{children}</>
}
