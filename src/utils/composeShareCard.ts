import logoUrl from '@/assets/logo-momoto.png'

const FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

/**
 * Card proportions, as fractions of the card's width (the design is drawn at
 * 224px wide, so each value below is its pixel size there over 224).
 */
const CARD_ASPECT = 4 / 5
const PAD = 16 / 224
const GAP = 12 / 224
// The design draws the mark 18px tall on a 224px card. Ours is a wider lockup
// (icon + wordmark) with its own internal breathing room, so it needs more height
// than that before the word under the strip is actually readable.
const LOGO_H = 34 / 224
const LOGO_GAP = 4 / 224
const TAGLINE = 11 / 224
/** Corner radius of the strip inside the card, as a fraction of the strip's width. */
const STRIP_RADIUS = 6 / 82

/** Card background — a warm off-white, so the card reads as paper next to the strip. */
const CARD_BG = '#fffdf9'
const TAGLINE_COLOR = '#94a3b8'
const BRAND_COLOR = '#0f172a'

export interface ShareCard {
  dataUrl: string
  blob: Blob | null
  width: number
  height: number
}

export interface ShareCardOptions {
  /** Brand wordmark, drawn under the strip if the logo image can't be loaded. */
  brand: string
  /** Small tagline under the logo. */
  tagline?: string
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/**
 * Wrap an already-composed photo strip in the shareable card: a 4:5 portrait
 * (the shape a social post wants) in off-white, with the strip standing in the
 * middle and the Momoto mark and tagline beneath it.
 *
 * The card is sized so the strip is drawn at its own resolution — never upscaled —
 * and the corners are left square: the preview and any post round them off
 * themselves, and a rounded PNG would have to carry transparency to do it.
 *
 * Returns a PNG data URL (for the preview) and a Blob (for the Web Share API).
 */
export async function composeShareCard(
  stripDataUrl: string,
  { brand, tagline }: ShareCardOptions
): Promise<ShareCard | null> {
  const strip = await loadImage(stripDataUrl)
  const stripW = strip.naturalWidth
  const stripH = strip.naturalHeight
  if (!stripW || !stripH) return null

  // The strip's own height decides the card's: everything else on the card is a
  // fraction of the card's width, so the height the strip leaves over is what's
  // left after those fractions are taken out.
  const perWidth = 2 * PAD + GAP + LOGO_H + LOGO_GAP + TAGLINE
  const height = Math.round(stripH / (1 - perWidth * CARD_ASPECT))
  const width = Math.round(height * CARD_ASPECT)

  const pad = Math.round(width * PAD)
  const gap = Math.round(width * GAP)
  const logoH = Math.round(width * LOGO_H)
  const logoGap = Math.round(width * LOGO_GAP)
  const taglineSize = Math.round(width * TAGLINE)

  const captionH = logoH + (tagline ? logoGap + taglineSize : 0)

  // A strip wider than the card allows (an unusually squat template) is scaled
  // down to fit rather than being cropped or stretched.
  const scale = Math.min(1, (width - pad * 2) / stripW)
  const drawW = Math.round(stripW * scale)
  const drawH = Math.round(stripH * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = CARD_BG
  ctx.fillRect(0, 0, width, height)

  // Strip + caption are centred as one block, so a shorter strip doesn't leave
  // the caption stranded at the bottom edge.
  const blockH = drawH + gap + captionH
  const top = Math.round((height - blockH) / 2)
  const centerX = Math.round(width / 2)
  const stripX = Math.round(centerX - drawW / 2)

  ctx.save()
  roundRectPath(ctx, stripX, top, drawW, drawH, Math.round(drawW * STRIP_RADIUS))
  ctx.clip()
  ctx.drawImage(strip, stripX, top, drawW, drawH)
  ctx.restore()

  // The mark itself, with the wordmark as the fallback if it can't be decoded —
  // an unbranded card is still worth sharing, a broken one isn't.
  const captionY = top + drawH + gap
  const logoBottom = captionY + logoH
  try {
    const logo = await loadImage(logoUrl)
    const logoW = Math.round((logo.naturalWidth / logo.naturalHeight) * logoH)
    ctx.drawImage(logo, Math.round(centerX - logoW / 2), captionY, logoW, logoH)
  } catch {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = BRAND_COLOR
    ctx.font = `700 ${logoH}px ${FONT_STACK}`
    ctx.fillText(brand, centerX, captionY)
  }

  if (tagline) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = TAGLINE_COLOR
    ctx.font = `500 ${taglineSize}px ${FONT_STACK}`
    ctx.fillText(tagline, centerX, logoBottom + logoGap)
  }

  const blob = await canvasToBlob(canvas)
  return { dataUrl: canvas.toDataURL('image/png'), blob, width, height }
}
