import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  QrCode,
  TimerOff,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchQrBlob } from '@/api/services/paymentsService'
import { openSupportDialog } from '@/components/common/SupportFab/openSupport'
import { Button } from '@/components/ui/button'
import { extensionForBlob, saveImageBlob } from '@/utils/download'
import { formatIdr } from '@/features/profile/profileData'
import type { PaymentAttempt, PaymentMethod } from '@/types/stripType'

import type { CheckoutPhase } from './useCheckout'
import { useCountdown } from './useCountdown'
import styles from './CheckoutModal.module.scss'

interface CheckoutModalProps {
  phase: CheckoutPhase
  attempt: PaymentAttempt | null
  /**
   * How many strips and scrapbooks this checkout covers — the header's count before an
   * attempt exists (an attempt then speaks for itself).
   */
  strips: number
  scrapbooks: number
  /**
   * Total in whole rupiah, shown before charging (the server recomputes it anyway). Null
   * when the client doesn't know a price yet — the header then shows no total until the
   * charge returns the real one.
   */
  grossAmount: number | null
  /**
   * What each method adds as its admin fee, shown on its button. Null while unknown —
   * the buttons then show none, and the charge's total includes it anyway.
   */
  adminFees: Partial<Record<PaymentMethod, number>> | null
  /** The channels to offer, in order — the ones switched on in core. */
  methods: readonly PaymentMethod[]
  /**
   * The promos that priced it (docs/PLAN-promos.md), each already gated on its UI flag:
   * shown as tags under the total.
   */
  promo: { bogo: boolean; bundled: number }
  onChoose: (method: PaymentMethod) => void
  /**
   * "Check payment status": ask the server to check with Midtrans (settling the order if the money
   * is there). Resolves whether it's paid now; rejects if the check failed.
   */
  onCheckPaid: () => Promise<boolean>
  /**
   * Cancel the running attempt. The hook takes the checkout back to the method picker
   * (or to paid, if Midtrans already had the money); rejects if the cancel failed.
   */
  onCancel: () => Promise<void>
  onClose: () => void
}

/** Where the payment-status check is, for one attempt. */
type PaidCheck = 'idle' | 'checking' | 'unpaid'

