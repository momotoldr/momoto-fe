import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import type { StripLayout } from '@/constants/stripTemplates'
import type { StoredStrip } from '@/types/stripType'

import { StripTray } from './StripTray'
import styles from './StripPickerModal.module.scss'

interface StripPickerModalProps {
  open: boolean
  layout: StripLayout
  currentStripId?: string
  onPick: (strip: StoredStrip) => void
  onClear?: () => void
  onClose: () => void
}

/**
 * The strip picker on a phone: a pop-up over the page rather than the bottom sheet (user
 * decision, 2026-10-17). A 4x1 strip is tall, so a sheet of them covered most of the page
 * and scrolled inside itself; a pop-up is clearly a choice to make and then leave. Picking
 * a strip (or taking one out) closes it. Desktop keeps the tray in its side column.
 *
 * Closes on Escape, the backdrop or the close button; locks the page's scroll while open,
 * and hands focus back to whatever opened it.
 */
export function StripPickerModal({
  open,
  layout,
  currentStripId,
  onPick,
  onClear,
  onClose,
}: StripPickerModalProps) {
  const { t } = useTranslation()
  const closeRef = useRef<HTMLButtonElement>(null)
  // Escape reads the latest `onClose` without re-running the effect (the caller passes a
  // fresh function each render) — the ConfirmDialog pattern.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(`scrapbook.tray.title_${layout}`)}
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          aria-label={t('common.close')}
          onClick={onClose}
        >
          <X />
        </button>
        <StripTray
          layout={layout}
          currentStripId={currentStripId}
          onPick={onPick}
          onClear={onClear}
        />
      </div>
    </div>,
    document.body
  )
}
