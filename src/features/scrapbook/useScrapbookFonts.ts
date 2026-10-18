import { useEffect, useState } from 'react'

import { loadScrapbookFonts } from '@/utils/scrapbook/layoutText'

/**
 * Whether the scrapbook's fonts are ready to measure with. Text is only laid out once this
 * is true: measured against the fallback face, lines would break in different places than
 * the PDF draws them (`layoutScrapbookText`).
 */
export function useScrapbookFonts(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    void loadScrapbookFonts().then(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])
  return ready
}
