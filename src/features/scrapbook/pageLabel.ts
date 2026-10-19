import type { TFunction } from 'i18next'

import type { ScrapbookPage } from '@/constants/scrapbookTemplates'

/** "Cover", "Back cover", or "Page n" for an inner page (the cover is not page 1). */
export function pageLabel(page: ScrapbookPage, index: number, t: TFunction): string {
  if (page.id === 'cover') return t('scrapbook.editor.pageCover')
  if (page.id === 'back') return t('scrapbook.editor.pageBack')
  return t('scrapbook.editor.pageN', { n: index })
}
