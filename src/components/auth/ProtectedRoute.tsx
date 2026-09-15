import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { Loading } from '@/components/common/Loading'
import { ROUTES } from '@/constants/routes'
import { useAuthStore } from '@/store/useAuthStore'

/**
 * Gate for activity routes: renders the nested route only when signed in. While
 * the initial session hydration is in flight (`loading`) it shows a spinner so a
 * logged-in user isn't briefly bounced to login on a refresh. When unauthenticated
 * it redirects to login, remembering the intended destination via `?redirect=`.
 *
 * During the closed beta the login page it lands on explains itself — see the beta
 * banner in `LoginPage` — so a stranger who clicked through from the public site is
 * told why they can't get in, rather than meeting a bare form and no account to use.
 */
export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'loading') {
    return <Loading />
  }

  if (status === 'unauthenticated') {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`${ROUTES.login}?redirect=${redirect}`} replace />
  }

  return <Outlet />
}
