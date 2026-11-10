import { Download, Loader2, ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import type { Scrapbook } from '@/types/scrapbookType'

import { useScrapbookDownload } from './useScrapbookDownload'
import styles from './ViewerPanel.module.scss'

interface ViewerPanelProps {
  scrapbook: Scrapbook
  /** Which page-level action is running, so this panel's buttons wait for it too. */
  busy: boolean
  onKeepEditing: () => void
  onDiscard: () => void
}

/**
 * What a finished or paid scrapbook offers (docs/PLAN-scrapbook.md §6), in the desktop's
 * side panel. A phone puts the main action in its bottom bar and the rest in the header's
 * menu instead.
 *
 * **Finished:** it's waiting in the cart, where every payment happens (user decision,
 * 2026-10-17) — so this offers the way there, not an Unlock of its own. Keep editing stays
 * here; the server refuses it while a payment for the scrapbook is open
 * (`payment_in_progress`). **Paid:** Download, plus Remove.
 */
export function ViewerPanel({ scrapbook, busy, onKeepEditing, onDiscard }: ViewerPanelProps) {
  const { t } = useTranslation()
  const { download, downloading } = useScrapbookDownload(scrapbook)
  const paid = scrapbook.state === 'paid'
  const disabled = busy || downloading

  return (
    <div className={styles.panel}>
      <div className={cn(styles.note, paid ? styles.notePaid : styles.noteFinished)}>
        <span className={styles.noteHeading}>
          {t(paid ? 'scrapbook.viewer.paidHeading' : 'scrapbook.viewer.finishedHeading')}
        </span>
        <p className={styles.noteText}>
          {t(paid ? 'scrapbook.viewer.paid' : 'scrapbook.viewer.finished')}
        </p>
      </div>

      {paid ? (
        <button
          type="button"
          className={styles.primary}
          disabled={disabled}
          onClick={() => void download()}
        >
          {downloading ? <Loader2 className={styles.spin} /> : <Download />}
          {t(downloading ? 'scrapbook.viewer.downloading' : 'scrapbook.viewer.download')}
        </button>
      ) : (
        <>
          <Link to={ROUTES.cart} className={styles.primary}>
            <ShoppingBag />
            {t('scrapbook.viewer.goToCart')}
          </Link>
          <button
            type="button"
            className={styles.secondary}
            disabled={disabled}
            onClick={onKeepEditing}
          >
            {t('scrapbook.viewer.keepEditing')}
          </button>
        </>
      )}

      <div className={styles.more}>
        <button
          type="button"
          className={cn(styles.quiet, styles.danger)}
          disabled={disabled}
          onClick={onDiscard}
        >
          {t(paid ? 'scrapbook.viewer.remove' : 'scrapbook.viewer.delete')}
        </button>
      </div>
    </div>
  )
}
