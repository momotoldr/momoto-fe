import { Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  type AvatarCrop,
  baseSquare,
  clampCrop,
  drawCrop,
  initialCrop,
  MAX_ZOOM,
} from '@/utils/avatarImage'

import styles from './AvatarCropper.module.scss'

/** Backing resolution of the preview canvas, before the display's pixel ratio. */
const VIEWPORT = 320

/** How far one arrow-key press nudges the crop, in viewport pixels. */
const KEY_STEP = 8

/** Slider granularity. Fine enough that dragging it feels continuous. */
const ZOOM_STEP = 0.01

interface AvatarCropperProps {
  /** The decoded picture being cropped. Owned by the caller, which also closes it. */
  source: ImageBitmap
  busy: boolean
  onCancel: () => void
  onConfirm: (crop: AvatarCrop) => void
}

/**
 * Position and scale the square that becomes someone's avatar.
 *
 * The square is what stays still: it's the viewport, and the picture moves under it.
 * That's the arrangement every phone photo cropper uses, and it makes the invariant
 * ("the crop is always full") something the user can see rather than a rule they can
 * bump into — there is no gesture that produces an empty corner, because the image is
 * clamped rather than the selection being resized.
 *
 * Drawn to a canvas rather than shown as a CSS-transformed `<img>` so the preview and
 * the uploaded file run the exact same `drawCrop` call. A transform preview would be a
 * second implementation of the geometry, free to disagree with the encode about EXIF
 * orientation or sub-pixel rounding — and it would disagree on precisely the images
 * users would find hardest to describe.
 */
export function AvatarCropper({ source, busy, onCancel, onConfirm }: AvatarCropperProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [crop, setCrop] = useState<AvatarCrop>(() => initialCrop(source))
  /**
   * Where the pointer was last seen, per active drag.
   *
   * Tracked by hand instead of reading `event.movementX`, which Safari has long
   * reported as 0 for pointer events — the drag would silently do nothing there,
   * which is the kind of bug that only shows up on someone else's phone.
   */
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)

  /** Move the crop, always through the clamp so it can't leave the picture. */
  const adjust = useCallback(
    (change: Partial<AvatarCrop>) => setCrop((c) => clampCrop(source, { ...c, ...change })),
    [source]
  )

  /**
   * Convert a drag in viewport pixels into one in source pixels.
   *
   * The picture moves with the pointer, so the crop moves *against* it — drag right
   * and you expect to reveal what was off to the left.
   */
  const panBy = useCallback(
    (dx: number, dy: number) => {
      const perPixel = baseSquare(source) / crop.zoom / VIEWPORT
      adjust({ cx: crop.cx - dx * perPixel, cy: crop.cy - dy * perPixel })
    },
    [adjust, crop.cx, crop.cy, crop.zoom, source]
  )

  // Redraw on every change. Cheap enough to do synchronously: `drawImage` scaling a
  // decoded bitmap into a 320px square is GPU work, not a re-decode.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    drawCrop(canvas, source, crop, Math.round(VIEWPORT * ratio))
  }, [crop, source])

  /**
   * Wheel and trackpad-pinch zoom.
   *
   * Bound by hand rather than with `onWheel`, because React attaches wheel listeners
   * passively — `preventDefault` there is ignored with a console warning, and the page
   * behind the dialog scrolls while you're trying to frame a face.
   */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (event: WheelEvent) => {
      if (busy) return
      event.preventDefault()
      // Exponential so a notch feels the same at either end of the range; without it
      // zooming out crawls once you're far in.
      setCrop((c) => clampCrop(source, { ...c, zoom: c.zoom * Math.exp(-event.deltaY / 400) }))
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [busy, source])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [busy, onCancel])

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy) return
    // Capture so a fast drag that leaves the canvas keeps panning instead of stopping
    // dead at the edge — the pointer is still down, so the gesture is still going.
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (busy || drag?.id !== event.pointerId) return
    // The canvas is laid out at VIEWPORT css pixels, so movement needs no rescaling.
    panBy(event.clientX - drag.x, event.clientY - drag.y)
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    }
    const step = nudge[event.key]
    if (!step) return
    // The arrows drive the crop here; letting them also scroll the page behind the
    // dialog would move both at once.
    event.preventDefault()
    panBy(step[0], step[1])
  }

  return createPortal(
    <div className={styles.overlay} onClick={busy ? undefined : onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-cropper-title"
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="avatar-cropper-title" className={styles.title}>
          {t('auth.profile.cropTitle')}
        </h2>
        <p className={styles.description}>{t('auth.profile.cropHint')}</p>

        <div className={styles.stage}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            // Focusable so the crop can be nudged with the arrow keys. The zoom
            // slider next to it is the primary keyboard path; this is the companion
            // to it, not the only way in.
            tabIndex={0}
            aria-label={t('auth.profile.cropCanvasLabel')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          />
          {/* Purely decorative: shows how the square will read once it's rendered as a
           * round avatar. `pointer-events-none` so it never eats a drag. */}
          <div className={styles.circleGuide} aria-hidden="true" />
        </div>

        <div className={styles.zoomRow}>
          <ZoomOut className={styles.zoomIcon} aria-hidden="true" />
          <input
            className={styles.zoomSlider}
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            value={crop.zoom}
            disabled={busy}
            aria-label={t('auth.profile.cropZoomLabel')}
            onChange={(event) => adjust({ zoom: Number(event.target.value) })}
          />
          <ZoomIn className={styles.zoomIcon} aria-hidden="true" />
        </div>

        <div className={styles.actions}>
          <Button ref={cancelRef} variant="outline" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button disabled={busy} onClick={() => onConfirm(crop)}>
            {busy && <Loader2 className={styles.spinner} />}
            {busy ? t('auth.profile.avatarUploading') : t('auth.profile.cropSave')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
