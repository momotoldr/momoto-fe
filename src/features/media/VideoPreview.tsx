import { useEffect } from 'react'
import type { RefObject } from 'react'
import { Mic, MicOff, VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { useMediaStore } from '@/store/useMediaStore'

import styles from './VideoPreview.module.scss'

interface VideoPreviewProps {
  /** Ref to the underlying <video>, owned by the parent so it can be captured. */
  videoRef: RefObject<HTMLVideoElement>
  /** Hide the name pill / mic badge on tiles too small to carry them. */
  compact?: boolean
  /** Mic state is only meaningful in a date room — solo has no audio channel. */
  showMic?: boolean
}

/**
 * The local webcam feed, mirrored, with a "camera off" overlay when disabled.
 *
 * Shows the same stream the peer receives and a capture will contain.
 */
export function VideoPreview({ videoRef, compact = false, showMic = false }: VideoPreviewProps) {
  const { t } = useTranslation()
  const stream = useMediaStore((state) => state.localStream)
  const camEnabled = useMediaStore((state) => state.camEnabled)
  const micEnabled = useMediaStore((state) => state.micEnabled)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    video.muted = true
    return () => {
      video.srcObject = null
    }
  }, [stream, videoRef])

  return (
    <>
      <video ref={videoRef} className={styles.video} autoPlay playsInline muted />
      {!camEnabled && (
        <div className={styles.offOverlay}>
          <VideoOff className={styles.offIcon} />
          <span>{t('video.cameraOff')}</span>
        </div>
      )}
      {!compact && (
        <>
          <span className={styles.name}>{t('video.you')}</span>
          {showMic && (
            <span className={cn(styles.micBadge, !micEnabled && styles.micBadgeOff)}>
              {micEnabled ? <Mic /> : <MicOff />}
            </span>
          )}
        </>
      )}
    </>
  )
}
