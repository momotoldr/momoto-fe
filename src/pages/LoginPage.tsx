import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { login } from '@/api/services/authService'
import logoUrl from '@/assets/logo-momoto.svg'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { RhfInputField, RhfPasswordField } from '@/components/formFields/reactHookFormFields'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { env } from '@/env'
import { notifyError, notifySuccess } from '@/lib/notify'
import { useAuthStore } from '@/store/useAuthStore'
import type { User } from '@/types/authType'
import { safeRedirectPath } from '@/utils/common'
import { loginSchema, type LoginValues } from '@/validations'

import styles from './LoginPage.module.scss'

/** Email/password + Google sign-in. Redirects to `?redirect=` (or home) on success. */
export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const setSession = useAuthStore((s) => s.setSession)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const methods = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  })
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods

  // Never navigate straight to an attacker-supplied value — see `safeRedirectPath`.
  const redirectTarget = safeRedirectPath(params.get('redirect'), ROUTES.activities)

  // `?reset=1` is set by ResetPasswordPage, which deliberately hands back no session:
  // the user arrives here to sign in with the password they just chose, and this is
  // the only confirmation that the reset actually worked.
  const justReset = params.get('reset') === '1'
  useEffect(() => {
    if (justReset) notifySuccess(t('auth.reset.done'))
  }, [justReset, t])

  // Already signed in (e.g. the browser Back button returned to this cached
  // `/login` history entry after a successful login) — bounce forward to the
  // target instead of showing the form again. `replace` drops this entry so Back
  // keeps going past it.
  if (isAuthenticated) {
    return <Navigate to={redirectTarget} replace />
  }

  const onAuthed = (user: User) => {
    setSession(user)
    navigate(redirectTarget, { replace: true })
  }

  const onSubmit = async (values: LoginValues) => {
    try {
      onAuthed(await login({ username: values.username.trim(), password: values.password }))
    } catch (err) {
      notifyError(err)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {/* Brand panel: says what you're signing into. Set on the landing page's
            gradient, with one strip cropped by the panel's bottom edge. */}
        <aside className={styles.panel}>
          <img className={styles.panelLogo} src={logoUrl} alt="" />
          <div className={styles.panelCopy}>
            {/* One word per line, split rather than hard-coded so the tagline
                stacks the same way in every locale. */}
            <h2 className={styles.panelTitle}>
              {t('landing.footerTag')
                .split(' ')
                .map((word) => (
                  <span className={styles.panelWord} key={word}>
                    {word}
                  </span>
                ))}
            </h2>
            <span className={styles.panelRule} />
            <p className={styles.panelTagline}>{t('auth.login.panelTagline')}</p>
          </div>
          <div className={styles.strip} aria-hidden="true">
            <span className={styles.stripCell} />
            <span className={styles.stripCell} />
            <span className={styles.stripCell} />
            <span className={styles.stripCell} />
          </div>
        </aside>

        <div className={styles.formSide}>
          <div className={styles.head}>
            <h1 className={styles.title}>{t('auth.login.title')}</h1>
            <p className={styles.subtitle}>{t('auth.login.subtitle')}</p>
          </div>

          {/* Closed beta: signup is shut, so someone who arrived here without an
              account has no way forward and no idea why. Say so above the form
              rather than letting them work it out from a failing login. */}
          {env.betaMode && (
            <div className={styles.betaNotice} role="status">
              <span className={styles.betaBadge}>{t('beta.badge')}</span>
              <p className={styles.betaMessage}>{t('beta.message')}</p>
            </div>
          )}

          <FormProvider {...methods}>
            <form
              className={styles.form}
              noValidate
              onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            >
              <RhfInputField name="username" label="auth.fields.username" autoComplete="username" />
              <RhfPasswordField
                name="password"
                label="auth.fields.password"
                autoComplete="current-password"
              />
              <Link className={styles.forgotLink} to={ROUTES.forgotPassword}>
                {t('auth.login.forgotPassword')}
              </Link>
              <Button className={styles.submit} type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('auth.login.submitting') : t('auth.login.submit')}
              </Button>
            </form>
          </FormProvider>

          {env.googleClientId && (
            <>
              <div className={styles.divider}>{t('auth.or')}</div>
              <div className={styles.google}>
                <GoogleButton onSuccess={onAuthed} onError={() => notifyError()} />
              </div>
            </>
          )}

          {/* The redesign puts the sign-up cross-link here. It stays off while the
              closed beta runs: `/register` is unrouted and the backend's INVITE_ONLY
              403s the endpoint, so the link would only lead to a 404. Restore this
              together with the `/register` route in `app/App.tsx`.

          <p className={styles.footer}>
            {t('auth.login.noAccount')}{' '}
            <Link className={styles.footerLink} to={ROUTES.register}>
              {t('auth.login.registerLink')}
            </Link>
          </p> */}
        </div>
      </div>
    </main>
  )
}
