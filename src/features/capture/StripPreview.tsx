import { useTranslation } from 'react-i18next'

import { SHOT_COUNT } from '@/constants/capture'
import { STRIP_TEMPLATES, STRIP_TEMPLATE_MAP, slotRadius } from '@/constants/stripTemplates'
import { cn } from '@/lib/utils'
import { usePhotosStore } from '@/store/usePhotosStore'
import { useStripStore } from '@/store/useStripStore'

import styles from './StripPreview.module.scss'

/**
 * The strip as it is being built: the chosen template's art, with each captured cut
 * sitting in its real slot and the slot that's up next ringed.
 *
 * The template is picked before capture so this can show the true shape of the strip
 * while there's still time to act on it — a template slot is landscape (~1.4:1) while
 * a cut is portrait 3:4 solo (or 3:2 for a pair), so what lands on the paper is a
 * crop of what the big stage tiles show.
 */
export function StripPreview() {
  const { t } = useTranslation()
  const frames = usePhotosStore((state) => state.frames)
  const order = usePhotosStore((state) => state.order)
  const retakeSlot = usePhotosStore((state) => state.retakeSlot)
  const templateId = useStripStore((state) => state.templateId)

  const template = STRIP_TEMPLATE_MAP[templateId] ?? STRIP_TEMPLATES[0]

  // Slots in strip order; before the arrange step `order` is unset, so shots simply
  // fill top to bottom in the order they were taken.
  const slotOrder = order.length === frames.length ? order : frames.map((_, index) => index)
  // The slot the next cut lands in: the one being re-shot during a single-shot
  // retake, otherwise the next to be filled.
  const nextSlot = retakeSlot ?? frames.length

  return (
    <div className={styles.preview}>
      <div
        className={styles.strip}
        style={{
          aspectRatio: String(template.aspect),
          backgroundImage: `url("${template.src}")`,
        }}
        aria-label={t('select.stripAria')}
      >
        {[...Array(SHOT_COUNT).keys()].map((slot) => {
          const rect = template.slots[slot]
          if (!rect) return null
          const frameIndex = slotOrder[slot]
          const frame = frameIndex === undefined ? undefined : frames[frameIndex]

          return (
            <div
              key={slot}
              className={cn(styles.slot, slot === nextSlot && styles.slotNext)}
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
                borderRadius: slotRadius(rect, template.aspect),
              }}
            >
              {frame ? (
                <img
                  src={frame.dataUrl}
                  alt={t('capture.shotAlt', { index: slot + 1 })}
                  className={styles.slotImage}
                />
              ) : (
                <span className={styles.placeholder}>{slot + 1}</span>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.caption}>
        <span className={styles.captionLabel}>{t('capture.stripLabel')}</span>
        <span className={styles.captionCount}>
          {t('capture.stripProgress', { taken: frames.length, total: SHOT_COUNT })}
        </span>
      </div>
    </div>
  )
}
