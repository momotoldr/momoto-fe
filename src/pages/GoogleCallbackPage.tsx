import { Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useTrackPageView } from '@/analytics'
import { loginWithGoogle } from '@/api/services/authService'
import { googleRedirectUri, takeGoogleSignIn } from '@/lib/googleSignIn'
import { notifyError } from '@/lib/notify'
import { useAuthStore } from '@/store/useAuthStore'

import styles from '@/components/auth/authForms.module.scss'

import flow from './authFlow.module.scss'

/**
 * Where Google sends the tab back after "Continue with Google" (`lib/googleSignIn`).
 *
 * Only ever shows a spinner: it trades the code for a session and moves on — to the
 * page the sign-in was for, or back to the login/register page it started from with a
 * toast saying why. Backing out on Google's screen returns there quietly.
 */
export function GoogleCallbackPage() {
  useTrackPageView()
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const started = useRef(false)

  useEffect(() => {
    // Google's code is single-use, and StrictMode runs this effect twice in development.
    // The cancel-on-cleanup pattern would send it twice: the second redemption fails,
    // and its error would replace a sign-in that had worked. So: once, and no cancel.
    if (started.current) return
    started.current = true

    const pending = takeGoogleSignIn()
    const back = pending?.from ?? '/login'
    const code = params.get('code')
    const error = params.get('error')

    const fail = (err?: unknown) => {
      navigate(back, { replace: true })
      // This page is usually the first render of a fresh load (Google just sent the tab
      // here), and `<Toaster>` mounts after `<App>` (main.tsx), so its effect — where it
      // starts listening — runs after this one. A toast raised now would be dropped;
      // a task later, it's listening.
      setTimeout(() => notifyError(err), 0)
    }

    if (error) {
      // `access_denied` = they cancelled on Google's screen; that's a choice, not a fault.
      if (error === 'access_denied') navigate(back, { replace: true })
      else fail()
      return
    }
    // No pending sign-in, or a `state` we didn't issue: not a round trip this tab began.
    if (!pending || !code || params.get('state') !== pending.state) {
      fail()
      return
    }

    loginWithGoogle({ code, redirectUri: googleRedirectUri(), codeVerifier: pending.codeVerifier })
      .then((user) => {
        setSession(user)
        navigate(pending.returnTo, { replace: true })
      })
      .catch(fail)
  }, [params, navigate, setSession])

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={flow.checking}>
          <Loader2 className={flow.spinner} aria-hidden="true" />
          <p className={flow.statusBody}>{t('auth.googleCallback.checking')}</p>
        </div>
      </div>
    </main>
  )
}
