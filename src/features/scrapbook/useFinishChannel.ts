import { useCallback, useEffect, useRef, useState } from 'react'

import { useScrapbookStore } from '@/store/useScrapbookStore'

/**
 * Freezing other tabs while one finishes (docs/PLAN-scrapbook.md §7b).
 *
 * The tab that finishes says so over a `BroadcastChannel`; every other tab of the same
 * browser with that scrapbook open saves its own pending edit first, then stops editing and
 * says "Finishing in another tab…". If that saved edit landed after the render began, the
 * finishing tab gets `content_changed` and re-renders with it — so nothing typed is lost.
 *
 * This only reduces how often `content_changed` happens. It is not the guarantee: a second
 * *device* can't hear it, and the server's version check (plan §2b) is what holds. Nothing
 * here is stored on the server, so a finish that never ends can't leave a scrapbook stuck:
 * the heartbeat stops, and the other tabs let go after `STALE_MS`.
 */

const CHANNEL = 'momoto-scrapbook'
/** How often a finishing tab says it's still going. */
const HEARTBEAT_MS = 5_000
/** Silence this long means the finishing tab is gone (crashed, killed) without saying so. */
const STALE_MS = 15_000

type FinishMessage = { type: 'finishing' | 'finish-ended' | 'finished'; id: string }

export function useFinishChannel(scrapbookId: string | undefined) {
  const [otherTabFinishing, setOtherTabFinishing] = useState(false)
  // The same fact for the message handler, which must act once on the first `finishing`.
  const otherFinishing = useRef(false)
  const channel = useRef<BroadcastChannel | null>(null)
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null)
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Absent in very old browsers: the guard simply does nothing, and the server check holds.
    if (!scrapbookId || typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(CHANNEL)
    channel.current = bc
    const store = useScrapbookStore.getState

    /** Let go of the freeze and re-read: whatever the other tab did, the server knows. */
    const release = () => {
      if (staleTimer.current) clearTimeout(staleTimer.current)
      staleTimer.current = null
      otherFinishing.current = false
      setOtherTabFinishing(false)
      store().setFrozen(false)
      void store().open(scrapbookId)
    }

    bc.onmessage = (event: MessageEvent<FinishMessage>) => {
      const message = event.data
      if (!message || message.id !== scrapbookId) return
      if (message.type === 'finishing') {
        if (staleTimer.current) clearTimeout(staleTimer.current)
        staleTimer.current = setTimeout(release, STALE_MS)
        if (!otherFinishing.current) {
          otherFinishing.current = true
          setOtherTabFinishing(true)
          // Save this tab's pending edit *before* freezing, so it isn't stranded.
          void store()
            .flush()
            .finally(() => store().setFrozen(true))
        }
      } else {
        release()
      }
    }
    return () => {
      bc.close()
      channel.current = null
      if (staleTimer.current) clearTimeout(staleTimer.current)
    }
  }, [scrapbookId])

  const stopHeartbeat = useCallback(() => {
    if (heartbeat.current) clearInterval(heartbeat.current)
    heartbeat.current = null
  }, [])

  /** Say this tab started finishing, and keep saying so until `announceEnd`. */
  const announceStart = useCallback(() => {
    if (!scrapbookId) return
    const post = () => channel.current?.postMessage({ type: 'finishing', id: scrapbookId })
    post()
    stopHeartbeat()
    heartbeat.current = setInterval(post, HEARTBEAT_MS)
  }, [scrapbookId, stopHeartbeat])

  /** Say how this tab's finish ended. */
  const announceEnd = useCallback(
    (finished: boolean) => {
      stopHeartbeat()
      if (!scrapbookId) return
      channel.current?.postMessage({
        type: finished ? 'finished' : 'finish-ended',
        id: scrapbookId,
      })
    },
    [scrapbookId, stopHeartbeat]
  )

  // A tab closed mid-finish says so on its way out, rather than leaving the others waiting
  // out the stale timer.
  useEffect(() => {
    const onPageHide = () => {
      if (heartbeat.current) announceEnd(false)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      stopHeartbeat()
    }
  }, [announceEnd, stopHeartbeat])

  return { otherTabFinishing, announceStart, announceEnd }
}
