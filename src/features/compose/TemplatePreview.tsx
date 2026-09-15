import type { StripTemplate } from '@/constants/stripTemplates'

import { slotRadius } from '@/constants/stripTemplates'

import styles from './TemplatePreview.module.scss'

interface TemplatePreviewProps {
  template: StripTemplate
  /** Preview width in px; the other dimension follows the template aspect. Default 60. */
  width?: number
  /**
   * Preview height in px. Wins over `width` when both are given — which is what the
   * picker uses, so a 2:3 card and a 1:3 ribbon sit at the same height in their own
   * rows instead of one being half the other.
   */
  height?: number
}

/** Miniature of a template: its SVG background with gray placeholder photo slots. */
export function TemplatePreview({ template, width = 60, height }: TemplatePreviewProps) {
  const size = height ? { height, width: height * template.aspect } : { width }

  return (
    <div
      className={styles.preview}
      style={{
        ...size,
        aspectRatio: String(template.aspect),
        backgroundImage: `url("${template.src}")`,
      }}
    >
      {template.slots.map((slot, index) => (
        <span
          key={index}
          className={styles.slot}
          style={{
            left: `${slot.x * 100}%`,
            top: `${slot.y * 100}%`,
            width: `${slot.w * 100}%`,
            height: `${slot.h * 100}%`,
            // Undefined for a square slot, leaving the class's own hairline radius.
            borderRadius: slotRadius(slot, template.aspect),
          }}
        />
      ))}
    </div>
  )
}
