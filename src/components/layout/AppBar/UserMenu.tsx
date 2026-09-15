import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { LogOut, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { env } from '@/env'
import { useLogout } from '@/hooks/useLogout'
import { useAuthStore } from '@/store/useAuthStore'
import { avatarSrc } from '@/utils/common'

import styles from './UserMenu.module.scss'

/** Header auth control: a Login button when signed out, an avatar dropdown when in. */
export function UserMenu() {
  const { t } = useTranslation()
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const { requestLogout, dialog: logoutDialog } = useLogout()

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close the menu on an outside click.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (status !== 'authenticated' || !user) {
    // Don't flash a Login button during initial hydration.
    if (status === 'loading') return null
    return (
      <Button asChild size="sm" variant="outline">
        <Link to={ROUTES.login}>{t('auth.login.submit')}</Link>
      </Button>
    )
  }

  const onLogoutClick = () => {
    setOpen(false)
    requestLogout()
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('auth.profile.menuLabel')}
        onClick={() => setOpen((o) => !o)}
      >
        {avatarSrc(user.avatarUrl, env.socketUrl) ? (
          <img className={styles.avatar} src={avatarSrc(user.avatarUrl, env.socketUrl)!} alt="" />
        ) : (
          <span className={styles.avatarFallback} aria-hidden="true">
            {user.displayName.charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <span className={styles.menuName}>{user.displayName}</span>
          <Link
            to={ROUTES.profile}
            role="menuitem"
            className={styles.item}
            onClick={() => setOpen(false)}
          >
            <UserRound className={styles.itemIcon} />
            {t('auth.profile.title')}
          </Link>
          <button type="button" role="menuitem" className={styles.item} onClick={onLogoutClick}>
            <LogOut className={styles.itemIcon} />
            {t('auth.logout')}
          </button>
        </div>
      )}

      {logoutDialog}
    </div>
  )
}
