import { zodResolver } from '@hookform/resolvers/zod'
import { Check, KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import ApiError from '@/api/apiError'
import { changePassword } from '@/api/services/authService'
import { RhfPasswordField } from '@/components/formFields/reactHookFormFields'
import { Button } from '@/components/ui/button'
import { notifyError } from '@/lib/notify'
import type { User } from '@/types/authType'
import { changePasswordSchema, type ChangePasswordValues } from '@/validations'

import styles from './AccountPanel.module.scss'

interface PasswordRowProps {
  user: User
}

/**
 * Ties the disabled button to the sentence explaining it. A disabled control is
 * skipped by most screen readers' tab order but still reachable by browse mode, and
 * without this the reason sits in a sibling node with nothing linking the two.
 */
const LOCKED_HINT_ID = 'password-row-locked-hint'

/**
 * The password line in Sign-in & security — collapsed to a button until asked for.
 *
 * Three password fields permanently open on the profile is a form nobody came to
 * fill in; it reads as an outstanding task on a page people visit to change their
 * display name. It matches the email row above it: one line per concern, an action
 * that expands in place.
 *
 * An account that has a password must re-supply it. That isn't ceremony — an access
 * token left behind on a shared device shouldn't be enough to lock the real owner
 * out, which is the same reason `DELETE /auth/me` asks. A Google-only account has
 * nothing to re-supply, so for them this row reads as "set a password" and the
 * current-password field isn't there.
 *
 * **Nothing happens here until the address is confirmed.** Recovery runs entirely on
 * a proven address — `POST /auth/forgot-password` mails nothing to an unverified one
 * — so a user who changes their password now and mistypes it has no way back. The
 * row is disabled rather than hidden: a password control that simply isn't there
 * reads as a bug, whereas a disabled one with a reason points at the email row
 * directly above it, which is where the fix is. The server enforces the same rule
 * (`email_unverified`); this is the explanation, not the lock.
 */
export function PasswordRow({ user }: PasswordRowProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)

  const methods = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const {
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting },
  } = methods

  /**
   * `emailVerified` rather than "has an address": a seeded beta account carries one
   * on the row that nobody ever confirmed, and `issuePasswordReset` refuses that
   * address exactly as it refuses none at all. Proven is the only state recovery
   * works from, so it's the only state this row opens in.
   */
  const canChange = user.emailVerified

  const close = () => {
    setEditing(false)
    reset()
  }

  const onSubmit = async (values: ChangePasswordValues) => {
    if (user.hasPassword && !values.currentPassword) {
      setError('currentPassword', { message: 'auth.errors.passwordRequired' })
      return
    }
    setSaved(false)
    try {
      await changePassword({
        ...(user.hasPassword ? { currentPassword: values.currentPassword } : {}),
        newPassword: values.newPassword,
      })
      close()
      setSaved(true)
    } catch (err) {
      // The wrong current password is a field problem, not a page problem — keep it
      // next to the input that has to change rather than in a corner toast.
      if (err instanceof ApiError && err.code === 'invalid_password') {
        setError('currentPassword', { message: 'auth.errors.invalid_password' })
        return
      }
      notifyError(err)
    }
  }

  if (editing && canChange) {
    return (
      <li className={styles.row}>
        <span className={styles.rowIcon} aria-hidden="true">
          <KeyRound className={styles.rowGlyph} />
        </span>
        <FormProvider {...methods}>
          <form
            className={styles.rowForm}
            noValidate
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          >
            {user.hasPassword && (
              <RhfPasswordField
                name="currentPassword"
                label="auth.fields.currentPassword"
                autoComplete="current-password"
              />
            )}
            <RhfPasswordField
              name="newPassword"
              label="auth.fields.newPassword"
              autoComplete="new-password"
            />
            <RhfPasswordField
              name="confirmPassword"
              label="auth.fields.confirmPassword"
              autoComplete="new-password"
            />
            <div className={styles.rowFormActions}>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className={styles.spinner} />}
                {t(user.hasPassword ? 'auth.password.change' : 'auth.password.set')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isSubmitting}
                onClick={close}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </FormProvider>
      </li>
    )
  }

  return (
    <li className={styles.row}>
      <span className={styles.rowIcon} aria-hidden="true">
        <KeyRound className={styles.rowGlyph} />
      </span>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{t('auth.password.changeTitle')}</span>
        <span className={styles.rowValue}>
          {saved
            ? t('auth.password.changed')
            : t(user.hasPassword ? 'auth.password.rowSet' : 'auth.password.rowNone')}
        </span>
        {saved && (
          <span className={styles.rowNote} role="status">
            <Check className={styles.rowNoteIcon} />
            {t('auth.password.otherDevicesOut')}
          </span>
        )}
        {!canChange && (
          <span className={styles.rowHint} id={LOCKED_HINT_ID}>
            {t('auth.password.needsVerifiedEmail')}
          </span>
        )}
      </div>
      <div className={styles.rowActions}>
        <Button
          variant="outline"
          size="sm"
          disabled={!canChange}
          aria-describedby={canChange ? undefined : LOCKED_HINT_ID}
          onClick={() => {
            setSaved(false)
            setEditing(true)
          }}
        >
          {t(user.hasPassword ? 'auth.password.change' : 'auth.password.set')}
        </Button>
      </div>
    </li>
  )
}
