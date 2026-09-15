import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCw, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { PlacedSticker } from '@/constants/stickers'
import { useStripStore } from '@/store/useStripStore'

import styles from './StickerOverlay.module.scss'

interface DragState {
  mode: 'move' | 'resize' | 'rotate'
  /** Pointer→center offset (normalized) captured at grab, so moves don't jump. */
  offX: number
  offY: number
  /** Rotate gesture: pointer angle + sticker rotation captured at grab. */
  startAngle: number
  startRotation: number
}

interface PlacedStickerViewProps {
  sticker: PlacedSticker
  overlayRef: React.RefObject<HTMLDivElement | null>
  editable: boolean
}

/** A single placed sticker: draggable, resizable via its corner handle, and
 * removable via its ✕ button. Coordinates are normalized to the overlay box. */
function PlacedStickerView({ sticker, overlayRef, editable }: PlacedStickerViewProps) {
  const { t } = useTranslation()
  const drag = useRef<DragState | null>(null)

  const startMove = (event: React.PointerEvent) => {
    if (!editable) return
    event.preventDefault()
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = (event.clientX - rect.left) / rect.width
    const py = (event.clientY - rect.top) / rect.height
    drag.current = {
      mode: 'move',
      offX: px - sticker.x,
      offY: py - sticker.y,
      startAngle: 0,
      startRotation: 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const startResize = (event: React.PointerEvent) => {
    if (!editable) return
    event.preventDefault()
    event.stopPropagation()
    drag.current = { mode: 'resize', offX: 0, offY: 0, startAngle: 0, startRotation: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const startRotate = (event: React.PointerEvent) => {
    if (!editable) return
    event.preventDefault()
    event.stopPropagation()
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + sticker.x * rect.width
    const cy = rect.top + sticker.y * rect.height
    drag.current = {
      mode: 'rotate',
      offX: 0,
      offY: 0,
      startAngle: Math.atan2(event.clientY - cy, event.clientX - cx),
      startRotation: sticker.rotation,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onMove = (event: React.PointerEvent) => {
    if (!drag.current) return
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + sticker.x * rect.width
    const cy = rect.top + sticker.y * rect.height
    if (drag.current.mode === 'move') {
      const x = (event.clientX - rect.left) / rect.width - drag.current.offX
      const y = (event.clientY - rect.top) / rect.height - drag.current.offY
      useStripStore.getState().updateSticker(sticker.id, { x, y })
    } else if (drag.current.mode === 'resize') {
      const dist = Math.hypot(event.clientX - cx, event.clientY - cy)
      // The handle rides the corner (~half the diagonal of the 1em glyph box).
      useStripStore.getState().updateSticker(sticker.id, { size: (dist * Math.SQRT2) / rect.width })
    } else {
      // Rotate: add the pointer's angular delta (since grab) to the start rotation.
      const angle = Math.atan2(event.clientY - cy, event.clientX - cx)
      const delta = ((angle - drag.current.startAngle) * 180) / Math.PI
      useStripStore
        .getState()
        .updateSticker(sticker.id, { rotation: drag.current.startRotation + delta })
    }
  }

  const endDrag = (event: React.PointerEvent) => {
    if (!drag.current) return
    drag.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <div
      className={cn(styles.sticker, editable && styles.stickerEditable)}
      style={{
        left: `${sticker.x * 100}%`,
        top: `${sticker.y * 100}%`,
        fontSize: `${sticker.size * 100}cqw`,
        transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
      }}
      onPointerDown={startMove}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <img src={sticker.src} alt="" className={styles.image} draggable={false} />
      {editable && (
        <>
          <button
            type="button"
            className={styles.remove}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => useStripStore.getState().removeSticker(sticker.id)}
            aria-label={t('stickers.remove')}
            title={t('stickers.remove')}
          >
            <X />
          </button>
          <span
            className={styles.rotate}
            onPointerDown={startRotate}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            role="img"
            aria-label={t('stickers.rotate')}
            title={t('stickers.rotate')}
          >
            <RotateCw />
          </span>
          <span
            className={styles.resize}
            onPointerDown={startResize}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  )
}

interface StickerOverlayProps {
  editable: boolean
}

/**
 * Absolutely-positioned layer over the strip's photo area holding the placed
 * stickers. The layer itself ignores pointer events (so slot drag/retake still
 * work in the gaps); only the stickers capture them.
 */
export function StickerOverlay({ editable }: StickerOverlayProps) {
  const stickers = useStripStore((state) => state.stickers)
  const overlayRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={overlayRef} className={styles.overlay}>
      {stickers.map((sticker) => (
        <PlacedStickerView
          key={sticker.id}
          sticker={sticker}
          overlayRef={overlayRef}
          editable={editable}
        />
      ))}
    </div>
  )
}
