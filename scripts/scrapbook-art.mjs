#!/usr/bin/env node
// Generates the placeholder scrapbook template art (docs/PLAN-scrapbook.md §4a) from the
// same layout file the app's manifest reads, so the art and the slots can't drift apart:
//
//   src/constants/scrapbook/<template>.layout.json  →  src/assets/scrapbook/<template>/*.svg
//
//   node scripts/scrapbook-art.mjs [template]      (default: kraft-notes)
//
// The look of each template (paper, cards, tape, doodles) is its entry in THEMES below;
// a new template needs a layout file and a theme.
//
// Rules this keeps (plan §4, §7a):
// - Flat vector only — fills, strokes, simple shapes. No per-pixel texture: grain costs
//   more PDF bytes than every photo on the page combined (measured 54 KB vs 323–1190 KB a
//   page). Paper feel comes from colour, cards, tape and doodles.
// - No <text> and no embedded rasters: an SVG drawn through an <img> or a canvas can't
//   load web fonts, and librsvg silently drops embedded WebP.
// - Ornament is drawn only where no slot covers it, and slot frames/tape only as the
//   separate decoration SVGs, which the app draws over a slot *only when it is filled* —
//   so an empty slot reads as blank paper, not a gap.
// - Seeded, so a re-run reproduces the files byte for byte.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const templateId = process.argv[2] ?? 'kraft-notes'
const layout = JSON.parse(
  readFileSync(join(root, `src/constants/scrapbook/${templateId}.layout.json`), 'utf8')
)
const outDir = join(root, `src/assets/scrapbook/${templateId}`)
mkdirSync(outDir, { recursive: true })

const SEED = 20261015
const { width: W, height: H } = layout.page

/** mulberry32 — small, fast, good enough for placing doodles. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r1 = (n) => Math.round(n * 10) / 10

// ── Checks: fail loudly rather than ship art that collides with its own slots ──
const errors = []
for (const page of layout.pages) {
  for (const text of page.texts) {
    const needed = text.maxLines * text.size * text.lineHeight
    if (text.h + 0.5 < needed) {
      errors.push(
        `${page.id}/${text.id}: h ${text.h} < ${needed.toFixed(1)} (maxLines × size × lineHeight)`
      )
    }
  }
  for (const rect of [...page.strips, ...page.texts]) {
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > W || rect.y + rect.h > H) {
      errors.push(`${page.id}/${rect.id}: outside the page`)
    }
  }
  for (const strip of page.strips) {
    const deco = layout.decorations[strip.decoration]
    if (!deco) errors.push(`${page.id}/${strip.id}: unknown decoration ${strip.decoration}`)
    else if (deco.width !== strip.w || deco.height !== strip.h || deco.layout !== strip.layout) {
      errors.push(
        `${page.id}/${strip.id}: decoration ${strip.decoration} is sized for another slot`
      )
    }
  }
}
if (errors.length) {
  console.error(`scrapbook-art: ${templateId} layout is invalid:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}

// ── Shapes ───────────────────────────────────────────────────────────────────

function star(cx, cy, r, fill) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * 0.45
    pts.push(`${r1(cx + rr * Math.cos(a))},${r1(cy + rr * Math.sin(a))}`)
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`
}

/** A four-point twinkle — thinner waist than `star`, reads as a sparkle. */
function sparkle(cx, cy, r, fill) {
  const pts = []
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * 0.22
    pts.push(`${r1(cx + rr * Math.cos(a))},${r1(cy + rr * Math.sin(a))}`)
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`
}

function heart(cx, cy, s, fill) {
  return `<path transform="translate(${r1(cx)} ${r1(cy)}) scale(${r1(s / 20)})" d="M0 6C-4-4-18-2-18 8c0 9 12 15 18 21C6 23 18 17 18 8 18-2 4-4 0 6Z" fill="${fill}"/>`
}

/** Five round petals around a centre. */
function flower(cx, cy, r, petal, centre) {
  const parts = []
  for (let i = 0; i < 5; i++) {
    const a = ((Math.PI * 2) / 5) * i - Math.PI / 2
    parts.push(
      `<circle cx="${r1(cx + r * 0.55 * Math.cos(a))}" cy="${r1(cy + r * 0.55 * Math.sin(a))}" r="${r1(r * 0.42)}" fill="${petal}"/>`
    )
  }
  parts.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r * 0.3)}" fill="${centre}"/>`)
  return parts.join('')
}

