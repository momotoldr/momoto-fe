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
}

/**
 * Every page as a live thumbnail, in book order — the desktop's way between pages. Each is
 * the same `ScrapbookPageView` at rail size, so a strip placed on the page shows here at
 * once. Phones use the pager under the page instead; this rail is hidden there.
 */
export function PageRail({ template, content, strips, missing, current, onSelect }: PageRailProps) {
  const { t } = useTranslation()
  return (
    <nav className={styles.rail} aria-label={t('scrapbook.editor.pages')}>
      {template.pages.map((page, index) => (
        <button
          key={page.id}
          type="button"
          className={cn(styles.item, index === current && styles.itemActive)}
          aria-current={index === current ? 'page' : undefined}
          onClick={() => onSelect(index)}
        >
          <ScrapbookPageView
            template={template}
            page={page}
            content={content}
            strips={strips}
            missing={missing}
            mode="thumb"
          />
          <span className={styles.label}>{pageLabel(page, index, t)}</span>
        </button>
      ))}
    </nav>
  )
}
