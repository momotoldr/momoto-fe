import { Download, Instagram, Loader2, Share2, X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'

import styles from './ShareStripDialog.module.scss'

interface ShareStripDialogProps {
  open: boolean
  status: 'loading' | 'ready' | 'error'
  imageUrl: string | null
  /** Whether the Web Share API can share the image (native share sheet). */
  canShare: boolean
  onInstagram: () => void
  onShare: () => void
  onDownload: () => void
  onClose: () => void
}

/** Preview of the shareable strip card with Instagram / share / download actions. */
export function ShareStripDialog({
  open,
  status,
  imageUrl,
  canShare,
  onInstagram,
  onShare,
  onDownload,
  onClose,
}: ShareStripDialogProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
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
  }, [open, onClose])

  if (!open) return null

  const ready = status === 'ready'

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('result.shareTitle')}
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 className={styles.title}>{t('result.shareTitle')}</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X />
          </button>
        </div>

        <div className={styles.preview}>
          {ready && imageUrl ? (
            <img src={imageUrl} alt={t('result.shareAlt')} className={styles.image} />
          ) : status === 'error' ? (
            <p className={styles.message}>{t('result.composeError')}</p>
          ) : (
            <Loader2 className={styles.spinner} />
          )}
        </div>

        <div className={styles.actions}>
          <Button className={styles.instagram} onClick={onInstagram} disabled={!ready}>
            <Instagram /> {t('result.shareInstagram')}
          </Button>
          {/* Side by side: the native sheet and the plain download are alternatives to
           * each other, not steps after Instagram. With no sheet to offer, the
           * download takes the row on its own. */}
          <div className={styles.actionRow}>
            {canShare && (
              <Button
                variant="outline"
                className={styles.action}
                onClick={onShare}
                disabled={!ready}
              >
                <Share2 /> {t('result.share')}
              </Button>
            )}
            <Button
              variant="outline"
              className={styles.action}
              onClick={onDownload}
              disabled={!ready}
            >
              <Download /> {t('result.download')}
            </Button>
          </div>
        </div>

        {!canShare && <p className={styles.hint}>{t('result.instagramHint')}</p>}
      </div>
    </div>,
    document.body
  )
}
