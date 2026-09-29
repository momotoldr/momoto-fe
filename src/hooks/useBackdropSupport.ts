import { useEffect, useState } from 'react'

import { useSegmenterStore } from '@/store/useSegmenterStore'
import { useStripStore } from '@/store/useStripStore'
import { checkBackdropSupport } from '@/utils/segmentation/segmenter'

export type BackdropSupport = 'checking' | 'supported' | 'unsupported'

/**
 * Whether this device may offer backdrops — the up-front check (`checkBackdropSupport`),
 * overridden by the worker if the segmenter still won't start on either GPU or CPU.
 *
 * On an unsupported device a backdrop that is already chosen — restored from a draft, or
 * picked before the worker found out — is put back to none, so the strip shows the
 * original cuts and Create isn't left waiting on work that will never finish.
 */
export function useBackdropSupport(): BackdropSupport {
  const [checked, setChecked] = useState<boolean | null>(null)
  const failed = useSegmenterStore((state) => state.phase === 'unsupported')

  useEffect(() => {
    let cancelled = false
    void checkBackdropSupport().then((ok) => {
      if (!cancelled) setChecked(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const support: BackdropSupport =
    failed || checked === false ? 'unsupported' : checked ? 'supported' : 'checking'

  useEffect(() => {
    if (support !== 'unsupported') return
    if (useStripStore.getState().backdrop !== 'none') useStripStore.getState().setBackdrop('none')
  }, [support])

  return support
}
