import { useEffect } from 'react'

import { usePhotosStore } from '@/store/usePhotosStore'

import { playShutter, playTick } from '@/utils/countdownAudio'

/** Plays a beep on each countdown tick and a shutter tone at capture (0). */
export function useCountdownAudio() {
  const countdown = usePhotosStore((state) => state.countdown)

  useEffect(() => {
    if (countdown === null) return
    if (countdown > 0) playTick()
    else playShutter()
  }, [countdown])
}