function squiggle(x, y, len, stroke) {
  const seg = len / 4
  return `<path d="M${r1(x)} ${r1(y)} q${r1(seg / 2)} -26 ${r1(seg)} 0 t${r1(seg)} 0 t${r1(seg)} 0 t${r1(seg)} 0" fill="none" stroke="${stroke}" stroke-width="9" stroke-linecap="round"/>`
}

/** An axis-aligned box around a (possibly rotated) rect, grown by `pad`. */
function keepOut(rect, pad) {
  const angle = ((rect.rotate ?? 0) * Math.PI) / 180
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  const w = rect.w * cos + rect.h * sin
  const h = rect.w * sin + rect.h * cos
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  return { x: cx - w / 2 - pad, y: cy - h / 2 - pad, w: w + 2 * pad, h: h + 2 * pad }
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const CARD_PAD = 50

function cardRect(text) {
  return {
    x: text.x - CARD_PAD,
    y: text.y - CARD_PAD,
    w: text.w + 2 * CARD_PAD,
    h: text.h + 2 * CARD_PAD,
  }
}

/** A strip of washi tape: a tinted band with pale stripes across it. */
function washi(cx, cy, tw, th, rot, fill) {
  const x = cx - tw / 2
  const y = cy - th / 2
  const stripes = []
  for (let sx = x + 22; sx < x + tw - 10; sx += 40) {
    stripes.push(
      `<rect x="${r1(sx)}" y="${r1(y)}" width="14" height="${th}" fill="#ffffff" opacity="0.45"/>`
    )
  }
  return (
    `<g transform="rotate(${rot} ${r1(cx)} ${r1(cy)})">` +
    `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(tw)}" height="${th}" fill="${fill}" opacity="0.88"/>` +
    stripes.join('') +
    `</g>`
  )
}

// ── Themes ───────────────────────────────────────────────────────────────────
// Everything that makes one template look like itself. Layout (where slots sit) lives in
// the layout file; this is only paint. Each theme is drawn with the same seeded `rand`
// stream, in the same order, so a re-run stays byte for byte.

const KRAFT_INK = '#4a3826'

const kraftNotes = {
  card: '#f7f0e2',
  cardShadow: '#b89466',
  rule: '#dccbae',
  paper(rand) {
    const parts = [`<rect width="${W}" height="${H}" fill="#d8bb8f"/>`]
    // Large flat tone patches: paper that isn't one flat colour, at almost no byte cost.
    for (let i = 0; i < 7; i++) {
      const fill = i % 2 ? '#cfae7f' : '#e0c79f'
      parts.push(
        `<ellipse cx="${r1(rand() * W)}" cy="${r1(rand() * H)}" rx="${r1(260 + rand() * 420)}" ry="${r1(180 + rand() * 320)}" fill="${fill}" opacity="0.55"/>`
      )
    }
    // Stitched border.
    parts.push(
      `<rect x="64" y="64" width="${W - 128}" height="${H - 128}" rx="18" fill="none" stroke="#a8875c" stroke-width="5" stroke-dasharray="22 16" stroke-linecap="round"/>`
    )
    return parts
  },
  label({ x, y, w, h }, accent) {
    return (
      `<rect x="${x + 10}" y="${y + 14}" width="${w}" height="${h}" rx="14" fill="${this.cardShadow}"/>` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${this.card}"/>` +
      `<rect x="${x}" y="${y + h - 46}" width="${w}" height="22" fill="${accent}"/>`
    )
  },
  cardTape(card, accent, rand) {
    return `<rect x="${r1(card.x + card.w / 2 - 110)}" y="${card.y - 34}" width="220" height="72" fill="${accent}" opacity="0.8" transform="rotate(${r1((rand() - 0.5) * 8)} ${r1(card.x + card.w / 2)} ${card.y})"/>`
  },
  /** One doodle at (x, y), or null to skip this spot without placing anything. */
  doodle(x, y, size, rand, accent, blocked) {
    const kind = Math.floor(rand() * 4)
    const fill = rand() < 0.6 ? accent : KRAFT_INK
    if (kind === 0) return star(x, y, size, fill)
    if (kind === 1) return heart(x, y, size, fill)
    if (kind === 2)
      return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(size * 0.35)}" fill="${fill}"/>`
    const len = size * 3
    const wide = { x: x - 10, y: y - 40, w: len + 20, h: 80 }
    if (blocked.some((b) => overlaps(b, wide)) || x + len > W - 110) return null
    return squiggle(x, y, len, fill)
  },
  decorations: {
    tape(w, h, m) {
      const tape = (cx, cy, rot) => {
        const tw = Math.min(260, w * 0.5)
        const th = 92
        return (
          `<g transform="rotate(${rot} ${cx} ${cy})">` +
          `<rect x="${r1(cx - tw / 2)}" y="${r1(cy - th / 2)}" width="${r1(tw)}" height="${th}" fill="#f4ead2" opacity="0.88"/>` +
          `<rect x="${r1(cx - tw / 2)}" y="${r1(cy - th / 2 + 18)}" width="${r1(tw)}" height="8" fill="#e6d6b4" opacity="0.9"/>` +
          `<rect x="${r1(cx - tw / 2)}" y="${r1(cy + th / 2 - 26)}" width="${r1(tw)}" height="8" fill="#e6d6b4" opacity="0.9"/>` +
          `</g>`
        )
      }
      return [tape(m + w / 2, m + 8, -4), tape(m + w / 2, m + h - 8, 3)]
    },
    corners(w, h, m) {
      const c = 120
      const corner = (x, y, sx, sy) =>
        `<path d="M${x} ${y} l${sx * c} 0 l${-sx * c} ${sy * c} Z" fill="${KRAFT_INK}" transform="translate(${-sx * 18} ${-sy * 18})"/>`
      return [
        corner(m, m, 1, 1),
        corner(m + w, m, -1, 1),
        corner(m, m + h, 1, -1),
        corner(m + w, m + h, -1, -1),
      ]
    },
  },
}

