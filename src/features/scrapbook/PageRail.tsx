import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ScrapbookTemplate } from '@/constants/scrapbookTemplates'
import { cn } from '@/lib/utils'
import type { ScrapbookContent } from '@/types/scrapbookType'
import type { StoredStrip } from '@/types/stripType'

import { pageLabel } from './pageLabel'
import { ScrapbookPageView } from './ScrapbookPageView'
import styles from './PageRail.module.scss'

interface PageRailProps {
  template: ScrapbookTemplate
  content: ScrapbookContent
  strips: Record<string, StoredStrip>
  missing: ReadonlySet<string>
  current: number
  onSelect: (index: number) => void
  /**
   * Empty strip places per page, in page order — drawn as a badge on each page that has
   * places at all (a tick once they're filled). Only while editing a draft.
   */
  emptyByPage?: number[]
}

/**
 * Every page as a live thumbnail, in book order — the desktop's way between pages. Each is
 * the same `ScrapbookPageView` at rail size, so a strip placed on the page shows here at
 * once, and the badge says how many places each page still needs before Finish unlocks.
 * Phones use the pager under the page instead; this rail is hidden there.
 */
export function PageRail({
  template,
  content,
  strips,
  missing,
  current,
  onSelect,
  emptyByPage,
}: PageRailProps) {
  const { t } = useTranslation()
  return (
    <nav className={styles.rail} aria-label={t('scrapbook.editor.pages')}>
      {template.pages.map((page, index) => {
        const empty = emptyByPage?.[index] ?? 0
        const badge = emptyByPage !== undefined && page.strips.length > 0
        return (
          <button
            key={page.id}
            type="button"
            className={cn(styles.item, index === current && styles.itemActive)}
            aria-current={index === current ? 'page' : undefined}
            onClick={() => onSelect(index)}
          >
            <span className={styles.frame}>
              <ScrapbookPageView
                template={template}
                page={page}
                content={content}
                strips={strips}
                missing={missing}
                mode="thumb"
              />
              {badge && (
                <span className={cn(styles.badge, empty === 0 && styles.badgeDone)}>
                  <span aria-hidden="true">{empty > 0 ? empty : <Check />}</span>
                  <span className={styles.srOnly}>
                    {empty > 0
                      ? t('scrapbook.editor.placesLeftOnPage', { count: empty })
                      : t('scrapbook.editor.pageDone')}
                  </span>
                </span>
              )}
            </span>
            <span className={styles.label}>{pageLabel(page, index, t)}</span>
          </button>
        )
      })}
    </nav>
  )
}
