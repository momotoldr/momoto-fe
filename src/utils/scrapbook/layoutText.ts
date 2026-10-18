import type { ScrapbookTextSlot } from '@/constants/scrapbookTemplates'

/**
 * Line breaking for scrapbook text — the **only** place it happens (docs/PLAN-scrapbook.md
 * §5). The editor renders the lines this returns one by one (`white-space: pre`) and the
 * PDF draws the same lines onto canvas, so the two can never disagree about where a line
 * breaks. Nothing else may let the browser wrap scrapbook text.
 *
 * Measured at one fixed reference width, whatever size the page is shown at: text width
 * scales with font size, so measuring once in page units gives the same breaks for a
 * 320px phone preview and the 1748px PDF page.
 */

const FONT_FAMILY = 'Chivo'
const FONT_STACK = `${FONT_FAMILY}, ui-sans-serif, system-ui, sans-serif`
const REFERENCE_WIDTH = 2000

/** The CSS/canvas font for a slot, on a page `pageWidth` pixels wide. */
export function scrapbookFont(slot: ScrapbookTextSlot, pageWidth: number): string {
  return `${slot.weight} ${slot.size * pageWidth}px ${FONT_STACK}`
}

let fontsReady: Promise<void> | null = null

/**
 * Wait for every Chivo weight the scrapbook uses. Must resolve before laying out or
 * drawing text: `@font-face` loads lazily, and measuring with the fallback face would
 * break lines in different places than the real one draws them.
 *
 * Settles even if a weight fails to load, so a font problem degrades the look rather
 * than blocking the editor; the measurement then uses whatever face the browser has.
 */
export function loadScrapbookFonts(): Promise<void> {
  fontsReady ??= Promise.all(
    [400, 700, 900].map((weight) => document.fonts.load(`${weight} 100px ${FONT_FAMILY}`))
  ).then(
    () => undefined,
    () => undefined
  )
  return fontsReady
}

let measurer: CanvasRenderingContext2D | null = null

function measureContext(): CanvasRenderingContext2D {
  if (!measurer) {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is unavailable')
    measurer = ctx
  }
  return measurer
}

export interface TextLayout {
  /** Every line the text needs, in order. May run past `maxLines`; see `fits`. */
  lines: string[]
  /** Within both the slot's line count and its character limit. */
  fits: boolean
}

/**
 * Break `text` into the lines a slot draws: explicit newlines are kept, words wrap
 * greedily at the slot's width, and a word wider than the slot breaks between characters
 * rather than spilling out of it.
 *
 * `maxLength` counts UTF-16 units, as the server does, so the two agree on what fits.
 */
export function layoutScrapbookText(text: string, slot: ScrapbookTextSlot): TextLayout {
  const ctx = measureContext()
  ctx.font = scrapbookFont(slot, REFERENCE_WIDTH)
  const maxWidth = slot.w * REFERENCE_WIDTH
  const width = (value: string) => ctx.measureText(value).width

  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (width(candidate) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      if (width(word) <= maxWidth) {
        line = word
        continue
      }
      // Wider than the slot on its own: break it between characters (code points, so an
      // emoji or a surrogate pair is never split in half).
      line = ''
      for (const char of Array.from(word)) {
        if (line && width(line + char) > maxWidth) {
          lines.push(line)
          line = char
        } else {
          line += char
        }
      }
    }
    lines.push(line)
  }

  return { lines, fits: lines.length <= slot.maxLines && text.length <= slot.maxLength }
}