const GINGHAM_FRAME = 110
const GINGHAM_RED = '#e46a6f'
const GINGHAM_TAPE = '#f4a9ba'

const pinkGingham = {
  card: '#ffffff',
  cardShadow: '#f1c3cd',
  rule: '#f5d6dd',
  paper() {
    // Gingham is two sets of translucent bands crossing: where they meet the colour
    // doubles up into the darker check. ~36 rects a page — flat vector, no pattern fill.
    const band = 60
    const parts = [`<rect width="${W}" height="${H}" fill="#fdf0f2"/>`]
    for (let x = 0; x < W; x += band * 2) {
      parts.push(`<rect x="${x}" width="${band}" height="${H}" fill="#f19fb2" opacity="0.4"/>`)
    }
    for (let y = 0; y < H; y += band * 2) {
      parts.push(`<rect y="${y}" width="${W}" height="${band}" fill="#f19fb2" opacity="0.4"/>`)
    }
    // The writing paper, framed by the check, with a running stitch just inside.
    const f = GINGHAM_FRAME
    parts.push(
      `<rect x="${f}" y="${f}" width="${W - 2 * f}" height="${H - 2 * f}" rx="30" fill="#fffaf6"/>`,
      `<rect x="${f + 26}" y="${f + 26}" width="${W - 2 * f - 52}" height="${H - 2 * f - 52}" rx="20" fill="none" stroke="#f3b4c2" stroke-width="5" stroke-dasharray="18 14" stroke-linecap="round"/>`
    )
    return parts
  },
  label({ x, y, w, h }, accent) {
    // A white card with a gingham-red ribbon and a heart at each top corner.
    return (
      `<rect x="${x + 10}" y="${y + 14}" width="${w}" height="${h}" rx="22" fill="${this.cardShadow}"/>` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${this.card}"/>` +
      `<rect x="${x}" y="${y + h - 50}" width="${w}" height="14" fill="${accent}"/>` +
      `<rect x="${x}" y="${y + h - 30}" width="${w}" height="6" fill="${accent}" opacity="0.5"/>` +
      heart(x + 70, y + 64, 30, accent) +
      heart(x + w - 70, y + 64, 30, accent)
    )
  },
  cardTape(card, accent, rand) {
    return washi(card.x + card.w / 2, card.y, 220, 72, r1((rand() - 0.5) * 8), accent)
  },
  doodle(x, y, size, rand, accent) {
    const kind = Math.floor(rand() * 4)
    const fill = rand() < 0.65 ? accent : GINGHAM_RED
    if (kind === 0) return heart(x, y, size, fill)
    if (kind === 1) return flower(x, y, size * 0.8, fill, '#f2cf6b')
    if (kind === 2) return sparkle(x, y, size * 0.9, fill)
    return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(size * 0.3)}" fill="${fill}"/>`
  },
  decorations: {
    washi(w, h, m) {
      const tw = Math.min(260, w * 0.5)
      return [
        washi(m + w / 2, m + 8, tw, 92, -4, GINGHAM_TAPE),
        washi(m + w / 2, m + h - 8, tw, 92, 3, GINGHAM_TAPE),
      ]
    },
    'washi-corners'(w, h, m) {
      // Kept inside the margin: a 200×70 strip at 45° reaches ~95 from its centre.
      const inset = 28
      return [
        washi(m + inset, m + inset, 200, 70, -45, GINGHAM_TAPE),
        washi(m + w - inset, m + inset, 200, 70, 45, GINGHAM_TAPE),
        washi(m + inset, m + h - inset, 200, 70, 45, GINGHAM_TAPE),
        washi(m + w - inset, m + h - inset, 200, 70, -45, GINGHAM_TAPE),
      ]
    },
  },
}

