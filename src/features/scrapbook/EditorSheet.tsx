import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import styles from './EditorSheet.module.scss'

interface EditorSheetProps {
  title: string
  children: ReactNode
  /** Done, the backdrop and Escape. Omitted while the sheet can't be left (a finish running). */
  onClose?: () => void
}

/**
 * The phone's side panel: a sheet over the bottom of the editor, opened by tapping a place
 * on the page (the strip tray or the text field) and while a finish runs. The page stays
 * visible, dimmed, above it — so a placed strip or typed caption shows at once.
 *
 * Replaces the strip pop-up of 2026-10-17: the "Scrapbook Editor - redesign" mockup
 * (2026-10-19) puts strips and text in the same sheet, with ribbons five across so a sheet
 * of them stays short.
 *
 * Above the app bar (z-50) as well as the support button (z-40), which sits where Done is:
 * the whole screen dims, the page included. Nothing opens a dialog while it's up. Locks the
 * page's scroll while open and hands focus back to whatever opened it.
 */
export function EditorSheet({ title, children, onClose }: EditorSheetProps) {
  const { t } = useTranslation()
  const doneRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  // Read on the first render, before any child's effect moves focus into the sheet.
  const openerRef = useRef(document.activeElement as HTMLElement | null)
  // Escape reads the latest `onClose` without re-running the effect (the caller passes a
  // fresh function each render) — the ConfirmDialog pattern.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const opener = openerRef.current
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // A text field focuses itself; anything else starts on Done.
    if (!sheetRef.current?.contains(document.activeElement)) {
      doneRef.current?.focus({ preventScroll: true })
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus?.({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div className={styles.layer}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={styles.sheet}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {onClose && (
            <button ref={doneRef} type="button" className={styles.done} onClick={onClose}>
              {t('scrapbook.editor.close')}
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
