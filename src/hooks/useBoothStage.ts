import { useEffect } from 'react'

import type { BoothStage } from '@/constants/boothTips'
import { useTipsStore } from '@/store/useTipsStore'

/**
 * Declare which booth screen is on show, so `BoothTips` (mounted up in the room bar,
 * far away from any of these screens) can offer advice about the right one.
 *
 * Called by the component that owns the screen — `RoomLobby`, and each body of
 * `CameraStage` — rather than re-deriving the same branch conditions somewhere else.
 * Pass `null` while the screen isn't really up (the camera is still being requested,
 * say) to keep the tips quiet.
 */
export function useBoothStage(stage: BoothStage | null): void {
  const setStage = useTipsStore((state) => state.setStage)

  useEffect(() => {
    setStage(stage)
    return () => setStage(null)
  }, [stage, setStage])
}
