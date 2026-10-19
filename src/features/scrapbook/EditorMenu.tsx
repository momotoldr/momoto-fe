import { Ellipsis } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import styles from './EditorMenu.module.scss'

export interface EditorMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

/**
 * The phone header's "…": the actions the desktop shows outright but a 390px header has
 * no room for — Delete on a draft; Keep editing and Delete once finished, Remove once paid.
 * Closes on a pick, Escape, or a tap anywhere else.
 */
export function EditorMenu({ items }: { items: EditorMenuItem[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (items.length === 0) return <span className={styles.spacer} aria-hidden="true" />

  return (
    <div ref={root} className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={t('scrapbook.editor.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Ellipsis />
      </button>
      {open && (
        <ul className={styles.menu} role="menu">
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={cn(styles.item, item.danger && styles.itemDanger)}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
