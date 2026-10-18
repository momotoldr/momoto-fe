import { Download, Loader2, ShoppingBag } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { ANALYTICS_EVENTS, trackEvents } from '@/analytics'
import { fetchScrapbookPdf } from '@/api/services/scrapbooksService'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
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
 * **Finished:** it's waiting in the cart, where every payment happens (user decision,
 * 2026-10-17) — so this offers the way there, not an Unlock of its own. Keep editing stays
 * here; the server refuses it while a payment for the scrapbook is open
 * (`payment_in_progress`). **Paid:** Download, plus Duplicate and Remove.
 */
export function ViewerPanel({
  scrapbook,
  busy,
  onKeepEditing,
  onDuplicate,
  onDiscard,
}: ViewerPanelProps) {
  const { t } = useTranslation()
  const [downloading, setDownloading] = useState(false)
  const paid = scrapbook.state === 'paid'

  const download = useCallback(async () => {
    setDownloading(true)
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
      setDownloading(false)
    }
  }, [scrapbook, t])

  const disabled = busy || downloading

  return (
    <div className={styles.panel}>
      <p className={styles.text}>
        {t(paid ? 'scrapbook.viewer.paid' : 'scrapbook.viewer.finished')}
      </p>

      <div className={styles.actions}>
        {paid ? (
          <Button disabled={disabled} onClick={() => void download()}>
            {downloading ? <Loader2 className={styles.spin} /> : <Download />}
            {t(downloading ? 'scrapbook.viewer.downloading' : 'scrapbook.viewer.download')}
          </Button>
        ) : (
          <>
            <Button asChild>
              <Link to={ROUTES.cart}>
                <ShoppingBag />
                {t('scrapbook.viewer.goToCart')}
              </Link>
            </Button>
            <Button variant="outline" disabled={disabled} onClick={onKeepEditing}>
              {t('scrapbook.viewer.keepEditing')}
            </Button>
          </>
        )}
        <Button variant="outline" disabled={disabled} onClick={onDuplicate}>
          {t('scrapbook.viewer.duplicate')}
        </Button>
        <Button variant="ghost" className={styles.discard} disabled={disabled} onClick={onDiscard}>
          {t(paid ? 'scrapbook.viewer.remove' : 'scrapbook.viewer.delete')}
        </Button>
      </div>
    </div>
  )
}
