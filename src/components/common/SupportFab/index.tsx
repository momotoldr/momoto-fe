import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, MessageCircle, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { submitFeedback } from '@/api/services/feedbackService'
import { RhfEmailField, RhfTextareaField } from '@/components/formFields/reactHookFormFields'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/useAuthStore'
import { supportSchema, type SupportValues } from '@/validations'

import { OPEN_SUPPORT_EVENT } from './openSupport'
import styles from './SupportFab.module.scss'

/**
 * A floating action button pinned to the bottom-right corner that opens a support
 * request. Available app-wide (mounted in RootLayout), works signed-in or anonymous;
 * submissions go to `POST /feedback` as the `support` category. Built on
 * react-hook-form + the centralized form fields / zod schema (`@/validations`).
 *
 * Support only: this is the "something's wrong" channel, so a reply-to email is
 * required. Unprompted opinions are collected as a star rating on the strip result
 * screen (`StripRating`) instead — beside the strip that earned it, rather than from a
 * button someone has to go looking for.
 */
export function SupportFab() {
  const { t } = useTranslation()
  const location = useLocation()
  const userEmail = useAuthStore((state) => state.user?.email)
  const inRoom = location.pathname.startsWith('/room/')

  const [open, setOpen] = useState(false)

  const methods = useForm<SupportValues>({
    resolver: zodResolver(supportSchema),
    defaultValues: { message: '', email: '' },
  })
  const {
    handleSubmit,
    reset,
    setFocus,
    formState: { isSubmitting },
  } = methods

  const openDialog = () => {
    // Fresh form each open, with the reply-to prefilled from the account (if any).
    reset({ message: '', email: userEmail ?? '' })
    setOpen(true)
  }

  const closeDialog = () => {
    if (isSubmitting) return
    setOpen(false)
  }

  // Let anything on the page open the dialog (the Help Center's contact card does).
  // The handler goes through a ref so the listener binds once, while still calling the
  // current `openDialog` — which closes over `reset` and the account's email, both of
  // which change identity between renders.
  const openRef = useRef(openDialog)
  openRef.current = openDialog
  useEffect(() => {
    const onOpen = () => openRef.current()
    window.addEventListener(OPEN_SUPPORT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDialog()
    }
    document.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setFocus('message')

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
    // `closeDialog` / `setFocus` are stable enough; only re-run on the open toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = async (values: SupportValues) => {
    try {
      await submitFeedback({
        category: 'support',
        message: values.message,
        email: values.email,
        context: location.pathname,
      })
      toast.success(t('support.success'))
      setOpen(false)
    } catch {
      toast.error(t('support.error'))
    }
  }

  // The booth pins its own action bar to the bottom of the phone viewport, which is
  // exactly where the FAB lives. A session in trouble isn't left stranded: it runs
  // five minutes, and the button is back the moment the room is done.
  if (inRoom) return null

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={openDialog}
        aria-label={t('support.open')}
        title={t('support.open')}
      >
        <MessageCircle />
      </button>

      {open &&
        createPortal(
          <div className={styles.overlay} onClick={closeDialog}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="support-title"
              className={styles.dialog}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={styles.close}
                onClick={closeDialog}
                aria-label={t('support.cancel')}
              >
                <X />
              </button>

              <h2 id="support-title" className={styles.title}>
                {t('support.title')}
              </h2>
              <p className={styles.subtitle}>{t('support.subtitle')}</p>

              <FormProvider {...methods}>
                <form
                  className={styles.form}
                  noValidate
                  onSubmit={(e) => void handleSubmit(onSubmit)(e)}
                >
                  <RhfTextareaField
                    name="message"
                    label="support.messageLabel"
                    placeholder={t('support.messagePlaceholder')}
                    rows={4}
                    maxLength={4000}
                    required
                  />

                  <div className={styles.emailGroup}>
                    <RhfEmailField
                      name="email"
                      // A support request with no way back to the person is a dead end,
                      // so the reply-to is required.
                      label="support.emailLabel"
                      placeholder={t('support.emailPlaceholder')}
                      required
                    />
                    <span className={styles.hint}>{t('support.emailHint')}</span>
                  </div>

                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeDialog}
                      disabled={isSubmitting}
                    >
                      {t('support.cancel')}
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className={styles.btnSpinner} /> : <Send />}
                      {isSubmitting ? t('support.sending') : t('support.submit')}
                    </Button>
                  </div>
                </form>
              </FormProvider>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
