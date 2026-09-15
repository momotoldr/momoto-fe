import type { RefObject } from 'react'
import { useCallback, useEffect } from 'react'

import { usePhotosStore } from '@/store/usePhotosStore'
import { useRoomStore } from '@/store/useRoomStore'
import { useStripStore } from '@/store/useStripStore'

import { MIRROR_CAPTURE, SHOT_COUNT, SHOT_REVIEW_MS } from '@/constants/capture'
import { STRIP_TEMPLATES, STRIP_TEMPLATE_MAP, slotAspect } from '@/constants/stripTemplates'
import { captureCompositeFrame, type CompositeSource } from '@/utils/captureFrame'

/**
 * Runs a photo-strip capture sequence as a countdown state machine. For each of
 * `SHOT_COUNT` shots the countdown ticks 3→2→1 and a cut is captured at 0. Each cut
 * composites every camera in the room into one frame — local first and mirrored, then
 * the peers — laid out by `compositeGrid`; solo captures the local camera full-frame.
 * Each timer lives in its own effect cycle (StrictMode-safe). The sequence is started
 * elsewhere (`usePhotosStore.startCapture()`), locally or via a synced socket broadcast.
 *
 * The cut is shaped to the chosen template's slot so the strip never has to crop it
 * again. The template is read at capture time rather than subscribed to: it can't
 * change mid-sequence (the picker locks during capture) and a stale closure here
 * would silently shoot the wrong shape.
 */
export function useCaptureSequence(
  localVideoRef: RefObject<HTMLVideoElement>,
  peerVideoRefs: RefObject<Map<string, RefObject<HTMLVideoElement>>>,
  canvasRef: RefObject<HTMLCanvasElement>
) {
  const isCapturing = usePhotosStore((state) => state.isCapturing)
  const countdown = usePhotosStore((state) => state.countdown)

  const captureOnce = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const sources: CompositeSource[] = []
    if (localVideoRef.current)
      sources.push({ video: localVideoRef.current, mirror: MIRROR_CAPTURE })
    // Peers in room (join) order, which is the order their tiles are on screen — and it
    // holds across the four shots even if someone reconnects, because the server hands a
    // returning member their seat back in place. Sorting by socket id would not: a
    // reconnect mints a new id, and the strip would reshuffle mid-run.
    const peers = peerVideoRefs.current
    if (peers) {
      for (const socketId of useRoomStore.getState().peerIds) {
        const video = peers.get(socketId)?.current
        if (video) sources.push({ video, mirror: false })
      }
    }
    const { templateId } = useStripStore.getState()
    const template = STRIP_TEMPLATE_MAP[templateId] ?? STRIP_TEMPLATES[0]
    // The grid is the one pinned when this run started, not a fresh count of who
    // happens to be rendering right now.
    const { captureTiles } = usePhotosStore.getState()
    return captureCompositeFrame(sources, canvas, slotAspect(template), captureTiles)
  }, [localVideoRef, peerVideoRefs, canvasRef])

  useEffect(() => {
    if (!isCapturing || countdown === null) return

    // Still counting down: tick once per second.
    if (countdown > 0) {
      const timer = window.setTimeout(() => usePhotosStore.getState().tickCountdown(), 1000)
      return () => window.clearTimeout(timer)
    }

    // Countdown hit zero: capture this cut.
    const frame = captureOnce()
    const store = usePhotosStore.getState()

    // Single-shot retake: replace that slot's frame in place, then return to review.
    if (store.retakeSlot !== null) {
      const captureIndex = store.order[store.retakeSlot] ?? store.retakeSlot
      if (frame) store.replaceFrame(captureIndex, frame)
      const timer = window.setTimeout(
        () => usePhotosStore.getState().finishRetake(),
        SHOT_REVIEW_MS
      )
      return () => window.clearTimeout(timer)
    }

    // Normal sequence: append the cut, then advance after a brief review.
    if (frame) store.addFrame(frame)
    const shotsTaken = usePhotosStore.getState().frames.length
    const timer = window.setTimeout(() => {
      if (shotsTaken >= SHOT_COUNT) {
        usePhotosStore.getState().finishCapture()
      } else {
        usePhotosStore.getState().startNextShot()
      }
    }, SHOT_REVIEW_MS)
    return () => window.clearTimeout(timer)
  }, [isCapturing, countdown, captureOnce])
}
