import { BadgeCheck, Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'

import ApiError from '@/api/apiError'
import { verifyEmail } from '@/api/services/authService'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { useAuthStore } from '@/store/useAuthStore'

import styles from '@/components/auth/authForms.module.scss'

import flow from './authFlow.module.scss'

type State = 'checking' | 'done' | 'taken' | 'invalid'

/**
 * Where the confirmation link lands.
 *
 * **Works signed out, on purpose.** These links get opened in whatever browser the
 * mail app hands them to — a phone, a webmail preview pane — which is usually not the
 * session that asked for one. The token is the proof; demanding a session on top of
 * it would strand exactly the person the link exists for.
 */
export function VerifyEmailPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setUser = useAuthStore((s) => s.setUser)
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    if (!token) {
      setState('invalid')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const user = await verifyEmail(token)
        if (cancelled) return
        // If this *is* the signed-in session, fold the confirmed address straight
        // into the store so the profile and the nudge banner update without a reload.
        if (useAuthStore.getState().isAuthenticated) setUser(user)
        setState('done')
      } catch (err) {
        if (cancelled) return
        // 409 means somebody else confirmed this address first — a real outcome with
        // its own advice, not the same thing as a dead link.
        setState(err instanceof ApiError && err.code === 'email_taken' ? 'taken' : 'invalid')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, setUser])

  const onward = isAuthenticated ? ROUTES.profile : ROUTES.login

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {state === 'checking' && (
          <div className={flow.checking}>
            <Loader2 className={flow.spinner} aria-hidden="true" />
            <p className={flow.statusBody}>{t('auth.verifyEmail.checking')}</p>
          </div>
        )}

        {state === 'done' && (
          <div className={flow.status}>
            <span className={`${flow.statusIcon} ${flow.statusIconOk}`} aria-hidden="true">
              <BadgeCheck className={flow.statusGlyph} />
            </span>
            <h1 className={flow.statusTitle}>{t('auth.verifyEmail.doneTitle')}</h1>
            <p className={flow.statusBody}>{t('auth.verifyEmail.doneBody')}</p>
            <Button asChild>
              <Link to={onward}>
                {isAuthenticated ? t('auth.verifyEmail.toProfile') : t('auth.verifyEmail.toLogin')}
              </Link>
            </Button>
          </div>
        )}

        {(state === 'invalid' || state === 'taken') && (
          <div className={flow.status}>
            <span className={`${flow.statusIcon} ${flow.statusIconBad}`} aria-hidden="true">
              <TriangleAlert className={flow.statusGlyph} />
            </span>
            <h1 className={flow.statusTitle}>
              {t(
                state === 'taken' ? 'auth.verifyEmail.takenTitle' : 'auth.verifyEmail.failedTitle'
              )}
            </h1>
            <p className={flow.statusBody}>
              {t(state === 'taken' ? 'auth.verifyEmail.takenBody' : 'auth.verifyEmail.failedBody')}
            </p>
            <Button asChild variant="outline">
              <Link to={onward}>
                {isAuthenticated ? t('auth.verifyEmail.toProfile') : t('auth.verifyEmail.toLogin')}
              </Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}
