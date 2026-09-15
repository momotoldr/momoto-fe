import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { checkResetToken, resetPassword } from '@/api/services/authService'
import { RhfPasswordField } from '@/components/formFields/reactHookFormFields'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { notifyError } from '@/lib/notify'
import { resetPasswordSchema, type ResetPasswordValues } from '@/validations'

import styles from '@/components/auth/authForms.module.scss'

import flow from './authFlow.module.scss'

/** Checking the link → the form → (on success) off to sign in. */
type State = 'checking' | 'valid' | 'invalid'

/**
 * Choose a new password from an emailed link.
 *
 * The token is checked on mount rather than on submit: an expired or already-used
 * link should say so straight away, not after someone has carefully typed a new
 * password into two fields.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<State>('checking')

  const methods = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods

  useEffect(() => {
    if (!token) {
      setState('invalid')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const valid = await checkResetToken(token)
        if (!cancelled) setState(valid ? 'valid' : 'invalid')
      } catch {
        // A pre-check that can't reach the server says nothing about the token, so
        // show the form and let the submit be the authority. Treating a network
        // blip as an expired link would send the user to request another one for
        // no reason.
        if (!cancelled) setState('valid')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const onSubmit = async (values: ResetPasswordValues) => {
    try {
      await resetPassword(token, values.password)
      // No session comes back by design — the link is a recovery credential, not a
      // sign-in. `replace` drops this entry so Back can't return to a form whose
      // token is now spent.
      navigate(`${ROUTES.login}?reset=1`, { replace: true })
    } catch (err) {
      // The token can expire between the pre-check and the submit; the server is the
      // authority, so fall back to the expired screen rather than leaving the user
      // retyping into a form that can't succeed.
      setState('invalid')
      notifyError(err)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {state === 'checking' && (
          <div className={flow.checking}>
            <Loader2 className={flow.spinner} aria-hidden="true" />
            <p className={flow.statusBody}>{t('auth.reset.checking')}</p>
          </div>
        )}

        {state === 'invalid' && (
          <div className={flow.status}>
            <span className={`${flow.statusIcon} ${flow.statusIconBad}`} aria-hidden="true">
              <TriangleAlert className={flow.statusGlyph} />
            </span>
            <h1 className={flow.statusTitle}>{t('auth.reset.expiredTitle')}</h1>
            <p className={flow.statusBody}>{t('auth.reset.expiredBody')}</p>
            <div className={flow.actions}>
              <Button asChild>
                <Link to={ROUTES.forgotPassword}>{t('auth.reset.requestAnother')}</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to={ROUTES.login}>{t('auth.forgot.backToLogin')}</Link>
              </Button>
            </div>
          </div>
        )}

        {state === 'valid' && (
          <>
            <div className={styles.head}>
              <h1 className={styles.title}>{t('auth.reset.title')}</h1>
              <p className={styles.subtitle}>{t('auth.reset.subtitle')}</p>
            </div>

            <FormProvider {...methods}>
              <form
                className={styles.form}
                noValidate
                onSubmit={(e) => void handleSubmit(onSubmit)(e)}
              >
                <RhfPasswordField
                  name="password"
                  label="auth.fields.newPassword"
                  autoComplete="new-password"
                />
                <RhfPasswordField
                  name="confirmPassword"
                  label="auth.fields.confirmPassword"
                  autoComplete="new-password"
                />
                <Button type="submit" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? t('auth.reset.submitting') : t('auth.reset.submit')}
                </Button>
              </form>
            </FormProvider>
          </>
        )}
      </div>
    </main>
  )
}
