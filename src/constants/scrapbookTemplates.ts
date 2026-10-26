import kraftNotesLayout from '@/constants/scrapbook/kraft-notes.layout.json'
import pinkGinghamLayout from '@/constants/scrapbook/pink-gingham.layout.json'
import type { StripLayout } from '@/constants/stripTemplates'

/**
 * Scrapbook templates (docs/PLAN-scrapbook.md §4).
 *
 * A template is fixed: a set number of pages, each with places for strips and places for
 * text, and the user only fills them. Its geometry lives in one layout file per template
 * (`scrapbook/<id>.layout.json`), read both here and by `scripts/scrapbook-art.mjs`, which
 * draws the page art from it — so a slot and the art around it can't drift apart. Change
 * the layout, re-run the script.
 *
 * The server knows none of this: it checks slot ids for shape only. That keeps this the
 * one place a template is defined. Keep slot ids stable once scrapbooks exist — a saved
 * draft names them — or ship a changed design as a new template id.
 */

/** A place for one strip, in page fractions. Rotated about its own centre. */
export interface ScrapbookStripSlot {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Only strips of this family fit here; the tray filters on it. */
  layout: StripLayout
  /** Degrees, clockwise. */
  rotate: number
  /**
   * Tape or photo corners, drawn over the strip **only when the slot is filled** — an empty
   * slot is blank paper. `margin` is how far the art reaches past the slot on every side,
   * as a fraction of the page width.
   */
  decoration: { src: string; margin: number } | null
}

/**
 * A place for text, in page fractions. Always Chivo; `size` is a fraction of the page
 * width, so the editor and the PDF scale it the same way. Add a `font` field when a
 * second face arrives.
 */
export interface ScrapbookTextSlot {
  id: string
  x: number
  y: number
  w: number
  h: number
  size: number
  weight: 400 | 700 | 900
  /** Multiple of `size`. */
  lineHeight: number
  align: 'left' | 'center' | 'right'
  color: string
  maxLength: number
  maxLines: number
  /** i18n key suffix under `scrapbook.placeholders.*`. Editor only, never rendered. */
  placeholder: string
}

export interface ScrapbookPage {
  id: string
  /** Bundled SVG art for the whole page (a same-origin URL). */
  background: string
  strips: ScrapbookStripSlot[]
  texts: ScrapbookTextSlot[]
}

export interface ScrapbookTemplate {
  id: string
  /** i18n key suffix under `scrapbook.templates.*`. */
  label: string
  /** Width / height of a page. */
  aspect: number
  /** The page's size in render pixels: what one page of the PDF is drawn at (300 dpi A5). */
  renderWidth: number
  renderHeight: number
  /** Fixed order — the PDF's page order. */
  pages: ScrapbookPage[]
}

// ── Building a template from its layout file ─────────────────────────────────

interface RawRect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

interface RawLayout {
  id: string
  page: { width: number; height: number }
  /** The ink this template writes in — chosen to read on its own paper. */
  textColor: string
  decorations: Record<string, { layout: string; width: number; height: number; margin: number }>
  pages: {
    id: string
    strips: (RawRect & { layout: string; rotate?: number; decoration?: string })[]
    texts: (RawRect & {
      size: number
      weight: number
      lineHeight: number
      align: string
      maxLength: number
      maxLines: number
      placeholder: string
    })[]
  }[]
}

/** Every SVG under a template's asset folder, by file name. */
const ART = import.meta.glob<string>('../assets/scrapbook/*/*.svg', {
  eager: true,
  import: 'default',
})

function art(templateId: string, file: string): string {
  const url = ART[`../assets/scrapbook/${templateId}/${file}`]
  if (!url)
    throw new Error(`Missing scrapbook art: ${templateId}/${file} — run scripts/scrapbook-art.mjs`)
  return url
}

function buildTemplate(raw: RawLayout, label: string): ScrapbookTemplate {
  const { width: W, height: H } = raw.page
  const frac = (rect: RawRect) => ({ x: rect.x / W, y: rect.y / H, w: rect.w / W, h: rect.h / H })
  return {
    id: raw.id,
    label,
    aspect: W / H,
    renderWidth: W,
    renderHeight: H,
    pages: raw.pages.map((page) => ({
      id: page.id,
      background: art(raw.id, `page-${page.id}.svg`),
      strips: page.strips.map((slot) => {
        const deco = slot.decoration ? raw.decorations[slot.decoration] : undefined
        return {
          id: slot.id,
          ...frac(slot),
          layout: slot.layout as StripLayout,
          rotate: slot.rotate ?? 0,
          decoration:
            slot.decoration && deco
              ? { src: art(raw.id, `deco-${slot.decoration}.svg`), margin: deco.margin / W }
              : null,
        }
      }),
      texts: page.texts.map((slot) => ({
        id: slot.id,
        ...frac(slot),
        size: slot.size / W,
        weight: slot.weight as 400 | 700 | 900,
        lineHeight: slot.lineHeight,
        align: slot.align as 'left' | 'center' | 'right',
        color: raw.textColor,
        maxLength: slot.maxLength,
        maxLines: slot.maxLines,
        placeholder: slot.placeholder,
      })),
    })),
  }
}

export const SCRAPBOOK_TEMPLATES: ScrapbookTemplate[] = [
  buildTemplate(kraftNotesLayout as RawLayout, 'kraftNotes'),
  buildTemplate(pinkGinghamLayout as RawLayout, 'pinkGingham'),
]

/** The template the picker opens on. */
export const DEFAULT_SCRAPBOOK_TEMPLATE_ID = 'kraft-notes'

/**
 * The template a scrapbook was started on, or null for an id this build doesn't know —
 * a scrapbook made on a template since retired, or by a newer build. The caller shows that
 * as unsupported rather than guessing at a layout.
 */
export function getScrapbookTemplate(id: string): ScrapbookTemplate | null {
  return SCRAPBOOK_TEMPLATES.find((template) => template.id === id) ?? null
}

/** Every strip slot in a template, across all its pages. */
export function stripSlotsOf(template: ScrapbookTemplate): ScrapbookStripSlot[] {
  return template.pages.flatMap((page) => page.strips)
}

/** Every text slot in a template, across all its pages. */
export function textSlotsOf(template: ScrapbookTemplate): ScrapbookTextSlot[] {
  return template.pages.flatMap((page) => page.texts)
}
