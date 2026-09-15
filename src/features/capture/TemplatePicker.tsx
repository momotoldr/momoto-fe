import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { StripLayout } from '@/constants/stripTemplates'

import { STRIP_LAYOUTS, STRIP_TEMPLATE_MAP, templatesForLayout } from '@/constants/stripTemplates'
import { TemplatePreview } from '@/features/compose/TemplatePreview'
import { cn } from '@/lib/utils'
import { usePhotosStore } from '@/store/usePhotosStore'
import { useStripStore } from '@/store/useStripStore'

import styles from './TemplatePicker.module.scss'

/**
 * Thumbnail height, shared by both layouts. Sizing by height rather than width keeps
 * the row the same height in either tab, so switching grid doesn't make the rail jump.
 */
const THUMB_HEIGHT = 132

/**
 * Strip template picker, shown in the pre-capture booth.
 *
 * Everyone's own: each member captures against the template *they* picked, so a host on
 * a 4x1 ribbon and a guest on a 2x2 card each get the crop they framed for. Nothing has
 * to agree here — both layouts hold four slots, and every client shapes its own cuts to
 * its own `slotAspect` at capture time.
 *
 * It sits before capture because the template decides how the shots are framed —
 * its slots are landscape on a 4x1 and portrait on a 2x2 — so choosing it up front
 * lets StripPreview show the real crop while there's still time to move.
 *
 * Two steps, because the layouts don't share a paper shape and mixing them in one row
 * made the odd one out read as a broken thumbnail: pick the grid (4x1 / 2x2), then the
 * design within it. The grid toggle holds no state of its own — the open tab is derived
 * from the selected template, so no tab can ever be open on a grid the live template
 * isn't in.
 */
export function TemplatePicker() {
  const { t } = useTranslation()
  const templateId = useStripStore((state) => state.templateId)
  const isCapturing = usePhotosStore((state) => state.isCapturing)

  // Locked during capture: the template fixes each cut's aspect, so switching mid-run
  // would leave shots 1-2 in one shape and 3-4 in another on the same strip.
  const canEdit = !isCapturing
  const selected = STRIP_TEMPLATE_MAP[templateId]
  const activeLayout = selected?.layout ?? STRIP_LAYOUTS[0]

  // The last design chosen in each grid, so returning to a tab returns to what you had
  // there rather than resetting to its first template.
  const lastPicked = useRef<Partial<Record<StripLayout, string>>>({})
  useEffect(() => {
    if (selected) lastPicked.current[selected.layout] = selected.id
  }, [selected])

  // A remembered pick can sit past the right edge of the row, so switching back to a
  // grid would show a row with nothing ringed while the header named a design you
  // couldn't see. Only on a grid change — a click is in view by definition.
  const activeOption = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    activeOption.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeLayout])

  // Switching grid switches template with it. Otherwise the picker would sit on a tab
  // whose row shows nothing selected while the strip quietly stayed on the other grid's
  // design — the one thing this two-step split must never allow.
  const selectLayout = (layout: StripLayout) => {
    if (layout === activeLayout) return
    const next = lastPicked.current[layout] ?? templatesForLayout(layout)[0]?.id
    if (next) useStripStore.getState().setTemplate(next)
  }

  const layouts = STRIP_LAYOUTS.filter((layout) => templatesForLayout(layout).length > 0)
  const options = templatesForLayout(activeLayout)

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <p className={styles.label}>{t('templates.label')}</p>
        {selected && <p className={styles.selected}>{t(`templates.${selected.label}`)}</p>}
      </div>

      <div className={styles.tabs} role="tablist" aria-label={t('templates.layoutLabel')}>
        {layouts.map((layout) => (
          <button
            key={layout}
            type="button"
            role="tab"
            id={`template-grid-${layout}`}
            aria-selected={layout === activeLayout}
            aria-controls={`template-row-${layout}`}
            disabled={!canEdit}
            className={cn(styles.tab, layout === activeLayout && styles.tabActive)}
            onClick={() => selectLayout(layout)}
          >
            {t(`templates.layout${layout}`)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`template-row-${activeLayout}`}
        aria-labelledby={`template-grid-${activeLayout}`}
      >
        <div className={styles.list} role="radiogroup" aria-label={t('templates.label')}>
          {options.map((option) => {
            const name = t(`templates.${option.label}`)

            return (
              <button
                key={option.id}
                ref={templateId === option.id ? activeOption : undefined}
                type="button"
                role="radio"
                aria-checked={templateId === option.id}
                disabled={!canEdit}
                className={cn(styles.option, templateId === option.id && styles.optionActive)}
                onClick={() => useStripStore.getState().setTemplate(option.id)}
                aria-label={name}
                title={name}
              >
                <span className={styles.thumbWrap}>
                  <TemplatePreview template={option} height={THUMB_HEIGHT} />
                </span>
                <span className={styles.name} style={{ maxWidth: THUMB_HEIGHT * option.aspect }}>
                  {name}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