/** Where cancelling is, for one attempt: asked once inline before anything is sent. */
type Cancelling = 'idle' | 'confirm' | 'cancelling'

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
  strips,
  scrapbooks,
  grossAmount,
  adminFees,
  methods,
  promo,
  onChoose,
  onCheckPaid,
  onCancel,
  onClose,
}: CheckoutModalProps) {
  const { t } = useTranslation()
  const countdown = useCountdown(attempt?.expiresAt ?? null)
  const [savingQr, setSavingQr] = useState(false)
  // Keyed by order, so a new attempt starts back at the status check without an effect.
  const [paidCheckFor, setPaidCheckFor] = useState<{ orderId: string; state: PaidCheck }>({
    orderId: '',
    state: 'idle',
  })
  const paidCheck: PaidCheck =
    attempt && paidCheckFor.orderId === attempt.orderId ? paidCheckFor.state : 'idle'
  const [cancelFor, setCancelFor] = useState<{ orderId: string; state: Cancelling }>({
    orderId: '',
    state: 'idle',
  })
  const cancelling: Cancelling =
    attempt && cancelFor.orderId === attempt.orderId ? cancelFor.state : 'idle'

  /** Cancel once confirmed. On success the hook moves the checkout on by itself. */
  const confirmCancel = async () => {
    if (!attempt) return
    const orderId = attempt.orderId
    setCancelFor({ orderId, state: 'cancelling' })
    try {
      await onCancel()
    } catch {
      toast.error(t('checkout.cancelError'))
      setCancelFor({ orderId, state: 'idle' })
    }
  }

  /**
   * Ask the server to check with Midtrans. Paid → the checkout moves on by itself (the
   * hook takes in the settled order). Not paid → only now is reporting offered: a report
   * is for money that left the buyer but hasn't reached us (user, 2026-11-02).
   */
  const checkPaid = async () => {
    if (!attempt) return
    const orderId = attempt.orderId
    setPaidCheckFor({ orderId, state: 'checking' })
    try {
      const paid = await onCheckPaid()
      if (!paid) setPaidCheckFor({ orderId, state: 'unpaid' })
    } catch {
      toast.error(t('checkout.paidCheckError'))
      setPaidCheckFor({ orderId, state: 'idle' })
    }
  }

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

  /**
   * Hand a payment problem to support, on the payment topic with the order number
   * already in the message — the one thing an admin needs to find it. The checkout
   * closes first so the two dialogs never stack; that doesn't abandon the payment (the
   * QR stays payable and the cart banner reopens it).
   */
  const reportProblem = () => {
    onClose()
    openSupportDialog(
      'payment',
      attempt ? t('checkout.reportMessage', { orderId: attempt.orderId }) : undefined
    )
  }

  const report = (
    <div className={styles.report}>
      <p className={styles.reportNote}>
        <AlertCircle className={styles.reportIcon} />
        <span>
          {t(paidCheck === 'unpaid' ? 'checkout.paidCheckUnpaid' : 'checkout.paidCheckNote')}
        </span>
      </p>
      {/* One row, two equal halves: keep the payment going (check, or report once the
       * check says unpaid) | give it up. Labels may wrap inside, so it holds on phones. */}
      <div className={styles.reportActions}>
        {paidCheck === 'unpaid' ? (
          <Button size="sm" className={styles.actionButton} onClick={reportProblem}>
            {t('checkout.reportButton')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className={styles.actionButton}
            onClick={() => void checkPaid()}
            disabled={paidCheck === 'checking'}
          >
            {paidCheck === 'checking' && <Loader2 className={styles.spinnerSmall} />}
            {t(paidCheck === 'checking' ? 'checkout.paidChecking' : 'checkout.paidCheckButton')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={styles.cancelAction}
          onClick={() => attempt && setCancelFor({ orderId: attempt.orderId, state: 'confirm' })}
          disabled={cancelling !== 'idle'}
        >
          {t('checkout.cancelButton')}
        </Button>
      </div>
      {paidCheck === 'unpaid' && (
        <button type="button" className={styles.recheckButton} onClick={() => void checkPaid()}>
          {t('checkout.paidCheckRetry')}
        </button>
      )}
      {cancelling !== 'idle' && (
        <div className={styles.cancelConfirm}>
          <p className={styles.cancelConfirmText}>{t('checkout.cancelConfirm')}</p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => void confirmCancel()}
              disabled={cancelling === 'cancelling'}
            >
              {cancelling === 'cancelling' && <Loader2 className={styles.spinnerSmall} />}
              {t(cancelling === 'cancelling' ? 'checkout.cancelling' : 'checkout.cancelYes')}
            </button>
            {cancelling === 'confirm' && (
              <button
                type="button"
                className={styles.recheckButton}
                onClick={() => attempt && setCancelFor({ orderId: attempt.orderId, state: 'idle' })}
              >
                {t('checkout.cancelNo')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )

  // Whether some offered method charges an admin fee — only then is "no fee" news.
  const anyFee = methods.some((method) => (adminFees?.[method] ?? 0) > 0)

  const touchFirst = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const total = attempt?.grossAmount ?? grossAmount
  const stripCount = attempt?.stripIds.length ?? strips
  const scrapbookCount = attempt?.scrapbookIds.length ?? scrapbooks
  // "2 strips + 1 scrapbook" — only the kinds the order holds.
  const items = [
    stripCount > 0 && t('checkout.partStrips', { count: stripCount }),
    scrapbookCount > 0 && t('checkout.partScrapbooks', { count: scrapbookCount }),
  ]
    .filter(Boolean)
    .join(' + ')
  const success =
    scrapbookCount === 0
      ? 'payment.success'
      : stripCount === 0
        ? 'checkout.successScrapbook'
        : 'checkout.successMixed'

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
              {total === null ? items : t('checkout.summary', { items, total: formatIdr(total) })}
            </p>
            {(promo.bogo || promo.bundled > 0) && (
              <p className={styles.promoTags}>
                {promo.bogo && <span className={styles.promoTagRose}>{t('promos.tagBogo')}</span>}
                {promo.bundled > 0 && (
                  <span className={styles.promoTagMint}>{t('promos.tagBundle')}</span>
                )}
              </p>
            )}
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
            {methods.map((method) => (
              <button
                key={method}
                type="button"
                className={styles.method}
                onClick={() => onChoose(method)}
              >
                <QrCode className={styles.methodIcon} />
                <span className={styles.methodName}>{t(`checkout.method.${method}`)}</span>
                {(adminFees?.[method] ?? 0) > 0 ? (
                  <span className={styles.methodFee}>
                    {t('checkout.adminFee', { fee: formatIdr(adminFees?.[method] ?? 0) })}
                  </span>
                ) : (
                  // A known zero beside a method that does charge one: worth saying.
                  anyFee &&
                  adminFees?.[method] === 0 && (
                    <span className={styles.methodFeeFree}>{t('checkout.noAdminFee')}</span>
                  )
                )}
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

            {report}
          </div>
        )}

        {phase === 'paid' && (
          <div className={styles.centred}>
            <CheckCircle2 className={styles.success} />
            <p className={styles.message}>{t(success)}</p>
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
