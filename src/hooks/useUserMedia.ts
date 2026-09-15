import { useCallback, useEffect, useState } from 'react'

import { useMediaStore } from '@/store/useMediaStore'

import { mapMediaError } from '@/utils/media-errors'

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop())
}

/**
 * Acquires the local camera + microphone on mount and stores the stream in the
 * media store. Cleans up (stops tracks) on unmount, and is StrictMode-safe:
 * a stream obtained after the component has unmounted is stopped immediately.
 *
 * Returns a `retry` callback to re-request access after an error.
 */
export function useUserMedia() {
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let acquired: MediaStream | null = null
    const { setStream, setStatus, setError, reset } = useMediaStore.getState()

    async function start() {
      setStatus('requesting')
      setError(null)

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('insecure')
        return
      }

      try {
        // `ideal` (not `exact`) so a camera that can't do 720p still opens. Pinning a
        // resolution keeps the background processor's per-frame cost predictable
        // instead of scaling with whatever the device happens to hand us.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        })
        if (cancelled) {
          stopStream(stream)
          return
        }
        acquired = stream
        setStream(stream)
      } catch (err) {
        if (!cancelled) setError(mapMediaError(err))
      }
    }

    void start()

    return () => {
      cancelled = true
      if (acquired) stopStream(acquired)
      reset()
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  return { retry }
}
