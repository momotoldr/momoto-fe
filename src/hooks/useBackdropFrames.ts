import { useCallback, useEffect, useReducer, useState } from 'react'

import type { BackdropId } from '@/constants/backdrops'
import { peekBackdrop, withBackdrop } from '@/utils/backdrop'
import type { CapturedFrame } from '@/utils/captureFrame'

/**
 * `frames` as they look in front of `backdrop`, for the arrange screen.
 *
 * Each cut swaps over as soon as its own composite is ready, so the strip fills in cut
 * by cut instead of sitting unchanged until the slowest one lands. Until then a slot
 * shows the original cut — and `done` stays false so Create can wait for it.
 */
export function useBackdropFrames(frames: CapturedFrame[], backdrop: BackdropId) {
  // The composites live in `utils/backdrop`'s cache; this only re-renders when one lands.
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setFailed(false)
    if (backdrop === 'none') return
    let cancelled = false
    for (const frame of frames) {
      withBackdrop(frame, backdrop).then(
        () => !cancelled && rerender(),
        () => !cancelled && setFailed(true)
      )
    }
    return () => {
      cancelled = true
    }
  }, [frames, backdrop, attempt])

  const shown = frames.map((frame) => peekBackdrop(frame, backdrop))
  const ready = shown.filter(Boolean).length

  return {
    frames: shown.map((frame, index) => frame ?? frames[index]),
    /** Cuts already in front of the backdrop, out of `frames.length`. */
    ready,
    done: ready === frames.length,
    failed,
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  }
}
