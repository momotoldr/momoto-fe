import { Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMediaStore } from '@/store/useMediaStore'

import styles from './MediaControls.module.scss'
import type { SessionMode } from '@/types/roomsType'

interface MediaControlsProps {
  mode: SessionMode
  /** Drop the labels and shrink to icon buttons (arrange rail, mobile toolbars). */
  compact?: boolean
  /** Stretch each toggle to share the row evenly (mobile action bar). */
  fluid?: boolean
}

/** Toggle buttons for the local camera and microphone. */
export function MediaControls({ mode, compact = false, fluid = false }: MediaControlsProps) {
  const { t } = useTranslation()
  const camEnabled = useMediaStore((state) => state.camEnabled)
  const micEnabled = useMediaStore((state) => state.micEnabled)
  const toggleCam = useMediaStore((state) => state.toggleCam)
  const toggleMic = useMediaStore((state) => state.toggleMic)

  const buttonClass = cn(
    styles.button,
    compact && styles.buttonCompact,
    fluid && styles.buttonFluid
  )

  return (
    <div
      className={cn(
        styles.controls,
        compact && styles.controlsCompact,
        fluid && styles.controlsFluid
      )}
    >
      <Button
        type="button"
        variant={camEnabled ? 'secondary' : 'destructive'}
        size={compact ? 'icon' : 'default'}
        className={buttonClass}
        onClick={toggleCam}
        aria-pressed={!camEnabled}
        aria-label={camEnabled ? t('mediaControls.turnCameraOff') : t('mediaControls.turnCameraOn')}
      >
        {camEnabled ? <Video /> : <VideoOff />}
        {!compact && (camEnabled ? t('mediaControls.cameraOn') : t('mediaControls.cameraOff'))}
      </Button>

      {mode !== 'solo' && (
        <Button
          type="button"
          variant={micEnabled ? 'secondary' : 'destructive'}
          size={compact ? 'icon' : 'default'}
          className={buttonClass}
          onClick={toggleMic}
          aria-pressed={!micEnabled}
          aria-label={micEnabled ? t('mediaControls.muteMic') : t('mediaControls.unmuteMic')}
        >
          {micEnabled ? <Mic /> : <MicOff />}
          {!compact && (micEnabled ? t('mediaControls.micOn') : t('mediaControls.micOff'))}
        </Button>
      )}
    </div>
  )
}
