import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ScrapbookPage } from '@/constants/scrapbookTemplates'
import { cn } from '@/lib/utils'
import type { ScrapbookContent } from '@/types/scrapbookType'
import type { StoredStrip } from '@/types/stripType'

import type { ScrapbookSelection } from './ScrapbookPageView'
import styles from './PageChecklist.module.scss'

interface PageChecklistProps {
  page: ScrapbookPage
  /** "Cover", "Page 2"… */
  label: string
  content: ScrapbookContent
  strips: Record<string, StoredStrip>
  missing: ReadonlySet<string>
  onSelect: (selection: ScrapbookSelection) => void
}

/**
 * The side panel with nothing picked: every place on the current page, strips first, each
 * saying whether it's filled — strips are required to finish, text isn't. A row opens that
 * place, the same as tapping it on the page.
 */
export function PageChecklist({
  page,
  label,
  content,
  strips,
  missing,
  onSelect,
}: PageChecklistProps) {
  const { t, i18n } = useTranslation()

  const stripRows = page.strips.map((slot) => {
    const stripId = content.strips[slot.id]
    const strip = stripId && !missing.has(stripId) ? strips[stripId] : undefined
    const removed = !!stripId && !strip
    return {
      kind: 'strip' as const,
      id: slot.id,
      name: t(`scrapbook.editor.stripName_${slot.layout}`),
      sub: strip
        ? t('scrapbook.tray.stripAlt', {
            date: new Date(strip.createdAt).toLocaleDateString(i18n.language, {
              day: 'numeric',
              month: 'short',
            }),
          })
        : removed
          ? t('scrapbook.editor.stripRemoved')
          : t('scrapbook.editor.empty'),
      done: !!strip,
      tag: strip ? null : t('scrapbook.editor.required'),
    }
  })
  const textRows = page.texts.map((slot) => {
    const text = content.texts[slot.id]?.trim()
    return {
      kind: 'text' as const,
      id: slot.id,
      name: t(`scrapbook.text.label_${slot.placeholder}`),
      sub: text || t(`scrapbook.placeholders.${slot.placeholder}`),
      done: !!text,
      tag: t('scrapbook.editor.optional'),
    }
  })

  return (
    <div className={styles.checklist}>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>{t('scrapbook.editor.onThisPage')}</span>
        <h2 className={styles.title}>{label}</h2>
      </div>
      <ul className={styles.rows}>
        {[...stripRows, ...textRows].map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className={styles.row}
              onClick={() => onSelect({ kind: row.kind, id: row.id })}
            >
              <span className={cn(styles.dot, row.done && styles.dotDone)} aria-hidden="true">
                {row.done && <Check />}
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{row.name}</span>
                <span className={styles.sub}>{row.sub}</span>
              </span>
              {row.tag && (
                <span className={cn(styles.tag, row.kind === 'strip' && styles.tagRequired)}>
                  {row.tag}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>{t('scrapbook.editor.checklistHint')}</p>
    </div>
  )
}
