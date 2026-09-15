import { CheckCircle2, Download, ExternalLink, Loader2, QrCode, TimerOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchQrBlob } from '@/api/services/paymentsService'
import { Button } from '@/components/ui/button'
import { extensionForBlob, saveImageBlob } from '@/utils/download'
import { formatIdr } from '@/features/profile/profileData'
import type { PaymentAttempt, PaymentMethod } from '@/types/stripType'
import { PAYMENT_METHODS } from '@/types/stripType'

import type { CheckoutPhase } from './useCheckout'
import { useCountdown } from './useCountdown'
import styles from './CheckoutModal.module.scss'

interface CheckoutModalProps {
  phase: CheckoutPhase
  attempt: PaymentAttempt | null
  /** Strips this checkout covers — drives the header count before an attempt exists. */
  count: number
  /** Total in whole rupiah, shown before charging (the server recomputes it anyway). */
  grossAmount: number
  onChoose: (method: PaymentMethod) => void
  onClose: () => void
}

/**
 * Our own checkout, replacing the hosted Midtrans popup.
 *
 * Which artifact to show is decided by what the charge returned, not by the method
 * name: QRIS comes back QR-only, ShopeePay deeplink-only, GoPay with both. A device
 * with a coarse pointer leads with the deeplink, because nobody can scan the screen
 * they are holding.
 */
export function CheckoutModal({
  phase,
  attempt,
  count,
  grossAmount,
  onChoose,
  onClose,
}: CheckoutModalProps) {
  const { t } = useTranslation()
  const countdown = useCountdown(attempt?.expiresAt ?? null)
  const [savingQr, setSavingQr] = useState(false)

  /**
   * Hand the QR over as a file — for paying from another device, or passing it to
   * whoever is actually settling the bill.
   */
  const saveQr = async () => {
    if (!attempt) return
    setSavingQr(true)
    try {
      const blob = await fetchQrBlob(attempt.orderId)
      // `unsupported` means the browser has no route to a file at all — the iOS engines
      // that ignore `download` and cannot reach a share sheet. Silence there looks
      // exactly like a broken button, so name the way out.
      const saved = await saveImageBlob(
        blob,
        `momoto-qris-${attempt.orderId}.${extensionForBlob(blob)}`
      )
      if (saved === 'unsupported') toast.info(t('common.pressAndHoldToSave'))
    } catch {
      toast.error(t('checkout.qrSaveError'))
    } finally {
      setSavingQr(false)
    }
  }

  useEffect(() => {
    if (phase === 'closed') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [phase, onClose])

  if (phase === 'closed') return null

  const touchFirst = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const total = attempt?.grossAmount ?? grossAmount
  const strips = attempt?.count ?? count

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('checkout.title')}
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>{t('checkout.title')}</h2>
            <p className={styles.subtitle}>
              {t('checkout.summary', { count: strips, total: formatIdr(total) })}
            </p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X />
          </button>
        </div>

        {phase === 'method' && (
          <div className={styles.methods}>
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                className={styles.method}
                onClick={() => onChoose(method)}
              >
                <QrCode className={styles.methodIcon} />
                <span className={styles.methodName}>{t(`checkout.method.${method}`)}</span>
              </button>
            ))}
          </div>
        )}

        {phase === 'charging' && (
          <div className={styles.centred}>
            <Loader2 className={styles.spinner} />
            <p className={styles.message}>{t('checkout.charging')}</p>
          </div>
        )}

        {phase === 'awaiting' && attempt && (
          <div className={styles.awaiting}>
            {attempt.deeplinkUrl && touchFirst && (
              <Button asChild className={styles.deeplink}>
                <a href={attempt.deeplinkUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  {t('checkout.openApp')}
                </a>
              </Button>
            )}

            {attempt.qrImageUrl && (
              <>
                <img className={styles.qr} src={attempt.qrImageUrl} alt={t('checkout.qrAlt')} />
                <p className={styles.message}>{t('checkout.scan')}</p>
                <button
                  type="button"
                  className={styles.saveQr}
                  onClick={() => void saveQr()}
                  disabled={savingQr}
                >
                  {savingQr ? (
                    <Loader2 className={styles.spinnerSmall} />
                  ) : (
                    <Download className={styles.saveQrIcon} />
                  )}
                  {t('checkout.saveQr')}
                </button>
              </>
            )}

            {attempt.deeplinkUrl && !touchFirst && (
              <a
                className={styles.deeplinkText}
                href={attempt.deeplinkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('checkout.openApp')}
              </a>
            )}

            <div className={styles.waiting}>
              <Loader2 className={styles.spinnerSmall} />
              <span>{t('checkout.waiting')}</span>
            </div>

            {countdown && (
              <p className={styles.countdown}>{t('checkout.expiresIn', { countdown })}</p>
            )}
          </div>
        )}

        {phase === 'paid' && (
          <div className={styles.centred}>
            <CheckCircle2 className={styles.success} />
            <p className={styles.message}>{t('payment.success')}</p>
            <Button onClick={onClose}>{t('common.close')}</Button>
          </div>
        )}

        {(phase === 'failed' || phase === 'expired') && (
          <div className={styles.centred}>
            <TimerOff className={styles.failure} />
            <p className={styles.message}>
              {phase === 'expired' ? t('checkout.expired') : t('payment.failed')}
            </p>
            <Button onClick={onClose}>{t('common.close')}</Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
