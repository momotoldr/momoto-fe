import { usePhotosStore } from '@/store/usePhotosStore'

import styles from './CountdownOverlay.module.scss'

/**
 * 3-2-1 countdown (+ capture flash at zero) for a video tile. Both cameras are
 * captured together, so this shows on every tile at once.
 */
export function CountdownOverlay() {
  const countdown = usePhotosStore((state) => state.countdown)

  if (countdown === null) return null
  if (countdown === 0) return <div className={styles.flash} />

  return (
    <div className={styles.overlay}>
      {/* `key` re-triggers the pop animation on each tick. */}
      <span key={countdown} className={styles.number}>
        {countdown}
      </span>
    </div>
  )
}
