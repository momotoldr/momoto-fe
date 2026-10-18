import { ImageOff, Plus } from 'lucide-react'
import { useMemo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  ScrapbookPage,
  ScrapbookStripSlot,
  ScrapbookTemplate,
  ScrapbookTextSlot,
} from '@/constants/scrapbookTemplates'
import { cn } from '@/lib/utils'
import type { ScrapbookContent } from '@/types/scrapbookType'
import type { StoredStrip } from '@/types/stripType'
import { layoutScrapbookText } from '@/utils/scrapbook/layoutText'

import { useScrapbookFonts } from './useScrapbookFonts'
import styles from './ScrapbookPageView.module.scss'

/** A place on the page the editor has picked: a strip slot or a text slot. */
export interface ScrapbookSelection {
  kind: 'strip' | 'text'
  id: string
}

interface ScrapbookPageViewProps {
  template: ScrapbookTemplate
  page: ScrapbookPage
  content: ScrapbookContent
  /** Every strip the layout can draw, by id. */
  strips: Record<string, StoredStrip>
  /** Placed strips that have left the gallery — shown as an empty slot with a note. */
  missing?: ReadonlySet<string>
  /**
   * `edit` — every slot is a button, empty ones invite a strip or text; `view` — the page
   * as it will print; `thumb` — the same at rail size, with the lighter preview images.
   */
  mode: 'edit' | 'view' | 'thumb'
  selected?: ScrapbookSelection | null
  onSelect?: (selection: ScrapbookSelection) => void
  className?: string
}

/** Position a slot as page percentages, rotated about its own centre. */
function slotBox(slot: { x: number; y: number; w: number; h: number; rotate?: number }) {
  return {
    left: `${slot.x * 100}%`,
    top: `${slot.y * 100}%`,
    width: `${slot.w * 100}%`,
    height: `${slot.h * 100}%`,
    transform: slot.rotate ? `rotate(${slot.rotate}deg)` : undefined,
  } satisfies CSSProperties
}

/**
 * One scrapbook page in the DOM (docs/PLAN-scrapbook.md §5): the page art, the strips in
 * their slots, the text in its boxes — at whatever size the container gives it.
 *
 * It mirrors `composeScrapbookPage`, which draws the PDF, rule for rule: strips are
 * contain-fitted and rotated about the slot's centre, decorations appear only over a filled
 * slot, and text is the lines `layoutScrapbookText` returns, one element per line with
 * wrapping off — the browser never breaks a scrapbook line itself. Font sizes are in `cqw`
 * of the page, so the page scales as one piece.
 */
export function ScrapbookPageView({
  template,
  page,
  content,
  strips,
  missing,
  mode,
  selected,
  onSelect,
  className,
}: ScrapbookPageViewProps) {
  const fontsReady = useScrapbookFonts()
  const editable = mode === 'edit' && onSelect !== undefined

  return (
    <div
      className={cn(styles.page, mode === 'thumb' && styles.pageThumb, className)}
      style={{ aspectRatio: `${template.aspect}` }}
    >
      <img className={styles.art} src={page.background} alt="" draggable={false} />

      {page.strips.map((slot) => (
        <StripSlot
          key={slot.id}
          slot={slot}
          aspect={template.aspect}
          strip={content.strips[slot.id] ? strips[content.strips[slot.id]!] : undefined}
          stripId={content.strips[slot.id]}
          missing={missing}
          mode={mode}
          selected={selected?.kind === 'strip' && selected.id === slot.id}
          onSelect={editable ? () => onSelect({ kind: 'strip', id: slot.id }) : undefined}
        />
      ))}

      {page.texts.map((slot) => (
        <TextSlot
          key={slot.id}
          slot={slot}
          text={content.texts[slot.id] ?? ''}
          fontsReady={fontsReady}
          mode={mode}
          selected={selected?.kind === 'text' && selected.id === slot.id}
          onSelect={editable ? () => onSelect({ kind: 'text', id: slot.id }) : undefined}
        />
      ))}
    </div>
  )
}