const THEMES = { 'kraft-notes': kraftNotes, 'pink-gingham': pinkGingham }
const theme = THEMES[templateId]
if (!theme) {
  console.error(`scrapbook-art: no theme for ${templateId} — add one to THEMES`)
  process.exit(1)
}
for (const [name, deco] of Object.entries(layout.decorations)) {
  if (!theme.decorations[deco.style]) {
    console.error(`scrapbook-art: ${templateId} has no "${deco.style}" decoration (${name})`)
    process.exit(1)
  }
}

// ── Pages ────────────────────────────────────────────────────────────────────

function pageSvg(page, index) {
  const rand = rng(SEED + index * 101)
  const parts = [...theme.paper(rand)]

  const blocked = page.strips.map((strip) => keepOut(strip, 110))

  // The cover's title label.
  if (page.label) {
    const { x, y, w, h, rotate = 0 } = page.label
    const cx = x + w / 2
    const cy = y + h / 2
    parts.push(
      `<g transform="rotate(${rotate} ${cx} ${cy})">` +
        theme.label({ x, y, w, h }, page.accent) +
        `</g>`
    )
    blocked.push(keepOut(page.label, 60))
  }

  for (const text of page.texts) {
    if (text.card) {
      const card = cardRect(text)
      parts.push(
        `<rect x="${card.x + 10}" y="${card.y + 14}" width="${card.w}" height="${card.h}" rx="12" fill="${theme.cardShadow}"/>`,
        `<rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="12" fill="${theme.card}"/>`
      )
      // Ruled lines sit under each line box the text layout will fill, so written text
      // lands on them — the same line height the app draws with.
      const lineH = text.size * text.lineHeight
      for (let i = 1; i <= text.maxLines; i++) {
        const y = r1(text.y + i * lineH - lineH * 0.14)
        parts.push(
          `<line x1="${text.x}" y1="${y}" x2="${text.x + text.w}" y2="${y}" stroke="${theme.rule}" stroke-width="3"/>`
        )
      }
      // A strip of tape holding the card down.
      parts.push(theme.cardTape(card, page.accent, rand))
      blocked.push(keepOut(card, 70))
    } else {
      blocked.push(keepOut(text, 50))
    }
    // A brush underline beneath headings, in the page's accent.
    if (text.placeholder === 'heading') {
      const width = Math.min(360, text.w * 0.5)
      const x = text.align === 'center' ? text.x + (text.w - width) / 2 : text.x
      parts.push(
        `<rect x="${r1(x)}" y="${r1(text.y + text.h + 14)}" width="${r1(width)}" height="16" rx="8" fill="${page.accent}"/>`
      )
    }
  }

  // Doodles, only where nothing will be drawn over them.
  let placed = 0
  for (let tries = 0; tries < 400 && placed < 12; tries++) {
    const size = 34 + rand() * 40
    const x = 110 + rand() * (W - 220)
    const y = 110 + rand() * (H - 220)
    const box = { x: x - size, y: y - size, w: size * 2, h: size * 2 }
    if (blocked.some((b) => overlaps(b, box))) continue
    const doodle = theme.doodle(x, y, size, rand, page.accent, blocked)
    if (doodle === null) continue
    parts.push(doodle)
    blocked.push(box)
    placed++
  }

  return svg(W, H, parts)
}

// ── Decorations (drawn over a slot only when it holds a strip) ───────────────

function decorationSvg(deco) {
  const { width: w, height: h, margin: m, style } = deco
  return svg(w + 2 * m, h + 2 * m, theme.decorations[style](w, h, m))
}

function svg(w, h, parts) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    parts.join('') +
    `</svg>\n`
  )
}

let bytes = 0
layout.pages.forEach((page, index) => {
  const file = join(outDir, `page-${page.id}.svg`)
  const out = pageSvg(page, index)
  writeFileSync(file, out)
  bytes += out.length
})
for (const [name, deco] of Object.entries(layout.decorations)) {
  const out = decorationSvg(deco)
  writeFileSync(join(outDir, `deco-${name}.svg`), out)
  bytes += out.length
}
console.log(
  `scrapbook-art: wrote ${layout.pages.length} pages + ${Object.keys(layout.decorations).length} decorations for ${templateId} (${(bytes / 1024).toFixed(1)} KB)`
)
