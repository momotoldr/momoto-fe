import { useEffect } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'
import { useServerStore } from '@/store/useServerStore'
import { useSessionStore } from '@/store/useSessionStore'

/**
 * Routes that genuinely need a live backend. When the server isn't answering and the
 * user is on one of these, we send them to the server-down page. Everything else —
 * the static marketing pages, auth screens, and **solo** photobooth/room (offline by
 * design) — stays put.
 *
 * A date room needs the server to *start*, but not to finish: once its session is
 * running (`sessionLive`), the booth holds photos that only exist in that tab, and
 * bouncing to the server-down page would throw them away over a blip. The strip can
 * be composed and downloaded offline, so we leave the person in the booth and let the
 * socket reconnect underneath them.
 */
function needsServer(location: Location, sessionLive: boolean): boolean {
  const { pathname, search } = location
  if (pathname === ROUTES.profile) return true
  if (pathname.startsWith('/room/')) {
    if (sessionLive) return false
    return new URLSearchParams(search).get('mode') !== 'solo'
  }
  return false
}

/**
 * Watches the server status and redirects to the server-down page when the server
 * isn't answering *and* the current route depends on it. Renders nothing. Mounted
 * inside the router (RootLayout) so it can navigate. Recovery + return is handled by
 * the page.
 *
 * `down` and `unknown` gate identically: whether the outage is ours or the user's
 * link, a route that can't function without a backend still can't function. The
 * distinction only changes what the page *says*, which is `ServerDownPage`'s problem.
 */
export function ServerGate() {
  const serverStatus = useServerStore((s) => s.status)
  // A booth session is underway (the room store resets this when the room unmounts).
  const sessionLive = useSessionStore((s) => s.endsAt !== null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (serverStatus === 'up') return
    if (location.pathname === ROUTES.serverUnavailable) return
    if (!needsServer(location, sessionLive)) return

    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
    navigate(`${ROUTES.serverUnavailable}?redirect=${redirect}`, { replace: true })
  }, [serverStatus, sessionLive, location, navigate])

  return null
}
