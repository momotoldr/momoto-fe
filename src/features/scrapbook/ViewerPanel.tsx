import { Download, Loader2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ANALYTICS_EVENTS, trackEvents } from '@/analytics'
import { fetchScrapbookPdf, unlockScrapbook } from '@/api/services/scrapbooksService'
import { Button } from '@/components/ui/button'
import { env } from '@/env'
import { CheckoutModal } from '@/features/checkout/CheckoutModal'
import { useCheckout } from '@/features/checkout/useCheckout'
import { formatIdr } from '@/features/profile/profileData'
import { useScrapbookStore } from '@/store/useScrapbookStore'
import type { Scrapbook } from '@/types/scrapbookType'
import { saveImageBlob } from '@/utils/download'

import styles from './ViewerPanel.module.scss'

interface ViewerPanelProps {
  scrapbook: Scrapbook
  /** Which page-level action is running, so this panel's buttons wait for it too. */
  busy: boolean
  onKeepEditing: () => void
  onDuplicate: () => void
  onDiscard: () => void
}

/** The PDF's file name, from the scrapbook's name — the server's own rule (`slugOf`). */
function pdfFileName(scrapbook: Scrapbook): string {
  const slug = scrapbook.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return `momoto-scrapbook-${slug || scrapbook.id}.pdf`
}

/**
 * What a finished or paid scrapbook offers (docs/PLAN-scrapbook.md §6).
 *
 * **Finished:** Unlock — checkout while payments are live, the free unlock while they're
 * dark (*checkout-behind-flag*) — and Keep editing, which is refused while a payment for it
 * is open (the server would answer `payment_in_progress`). **Paid:** Download, plus
 * Duplicate and Remove. A payment opened earlier and walked away from is picked up and
 * offered to resume, as the cart does for strips.
 */
export function ViewerPanel({
  scrapbook,
  busy,
  onKeepEditing,
  onDuplicate,
  onDiscard,
}: ViewerPanelProps) {
  const { t } = useTranslation()
  const replaceCurrent = useScrapbookStore((state) => state.replaceCurrent)
  const open = useScrapbookStore((state) => state.open)
  const [working, setWorking] = useState<'unlock' | 'download' | null>(null)
  const paid = scrapbook.state === 'paid'
  const price = env.scrapbookPriceIdr

  const checkout = useCheckout(
    async (wasVisible) => {
      // Settled: the server has flipped it to paid; take its word for the new state.
      await open(scrapbook.id)
      if (!wasVisible) toast.success(t('scrapbook.viewer.paidToast'))
    },
    { kind: 'scrapbook', scrapbookId: scrapbook.id }
  )

  const unlock = useCallback(async () => {
    trackEvents(ANALYTICS_EVENTS.UNLOCK_CLICKED, {
      paymentsEnabled: env.paymentsEnabled,
      item: 'scrapbook',
    })
    if (env.paymentsEnabled) {
      checkout.open()
      return
    }
    setWorking('unlock')
    try {
      replaceCurrent(await unlockScrapbook(scrapbook.id))
      toast.success(t('scrapbook.viewer.unlocked'))
    } catch {
      toast.error(t('scrapbook.viewer.unlockError'))
    } finally {
      setWorking(null)
    }
  }, [checkout, replaceCurrent, scrapbook.id, t])

  const download = useCallback(async () => {
    setWorking('download')
    try {
      const saved = await saveImageBlob(
        await fetchScrapbookPdf(scrapbook.id),
        pdfFileName(scrapbook)
      )
      if (saved === 'unsupported') toast.error(t('scrapbook.viewer.downloadError'))
      else if (saved !== 'cancelled') trackEvents(ANALYTICS_EVENTS.SCRAPBOOK_DOWNLOADED)
    } catch {
      toast.error(t('scrapbook.viewer.downloadError'))
    } finally {
      setWorking(null)
    }
  }, [scrapbook, t])

  const disabled = busy || working !== null
  const paying = checkout.liveAttempt !== null

  return (
    <div className={styles.panel}>
      <p className={styles.text}>
        {t(paid ? 'scrapbook.viewer.paid' : 'scrapbook.viewer.finished')}
      </p>

      {paying && !paid && (
        <div className={styles.pending}>
          <span>
            {t('scrapbook.viewer.paymentPending', {
              total: formatIdr(checkout.liveAttempt?.grossAmount ?? 0),
            })}
          </span>
          <Button size="sm" variant="outline" onClick={checkout.reopen}>
            {t('scrapbook.viewer.resume')}
          </Button>
        </div>
      )}

      <div className={styles.actions}>
        {paid ? (
          <Button disabled={disabled} onClick={() => void download()}>
            {working === 'download' ? <Loader2 className={styles.spin} /> : <Download />}
            {t(
              working === 'download' ? 'scrapbook.viewer.downloading' : 'scrapbook.viewer.download'
            )}
          </Button>
        ) : (
          !paying && (
            <Button disabled={disabled} onClick={() => void unlock()}>
              {working === 'unlock' && <Loader2 className={styles.spin} />}
              {working === 'unlock'
                ? t('scrapbook.viewer.unlocking')
                : env.paymentsEnabled && price !== null
                  ? t('scrapbook.viewer.unlockPrice', { price: formatIdr(price) })
                  : t('scrapbook.viewer.unlock')}
            </Button>
          )
        )}
        {!paid && !paying && (
          <Button variant="outline" disabled={disabled} onClick={onKeepEditing}>
            {t('scrapbook.viewer.keepEditing')}
          </Button>
        )}
        <Button variant="outline" disabled={disabled} onClick={onDuplicate}>
          {t('scrapbook.viewer.duplicate')}
        </Button>
        <Button
          variant="ghost"
          className={styles.discard}
          disabled={disabled || paying}
          onClick={onDiscard}
        >
          {t(paid ? 'scrapbook.viewer.remove' : 'scrapbook.viewer.delete')}
        </Button>
      </div>

      <CheckoutModal
        kind="scrapbook"
        phase={checkout.phase}
        attempt={checkout.attempt}
        count={0}
        grossAmount={price}
        onChoose={(method) => void checkout.choose(method)}
        onClose={checkout.close}
      />
    </div>
  )
}
