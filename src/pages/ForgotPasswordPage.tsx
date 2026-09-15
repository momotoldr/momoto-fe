import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { requestPasswordReset } from '@/api/services/authService'
import { RhfInputField } from '@/components/formFields/reactHookFormFields'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { useSendCooldown } from '@/hooks/useSendCooldown'
import { notifyError, notifySuccess } from '@/lib/notify'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/validations'

import styles from '@/components/auth/authForms.module.scss'

import flow from './authFlow.module.scss'

/** Its own timer — asking for a reset link is a different message from confirming an address. */
const RESET_COOLDOWN_KEY = 'momoto.cooldown.resetPassword'

/**
 * "I forgot my password" — asks for a reset link.
 *
 * **The confirmation deliberately says nothing about the account.** The server
 * answers identically whether the identifier is unknown, known without a confirmed
 * address, or known and mailed — that is what stops this page being a way to test
 * whether a username exists. A message like "no such user" would hand that straight
 * back, so the screen below is the only outcome there is.
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation()
  /**
   * The form is *replaced* by the confirmation rather than sitting behind a toast —
   * there is nothing left to type once it's submitted. Asking again is still possible,
   * but only through the timed button below, so someone who sees no mail can't spend
   * the server's three-an-hour budget in ten seconds.
   */
  const cooldown = useSendCooldown(RESET_COOLDOWN_KEY)
  /**
   * Seeded from the cooldown, not just from this render's submit.
   *
   * A live cooldown means a link went out moments ago, so a reload should come back
   * to the confirmation and its ticking timer — not to a fresh form with a live
   * button. Refreshing is exactly what someone does when no mail arrives, and it was
   * otherwise a one-keystroke way around the wait.
   */
  const [sent, setSent] = useState(() => cooldown.active)

  const methods = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { identifier: '' },
  })
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods

  const onSubmit = async (values: ForgotPasswordValues) => {
    try {
      await requestPasswordReset(values.identifier.trim())
      if (sent) notifySuccess(t('auth.forgot.sentAgain'))
      cooldown.start()
      setSent(true)
    } catch (err) {
      // Only a transport fault or a rate limit can land here — the request itself
      // succeeds for any identifier. Worth surfacing: it means nothing was sent.
      notifyError(err)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {sent ? (
          <div className={flow.status}>
            <span className={`${flow.statusIcon} ${flow.statusIconOk}`} aria-hidden="true">
              <MailCheck className={flow.statusGlyph} />
            </span>
            <h1 className={flow.statusTitle}>{t('auth.forgot.sentTitle')}</h1>
            <p className={flow.statusBody}>{t('auth.forgot.sentBody')}</p>
            {/* Mail goes astray, so "wait forever" can't be the only option. A timer
                rather than an always-live button: the server allows three of these an
                hour, and someone who spends them in ten seconds has locked themselves
                out of the very thing they came for. */}
            <div className={flow.actions}>
              <Button
                disabled={cooldown.active || isSubmitting}
                onClick={() => void handleSubmit(onSubmit)()}
              >
                {cooldown.active
                  ? t('auth.forgot.resendIn', { seconds: cooldown.remaining })
                  : t('auth.forgot.resend')}
              </Button>
              <Button asChild variant="ghost">
                <Link to={ROUTES.login}>{t('auth.forgot.backToLogin')}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.head}>
              <h1 className={styles.title}>{t('auth.forgot.title')}</h1>
              <p className={styles.subtitle}>{t('auth.forgot.subtitle')}</p>
            </div>

            <FormProvider {...methods}>
              <form
                className={styles.form}
                noValidate
                onSubmit={(e) => void handleSubmit(onSubmit)(e)}
              >
                {/* One field for either a username or an email: sign-in is
                    username-first, but people remember their address, and someone who
                    has forgotten a password won't reliably recall which we hold. */}
                <RhfInputField
                  name="identifier"
                  label="auth.fields.identifier"
                  autoComplete="username"
                />
                <Button type="submit" size="lg" disabled={isSubmitting || cooldown.active}>
                  {cooldown.active
                    ? t('auth.forgot.resendIn', { seconds: cooldown.remaining })
                    : isSubmitting
                      ? t('auth.forgot.submitting')
                      : t('auth.forgot.submit')}
                </Button>
              </form>
            </FormProvider>

            <p className={styles.footer}>
              <Trans
                i18nKey="auth.forgot.rememberIt"
                components={{
                  login: <Link className={styles.footerLink} to={ROUTES.login} />,
                }}
              />
            </p>
          </>
        )}
      </div>
    </main>
  )
}
