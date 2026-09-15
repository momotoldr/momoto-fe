import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider, useForm } from 'react-hook-form'
import { Trans, useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import ApiError from '@/api/apiError'
import { register as registerAccount } from '@/api/services/authService'
import { GoogleButton } from '@/components/auth/GoogleButton'
import {
  RhfEmailField,
  RhfInputField,
  RhfPasswordField,
} from '@/components/formFields/reactHookFormFields'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { env } from '@/env'
import { notifyError } from '@/lib/notify'
import { useAuthStore } from '@/store/useAuthStore'
import { safeRedirectPath } from '@/utils/common'
import type { User } from '@/types/authType'
import { registerSchema, type RegisterValues } from '@/validations'

import styles from '@/components/auth/authForms.module.scss'

/** Create an account with email/password (or Google). */
export function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const setSession = useAuthStore((s) => s.setSession)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const methods = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', username: '', email: '', password: '' },
  })
  const {
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = methods

  // Never navigate straight to an attacker-supplied value — see `safeRedirectPath`.
  const redirectTarget = safeRedirectPath(params.get('redirect'), ROUTES.activities)

  // Already signed in (e.g. Back returned to this cached `/register` entry after a
  // successful sign-up) — bounce forward instead of showing the form again.
  if (isAuthenticated) {
    return <Navigate to={redirectTarget} replace />
  }

  const onAuthed = (user: User) => {
    setSession(user)
    navigate(redirectTarget, { replace: true })
  }

  const onSubmit = async (values: RegisterValues) => {
    try {
      onAuthed(
        await registerAccount({
          username: values.username.trim(),
          password: values.password,
          displayName: values.displayName.trim(),
          email: values.email.trim(),
        })
      )
    } catch (err) {
      // An address someone else has already confirmed is a correctable input problem,
      // so it belongs on the field rather than in a toast that leaves the user
      // guessing which of four inputs to change.
      if (err instanceof ApiError && err.code === 'email_taken') {
        setError('email', { message: 'auth.errors.email_taken' })
        return
      }
      notifyError(err)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.head}>
          <h1 className={styles.title}>{t('auth.register.title')}</h1>
          <p className={styles.subtitle}>{t('auth.register.subtitle')}</p>
        </div>

        <FormProvider {...methods}>
          <form className={styles.form} noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
            <RhfInputField
              name="displayName"
              label="auth.fields.displayName"
              autoComplete="nickname"
            />
            <RhfInputField name="username" label="auth.fields.username" autoComplete="username" />
            {/* Required. The account works immediately — the confirmation link this
                sends is what later makes a forgotten password recoverable. */}
            <RhfEmailField name="email" label="auth.fields.email" autoComplete="email" />
            <RhfPasswordField
              name="password"
              label="auth.fields.password"
              autoComplete="new-password"
            />
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t('auth.register.submitting') : t('auth.register.submit')}
            </Button>

            <p className={styles.consent}>
              <Trans
                i18nKey="auth.register.consent"
                components={{
                  terms: <Link className={styles.consentLink} to={ROUTES.terms} />,
                  privacy: <Link className={styles.consentLink} to={ROUTES.privacy} />,
                }}
              />
            </p>
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

        <p className={styles.footer}>
          {t('auth.register.haveAccount')}{' '}
          <Link className={styles.footerLink} to={ROUTES.login}>
            {t('auth.register.loginLink')}
          </Link>
        </p>
      </div>
    </main>
  )
}
