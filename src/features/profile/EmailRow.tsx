import { zodResolver } from '@hookform/resolvers/zod'
import { BadgeCheck, Clock, Loader2, Mail } from 'lucide-react'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import ApiError from '@/api/apiError'
import { setEmail } from '@/api/services/authService'
import { RhfEmailField } from '@/components/formFields/reactHookFormFields'
import { Button } from '@/components/ui/button'
import { notifyError, notifySuccess } from '@/lib/notify'
import type { User } from '@/types/authType'
import { useSendCooldown } from '@/hooks/useSendCooldown'
import { emailFormSchema, type EmailFormValues } from '@/validations'

import styles from './AccountPanel.module.scss'

/** Shared with the app-wide banner, so one send silences both. */
export const EMAIL_COOLDOWN_KEY = 'momoto.cooldown.verifyEmail'

interface EmailRowProps {
  user: User
}

/**
 * The email line in the Account tab, in one of three states:
 *
 * - **none** — no address anywhere on the account.
 * - **unconfirmed** — an address exists but nobody has proven it. Two ways in: the
 *   user claimed one (`pendingEmail`), or an operator attached one straight to the
 *   row (`user.email` with `emailVerified` false — seeding from the signup form, or
 *   `POST /admin/users`). **This is every seeded beta tester's starting state**, so
 *   reading only `pendingEmail` here would show them "Not set" beside an address we
 *   demonstrably hold.
 * - **verified** — proven, and the only state from which a password can be reset.
 *
 * Nothing here is a wall: an unconfirmed address costs the user a prompt, never
 * access. The one thing it gates is recovery, which is what the copy says.
 */
export function EmailRow({ user }: EmailRowProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState<string | null>(
    user.pendingEmail ?? (user.emailVerified ? null : user.email)
  )
  const [resending, setResending] = useState(false)
  const cooldown = useSendCooldown(EMAIL_COOLDOWN_KEY)

  const methods = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { email: user.pendingEmail ?? user.email ?? '' },
  })
  const {
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = methods

  const onSave = async (values: EmailFormValues) => {
    try {
      const claimed = await setEmail(values.email)
      // Nothing about the account has changed yet — only a link went out. Keep this
      // local rather than touching the store's user, which still (correctly) has the
      // old address or none.
      setPending(claimed)
      cooldown.start()
      setEditing(false)
      notifySuccess(t('auth.email.sent', { email: claimed }))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_taken') {
        setError('email', { message: 'auth.errors.email_taken' })
        return
      }
      notifyError(err)
    }
  }

  /**
   * Re-claims the same address, rather than calling the resend endpoint.
   *
   * Resend needs a *live claim* to re-send, and an operator-attached address has
   * none — there is a row but no token behind it. Re-claiming works from either
   * state and supersedes any older link, so this is one path instead of two.
   */
  const onResend = async () => {
    if (!pending) return
    setResending(true)
    try {
      const claimed = await setEmail(pending)
      cooldown.start()
      notifySuccess(t('auth.email.sent', { email: claimed }))
    } catch (err) {
      notifyError(err)
    } finally {
      setResending(false)
    }
  }

  if (editing) {
    return (
      <li className={styles.row}>
        <span className={styles.rowIcon} aria-hidden="true">
          <Mail className={styles.rowGlyph} />
        </span>
        <FormProvider {...methods}>
          <form
            className={styles.rowForm}
            noValidate
            onSubmit={(e) => void handleSubmit(onSave)(e)}
          >
            <RhfEmailField
              name="email"
              label="auth.fields.email"
              autoComplete="email"
              wrapperClassName={styles.rowField}
            />
            <div className={styles.rowFormActions}>
              <Button type="submit" size="sm" disabled={isSubmitting || cooldown.active}>
                {isSubmitting && <Loader2 className={styles.spinner} />}
                {cooldown.active
                  ? t('auth.email.resendIn', { seconds: cooldown.remaining })
                  : t('auth.email.send')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => {
                  setEditing(false)
                  methods.reset()
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </FormProvider>
      </li>
    )
  }

  const verified = user.emailVerified && user.email

  return (
    <li className={styles.row}>
      <span className={styles.rowIcon} aria-hidden="true">
        {verified ? (
          <BadgeCheck className={styles.rowGlyph} />
        ) : pending ? (
          <Clock className={styles.rowGlyph} />
        ) : (
          <Mail className={styles.rowGlyph} />
        )}
      </span>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{t('auth.fields.email')}</span>
        {verified ? (
          <span className={styles.rowValue}>{user.email}</span>
        ) : pending ? (
          <>
            <span className={styles.rowValue}>{pending}</span>
            <span className={styles.rowHint}>{t('auth.email.unconfirmedHint')}</span>
          </>
        ) : (
          <>
            <span className={styles.rowValue}>{t('auth.profile.security.emailNone')}</span>
            <span className={styles.rowHint}>{t('auth.email.noneHint')}</span>
          </>
        )}
      </div>
      <div className={styles.rowActions}>
        {pending && !verified && (
          <Button
            variant="ghost"
            size="sm"
            disabled={resending || cooldown.active}
            onClick={() => void onResend()}
          >
            {resending && <Loader2 className={styles.spinner} />}
            {cooldown.active
              ? t('auth.email.resendIn', { seconds: cooldown.remaining })
              : t('auth.email.confirm')}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          {verified || pending ? t('auth.email.change') : t('auth.email.add')}
        </Button>
      </div>
    </li>
  )
}
