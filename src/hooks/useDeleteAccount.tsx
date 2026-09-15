import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ApiError from '@/api/apiError'
import { deleteAccount } from '@/api/services/authService'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Input } from '@/components/ui/input'
import { ROUTES } from '@/constants/routes'
import { galleryItems } from '@/features/gallery/selectors'
import { useAuthStore } from '@/store/useAuthStore'
import { useCartStore } from '@/store/useCartStore'

import styles from './useDeleteAccount.module.scss'

/**
 * Self-service account deletion with a confirmation dialog, mirroring `useLogout`.
 *
 * Accounts that have a password must retype it in the dialog (the server verifies).
 * Google-only accounts have nothing to retype, so they type the confirmation word
 * instead — a click-through on the most destructive action in the app is not a
 * confirmation. The description names what is actually being destroyed (the strips in
 * the gallery, the partner link) rather than describing deletion in the abstract.
 *
 * Call `requestDelete` on a button and render `dialog`.
 */
export function useDeleteAccount(): { requestDelete: () => void; dialog: JSX.Element } {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const clearLocal = useAuthStore((s) => s.clearLocal)
  const hasPassword = useAuthStore((s) => !!s.user?.hasPassword)
  const partnerName = useAuthStore((s) => s.user?.partner?.displayName ?? null)
  const items = useCartStore((s) => s.items)

  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const galleryCount = useMemo(() => galleryItems(items).length, [items])

  /** The word a passwordless account types to arm the button, localized with the label. */
  const confirmWord = t('auth.deleteConfirm.word')

  const requestDelete = () => {
    setConfirmation('')
    setError(null)
    setOpen(true)
  }

  const cancel = () => {
    if (!submitting) setOpen(false)
  }

  const performDelete = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await deleteAccount(hasPassword ? confirmation : undefined)
      clearLocal()
      toast.success(t('auth.deleteConfirm.done'))
      navigate(ROUTES.home, { replace: true })
    } catch (err) {
      const wrongPassword = err instanceof ApiError && err.code === 'invalid_password'
      setError(t(wrongPassword ? 'auth.deleteConfirm.wrongPassword' : 'auth.deleteConfirm.error'))
      setSubmitting(false)
    }
  }

  const armed = hasPassword
    ? confirmation.length > 0
    : confirmation.trim().toUpperCase() === confirmWord.toUpperCase()

  const description = partnerName
    ? t('auth.deleteConfirm.descriptionLinked', { count: galleryCount, name: partnerName })
    : t('auth.deleteConfirm.description', { count: galleryCount })

  const dialog = (
    <ConfirmDialog
      open={open}
      title={t('auth.deleteConfirm.title')}
      description={description}
      confirmLabel={submitting ? t('auth.deleteConfirm.deleting') : t('auth.deleteConfirm.confirm')}
      cancelLabel={t('auth.deleteConfirm.cancel')}
      destructive
      confirmDisabled={submitting || !armed}
      onConfirm={() => void performDelete()}
      onCancel={cancel}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor="delete-account-confirm">
          {hasPassword
            ? t('auth.deleteConfirm.passwordLabel')
            : t('auth.deleteConfirm.wordLabel', { word: confirmWord })}
        </label>
        <Input
          id="delete-account-confirm"
          type={hasPassword ? 'password' : 'text'}
          autoComplete={hasPassword ? 'current-password' : 'off'}
          autoCapitalize={hasPassword ? undefined : 'characters'}
          spellCheck={false}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </ConfirmDialog>
  )

  return { requestDelete, dialog }
}
