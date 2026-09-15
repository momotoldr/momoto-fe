import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { logout } from '@/api/services/authService'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ROUTES } from '@/constants/routes'
import { notifyWarning } from '@/lib/notify'
import { useAuthStore } from '@/store/useAuthStore'

/**
 * Logout with a confirmation dialog, shared by every logout entry point (header
 * menu, profile page). Call `requestLogout` on the button, and render `dialog`
 * somewhere in that component's tree.
 */
export function useLogout(): { requestLogout: () => void; dialog: JSX.Element } {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const clearLocal = useAuthStore((s) => s.clearLocal)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // In a room, logging out abandons a live session — warn accordingly, and let
  // ProtectedRoute handle the redirect (navigating here would race the room's
  // still-active leave-blocker). Elsewhere, send the user home.
  const inRoom = location.pathname.startsWith('/room/')

  const requestLogout = () => setConfirmOpen(true)

  const performLogout = async () => {
    setConfirmOpen(false)
    try {
      // Best-effort server-side revocation of the refresh token.
      await logout()
    } catch {
      // Server unreachable / errored: logout is a local-safe action, so we still
      // sign out on this device — but warn that the server session wasn't ended.
      notifyWarning(t('auth.logoutServerError'))
    } finally {
      // Always clear local state so the user is signed out here regardless.
      clearLocal()
      if (!inRoom) navigate(ROUTES.home, { replace: true })
    }
  }

  const dialog = (
    <ConfirmDialog
      open={confirmOpen}
      title={t('auth.logoutConfirm.title')}
      description={t(
        inRoom ? 'auth.logoutConfirm.descriptionRoom' : 'auth.logoutConfirm.description'
      )}
      confirmLabel={t('auth.logoutConfirm.confirm')}
      cancelLabel={t('auth.logoutConfirm.cancel')}
      destructive
      onConfirm={() => void performLogout()}
      onCancel={() => setConfirmOpen(false)}
    />
  )

  return { requestLogout, dialog }
}
