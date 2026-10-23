import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import googleLogoUrl from '@/assets/google-g.svg'
import { Button } from '@/components/ui/button'
import { env } from '@/env'
import { startGoogleSignIn } from '@/lib/googleSignIn'
import { notifyError } from '@/lib/notify'

import styles from './GoogleButton.module.scss'

interface GoogleButtonProps {
  /** Where to land once signed in — already passed through `safeRedirectPath`. */
  returnTo: string
}

/**
 * "Continue with Google" — renders nothing when Google sign-in isn't configured
 * (no `VITE_GOOGLE_CLIENT_ID`), so the surrounding divider can hide too.
 *
 * Sends this tab to Google (see `lib/googleSignIn`); the sign-in finishes on
 * `/auth/google/callback`, not here. Our own markup rather than Google's rendered
 * button, so the label follows the EN/ID switch like any other text.
 */
export function GoogleButton({ returnTo }: GoogleButtonProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const [busy, setBusy] = useState(false)

  // Back from Google's page can restore this one from the back/forward cache with the
  // button still disabled mid-redirect. A restored page is a fresh chance.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  if (!env.googleClientId) return null

  const onClick = () => {
    setBusy(true)
    startGoogleSignIn(returnTo, location.pathname + location.search).catch((err: unknown) => {
      setBusy(false)
      notifyError(err)
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={styles.button}
      disabled={busy}
      onClick={onClick}
    >
      <img className={styles.logo} src={googleLogoUrl} alt="" />
      {t('auth.google')}
    </Button>
  )
}