function StripSlot({
  slot,
  aspect,
  strip,
  stripId,
  missing,
  mode,
  selected,
  onSelect,
}: {
  slot: ScrapbookStripSlot
  aspect: number
  strip: StoredStrip | undefined
  stripId: string | undefined
  missing: ReadonlySet<string> | undefined
  mode: ScrapbookPageViewProps['mode']
  selected: boolean
  onSelect?: () => void
}) {
  const { t } = useTranslation()
  const removed = !!stripId && (missing?.has(stripId) || !strip)

  // The decoration reaches `margin` (a fraction of the page width) past the slot on every
  // side; as percentages of the slot that is `margin / w` across and `margin·aspect / h`
  // down, since the page is `1 / aspect` widths tall.
  const marginX = slot.decoration ? (slot.decoration.margin / slot.w) * 100 : 0
  const marginY = slot.decoration ? ((slot.decoration.margin * aspect) / slot.h) * 100 : 0
  const decoration =
    strip && !removed && slot.decoration
      ? {
          left: `${-marginX}%`,
          top: `${-marginY}%`,
          width: `${100 + 2 * marginX}%`,
          height: `${100 + 2 * marginY}%`,
        }
      : null

  const body = (
    <>
      {strip && !removed && (
        <img
          className={styles.stripImage}
          src={mode === 'thumb' ? strip.thumbnailUrl : strip.url}
          alt=""
          draggable={false}
        />
      )}
      {decoration && slot.decoration && (
        <img
          className={styles.decoration}
          style={decoration}
          src={slot.decoration.src}
          alt=""
          draggable={false}
        />
      )}
      {mode === 'edit' && removed && (
        <span className={styles.removedNote}>
          <ImageOff aria-hidden="true" />
          {t('scrapbook.editor.stripRemoved')}
        </span>
      )}
      {mode === 'edit' && !stripId && (
        <span className={styles.emptyNote}>
          <Plus aria-hidden="true" />
          {t(`scrapbook.editor.addStrip_${slot.layout}`)}
        </span>
      )}
    </>
  )

  const className = cn(
    styles.stripSlot,
    mode === 'edit' && styles.stripSlotEdit,
    mode === 'edit' && (!stripId || removed) && styles.stripSlotEmpty,
    selected && styles.selected
  )

  return onSelect ? (
    <button
      type="button"
      className={className}
      style={slotBox(slot)}
      aria-pressed={selected}
      aria-label={t(`scrapbook.editor.addStrip_${slot.layout}`)}
      onClick={onSelect}
    >
      {body}
    </button>
  ) : (
    <div className={className} style={slotBox(slot)}>
      {body}
    </div>
  )
}

function TextSlot({
  slot,
  text,
  fontsReady,
  mode,
  selected,
  onSelect,
}: {
  slot: ScrapbookTextSlot
  text: string
  fontsReady: boolean
  mode: ScrapbookPageViewProps['mode']
  selected: boolean
  onSelect?: () => void
}) {
  const { t } = useTranslation()
  const placeholder = mode === 'edit' && !text
  const shown = placeholder ? t(`scrapbook.placeholders.${slot.placeholder}`) : text
  // Laid out only once the face is loaded: measured against the fallback, the lines
  // would break where the PDF doesn't.
  const lines = useMemo(
    () =>
      fontsReady && shown ? layoutScrapbookText(shown, slot).lines.slice(0, slot.maxLines) : [],
    [fontsReady, shown, slot]
  )

  const style: CSSProperties = {
    ...slotBox(slot),
    color: slot.color,
    fontWeight: slot.weight,
    fontSize: `${slot.size * 100}cqw`,
    lineHeight: slot.lineHeight,
    textAlign: slot.align,
  }
  const body = lines.map((line, index) => (
    // An empty line still takes its line box, as the canvas leaves its row empty.
    <span key={index} className={styles.line}>
      {line || '​'}
    </span>
  ))
  const className = cn(
    styles.textSlot,
    mode === 'edit' && styles.textSlotEdit,
    placeholder && styles.placeholder,
    selected && styles.selected
  )

  return onSelect ? (
    <button
      type="button"
      className={className}
      style={style}
      aria-pressed={selected}
      aria-label={t(`scrapbook.text.label_${slot.placeholder}`)}
      onClick={onSelect}
    >
      {body}
    </button>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  )
}
