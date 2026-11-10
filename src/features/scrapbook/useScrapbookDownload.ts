import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ANALYTICS_EVENTS, trackEvents } from '@/analytics'
import { fetchScrapbookPdf } from '@/api/services/scrapbooksService'
import type { Scrapbook } from '@/types/scrapbookType'
import { saveImageBlob } from '@/utils/download'

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

/** Download a paid scrapbook's PDF — from the side panel, or the phone's bottom bar. */
export function useScrapbookDownload(scrapbook: Scrapbook) {
  const { t } = useTranslation()
  const [downloading, setDownloading] = useState(false)

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

  return { download, downloading }
}
