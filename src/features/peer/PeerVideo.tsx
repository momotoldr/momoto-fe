import { useEffect } from 'react'
import type { RefObject } from 'react'
import { Mic, MicOff, VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { usePeerStore } from '@/store/usePeerStore'

import styles from './PeerVideo.module.scss'

interface PeerVideoProps {
  /**
   * Which peer this tile shows, by socket id. A tile is addressed rather than assumed
   * because a room can hold more than one other person — the record it reads (stream,
   * cam, mic) is filed under this id in `usePeerStore`.
   */
  socketId: string
  /** Ref to the underlying <video>, owned by the parent so it can be captured. */
  videoRef: RefObject<HTMLVideoElement>
  /** Hide the name pill / mic badge on tiles too small to carry them. */
  compact?: boolean
  /**
   * Which of several peers this is, 1-based. Three tiles all labelled "Friend" read as
   * a rendering fault rather than as three people, so past a pair they are numbered.
   * Omitted (or 1 of 1) keeps the plain label a date room has always shown.
   */
  index?: number
  /** How many peers are on screen, so the label knows whether it needs a number. */
  total?: number
}

/** One remote peer's live feed (not mirrored), with cam-off / muted overlays. */
export function PeerVideo({
  socketId,
  videoRef,
  compact = false,
  index = 1,
  total = 1,
}: PeerVideoProps) {
  const { t } = useTranslation()
  const peer = usePeerStore((state) => state.peers[socketId])
  const remoteStream = peer?.stream ?? null
  const peerCamEnabled = peer?.camEnabled ?? true
  const peerMicEnabled = peer?.micEnabled ?? true

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = remoteStream
    return () => {
      video.srcObject = null
    }
  }, [remoteStream, videoRef])

  return (
    <>
      <video ref={videoRef} className={styles.video} autoPlay playsInline />
      {!peerCamEnabled && (
        <div className={styles.offOverlay}>
          <VideoOff className={styles.offIcon} />
          <span>{t('video.cameraOff')}</span>
        </div>
      )}
      {!compact && (
        <>
          <span className={styles.name}>
            {total > 1 ? t('video.friendNumbered', { index }) : t('video.friend')}
          </span>
          <span className={cn(styles.micBadge, !peerMicEnabled && styles.micBadgeOff)}>
            {peerMicEnabled ? <Mic /> : <MicOff />}
          </span>
        </>
      )}
      {/* On a compact tile there's no room for the badge row, but a muted friend
       * is still worth flagging. */}
      {compact && !peerMicEnabled && (
        <span className={cn(styles.micBadge, styles.micBadgeOff, styles.micBadgeCompact)}>
          <MicOff />
        </span>
      )}
    </>
  )
}
