import { useCallback, useEffect, useRef, useState } from 'react'

import { ANALYTICS_EVENTS, trackEvents } from '@/analytics'
import ApiError from '@/api/apiError'
import { useScrapbookStore } from '@/store/useScrapbookStore'

import {
  FinishCancelled,
  renderScrapbookFiles,
  uploadFinishedScrapbook,
  type FinishProgress,
} from './finish'
import { useFinishChannel } from './useFinishChannel'

/**
 * How a finish ended. `changed` — the content kept moving under it (edited elsewhere twice
 * running); `unsaved` — the latest edits couldn't be saved, so there was nothing safe to
 * render from.
 */
export type FinishOutcome = 'done' | 'cancelled' | 'changed' | 'unsaved' | 'failed'

/**
 * Finish the open scrapbook (docs/PLAN-scrapbook.md §7):
 *
 * 1. **Freeze, then save and wait.** A debounced autosave still pending would land mid-finish
 *    and be refused as `content_changed` — the user's own last keystroke failing their
 *    finish. The PDF is rendered from exactly what that save confirmed.
 * 2. Tell the browser's other tabs (`useFinishChannel`), which freeze too.
 * 3. **Render** every page from the strips' clean copies, then **upload**, checking before
 *    any retry whether the last attempt landed (`uploadFinishedScrapbook`).
 * 4. On `content_changed` — an edit from another device — re-read the content and render
 *    again, **once**. A second one in a row stops and hands back to the user rather than
 *    looping.
 *
 * Cancelling works while pages render; once the upload starts it runs to the end.
 */
export function useScrapbookFinish(scrapbookId: string | undefined) {
  const { otherTabFinishing, announceStart, announceEnd } = useFinishChannel(scrapbookId)
  const [progress, setProgress] = useState<FinishProgress | null>(null)
  const controller = useRef<AbortController | null>(null)

  // Leaving the page mid-render stops the render; nothing has been uploaded yet.
  useEffect(() => () => controller.current?.abort(), [])

  const finish = useCallback(async (): Promise<FinishOutcome> => {
    const store = useScrapbookStore.getState
    if (!scrapbookId || controller.current) return 'failed'
    const abort = new AbortController()
    controller.current = abort
    let finished = false
    const startedAt = performance.now()
    announceStart()
    /** Report how it ended, and hand the outcome back. */
    const ended = (outcome: FinishOutcome): FinishOutcome => {
      if (outcome !== 'done')
        trackEvents(ANALYTICS_EVENTS.SCRAPBOOK_FINISH_FAILED, { code: outcome })
      return outcome
    }
    try {
      for (let round = 0; round < 2; round++) {
        setProgress({ stage: 'saving' })
        // Frozen before saving, so nothing can be typed between the save and the render;
        // the save itself doesn't go through the edit path the freeze blocks.
        store().setFrozen(true)
        const saved = await store().flush()
        if (!saved) return ended('unsaved')
        const template = store().current?.template
        if (!template) return ended('failed')

        const files = await renderScrapbookFiles(template, saved.content, setProgress, abort.signal)
        setProgress({ stage: 'uploading' })
        try {
          const done = await uploadFinishedScrapbook(scrapbookId, files, saved.contentVersion)
          store().setFrozen(false)
          store().replaceCurrent(done)
          finished = true
          trackEvents(ANALYTICS_EVENTS.SCRAPBOOK_FINISHED, {
            pages: files.pageCount,
            // Places holding a strip — what the reader paid for, against the empty ones.
            filledStrips: Object.keys(saved.content.strips).length,
            ms: Math.round(performance.now() - startedAt),
            bytes: files.pdf.size,
          })
          return 'done'
        } catch (error) {
          if (!(error instanceof ApiError && error.code === 'content_changed')) throw error
          if (round === 1) return ended('changed')
          // Edited elsewhere since the render: take the server's content and go again.
          store().setFrozen(false)
          await store().open(scrapbookId)
        }
      }
      return ended('changed')
    } catch (error) {
      if (error instanceof FinishCancelled) return ended('cancelled')
      console.error('[scrapbooks] finish failed', error)
      return ended('failed')
    } finally {
      store().setFrozen(false)
      announceEnd(finished)
      setProgress(null)
      controller.current = null
    }
  }, [scrapbookId, announceStart, announceEnd])

  const cancel = useCallback(() => controller.current?.abort(), [])

  return { finish, cancel, progress, otherTabFinishing }
}
