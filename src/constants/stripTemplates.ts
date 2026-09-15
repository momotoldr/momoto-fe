import bestFriends from '@/assets/templates/best-friends.svg'
import birthday from '@/assets/templates/birthday.svg'
import blueWhiteRetro from '@/assets/templates/blue-white-retro.svg'
import classic from '@/assets/templates/classic.svg'
import film from '@/assets/templates/film.svg'
import greenRed from '@/assets/templates/green-red.svg'
import hearts from '@/assets/templates/hearts.svg'
import holo from '@/assets/templates/holo.svg'
import kraft from '@/assets/templates/kraft.svg'
import midnightGold from '@/assets/templates/midnight-gold.svg'
import newspaper from '@/assets/templates/newspaper.svg'
import nordic from '@/assets/templates/nordic.svg'
import orangeColorful from '@/assets/templates/orange-colorful.svg'
import sageBotanical from '@/assets/templates/sage-botanical.svg'
import sunset from '@/assets/templates/sunset.svg'
import terrazzo from '@/assets/templates/terrazzo.svg'

/** A photo slot as fractions [0..1] of the strip's width/height. */
export interface PhotoSlot {
  x: number
  y: number
  w: number
  h: number
  /**
   * Corner radius of the slot, as a fraction of the strip's *width* (so it stays
   * circular, not elliptical, once the strip's aspect is applied). Omit for the
   * square-cornered frames most templates use.
   */
  radius?: number
}

/**
 * How a template arranges its four photos — and, because the two arrangements need
 * different paper, the shape of the strip itself. Named after the grid the guest
 * sees, since that is the only thing they are choosing between.
 *
 * `4x1` is the classic 1:3 ribbon; `2x2` is a 2:3 card. The picker groups by this.
 */
export type StripLayout = '4x1' | '2x2'

/** Layout groups in picker order — the ribbon leads, being what most people expect. */
export const STRIP_LAYOUTS: StripLayout[] = ['4x1', '2x2']

export interface StripTemplate {
  id: string
  /** i18n key suffix under `templates.*` for the label. */
  label: string
  /** Bundled SVG background url (Vite fingerprints it to a same-origin URL). */
  src: string
  /** Strip aspect ratio (width / height). */
  aspect: number
  /** Which photo arrangement this template uses; the picker groups on it. */
  layout: StripLayout
  /**
   * Fixed photo slots, in slot order — top→bottom for a stacked strip, reading
   * order (TL, TR, BL, BR) for a grid one. Photos are cover-cropped into these and
   * drawn ON TOP of the background art. Exactly 4 to match the 4-cut capture
   * pipeline.
   */
  slots: PhotoSlot[]
  /**
   * Optional band where composeStrip draws the (dynamic) date, centered. `y` is
   * the vertical center as a fraction of strip height; `color` is the text color.
   */
  footer?: { y: number; color: string }
}
// Define available template keys
export type StackedTemplateId =
  'default' | 'newspaper' | 'orange' | 'retro' | 'birthday' | 'bestFriends'

// Centralize layouts in a lookup object
const STACKED_LAYOUTS: Record<StackedTemplateId, PhotoSlot[]> = {
  default: [
    { x: 0.06667, y: 0.02222, w: 0.86667, h: 0.20667 },
    { x: 0.06667, y: 0.24222, w: 0.86667, h: 0.20667 },
    { x: 0.06667, y: 0.46222, w: 0.86667, h: 0.20667 },
    { x: 0.06667, y: 0.68222, w: 0.86667, h: 0.20667 },
  ],
  newspaper: [
    { x: 0.03667, y: 0.14311, w: 0.9221, h: 0.185 },
    { x: 0.03667, y: 0.341, w: 0.9221, h: 0.185 },
    { x: 0.03667, y: 0.541, w: 0.9221, h: 0.185 },
    { x: 0.03667, y: 0.741, w: 0.9221, h: 0.185 },
  ],
  orange: [
    { x: 0.06667, y: 0.02222, w: 0.86667, h: 0.195 },
    { x: 0.06667, y: 0.22222, w: 0.86667, h: 0.195 },
    { x: 0.06667, y: 0.42222, w: 0.86667, h: 0.195 },
    { x: 0.06667, y: 0.62222, w: 0.86667, h: 0.195 },
  ],
  retro: [
    { x: 0.077, y: 0.1323, w: 0.853, h: 0.17 },
    { x: 0.077, y: 0.323, w: 0.853, h: 0.17 },
    { x: 0.077, y: 0.514, w: 0.853, h: 0.17 },
    { x: 0.077, y: 0.705, w: 0.853, h: 0.17 },
  ],
  /**
   * The four rounded white cards in birthday.svg, read straight off its art
   * (144 x 432 units). They are the widest cuts of any 4x1 design — 0.911 of the
   * strip against a 0.168 band — because the bunting has to clear the top; that
   * makes the slot 1.81, so the live tile is a wider letterbox here than on the
   * other ribbons. `x` drifts left by ~0.19 art units per card: the cards are
   * hand-placed with a slight lean, and matching it keeps the photos on the art.
   */
  birthday: [
    { x: 0.046251, y: 0.100559, w: 0.911323, h: 0.167951, radius: 0.046292 },
    { x: 0.044922, y: 0.294551, w: 0.911296, h: 0.16796, radius: 0.046292 },
    { x: 0.043566, y: 0.488553, w: 0.911323, h: 0.16796, radius: 0.046292 },
    { x: 0.042236, y: 0.682554, w: 0.911296, h: 0.16796, radius: 0.046292 },
  ],
  /**
   * The four framed cuts in best-friends.svg (144 x 432 art units).
   *
   * Taken from the *inside* of each frame's 1.5-unit black rule, not from the art's
   * own photo plate, which sits a further 0.15 in. The plate is a raster placeholder
   * baked into the SVG, so a slot that merely matched it could leave a hairline of
   * placeholder showing on a rounding error; running the photo up to the rule cannot.
   *
   * `x` drifts *right* by ~0.27 units per frame (birthday leans the other way) — the
   * stack is drawn with a slight tilt, and matching it keeps the cuts on the art.
   * No `radius`: these frames are square-cornered, like kraft's.
   */
  bestFriends: [
    { x: 0.049421, y: 0.135359, w: 0.89738, h: 0.183322 },
    { x: 0.051298, y: 0.339535, w: 0.89738, h: 0.183322 },
    { x: 0.053175, y: 0.54371, w: 0.89738, h: 0.183322 },
    { x: 0.055052, y: 0.747885, w: 0.89738, h: 0.183322 },
  ],
}

// Getter function with optional fallback
export const getStackedSlots = (templateId: StackedTemplateId = 'default'): PhotoSlot[] => {
  return STACKED_LAYOUTS[templateId] ?? STACKED_LAYOUTS.default
}

const STRIP_ASPECT = 600 / 1800

/** green-red is a wide 2x2 card, not a 1:3 strip — its art is 897.625 x 850.5. */
const GREEN_RED_ASPECT = 897.625 / 850.5

/**
 * green-red's four rounded frames, as a 2x2 grid in reading order (TL, TR, BL, BR).
 *
 * The frames are 4:3 (414.16 x 310.62 art units), which is the whole reason the card
 * is this wide: at the original 2:3 card they were portrait 0.80, and the live camera
 * — shaped to the slot it fills — came out a tight vertical sliver. 4:3 puts the cut
 * within a hair of what the 4x1 strips give (1.33 vs 1.40), so the booth frames the
 * same way whichever grid you pick.
 */
const GREEN_RED_SLOTS: PhotoSlot[] = [
  { x: 0.02507, y: 0.06663, w: 0.46139, h: 0.36522, radius: 0.02923 },
  { x: 0.51354, y: 0.06663, w: 0.46139, h: 0.36522, radius: 0.02923 },
  { x: 0.02507, y: 0.4512, w: 0.46139, h: 0.36522, radius: 0.02923 },
  { x: 0.51354, y: 0.4512, w: 0.46139, h: 0.36522, radius: 0.02923 },
]

/** terrazzo is a 900 x 800 card — the same 4:3 frames as green-red, its own gutters. */
const TERRAZZO_ASPECT = 900 / 800

/**
 * terrazzo's four frames, 2x2 in reading order (TL, TR, BL, BR).
 *
 * The art frames sit 12 units proud of these, the way classic and hearts are built, so
 * an even white border shows around each (opaque) photo. Slots are 4:3, matching
 * green-red — a 2x2 grid should frame the camera the same way whichever design is on.
 */
const TERRAZZO_SLOTS: PhotoSlot[] = [
  { x: 0.05111, y: 0.0575, w: 0.41667, h: 0.35156, radius: 0.01556 },
  { x: 0.53222, y: 0.0575, w: 0.41667, h: 0.35156, radius: 0.01556 },
  { x: 0.05111, y: 0.48156, w: 0.41667, h: 0.35156, radius: 0.01556 },
  { x: 0.53222, y: 0.48156, w: 0.41667, h: 0.35156, radius: 0.01556 },
]

/** midnight-gold is an 888 x 800 card — 4:3 frames again, a thinner matte. */
const MIDNIGHT_GOLD_ASPECT = 888 / 800

/**
 * midnight-gold's four frames, 2x2 in reading order (TL, TR, BL, BR).
 *
 * The gold art frames sit only 8 units proud (terrazzo uses 12): on a dark ground a
 * wide mount reads as a slab, where a thin edge reads as a gilt frame. Slots are 4:3
 * like the other 2x2 designs, so the live camera is framed the same on all of them.
 */
const MIDNIGHT_GOLD_SLOTS: PhotoSlot[] = [
  { x: 0.04279, y: 0.0475, w: 0.43243, h: 0.36, radius: 0.00901 },
  { x: 0.52478, y: 0.0475, w: 0.43243, h: 0.36, radius: 0.00901 },
  { x: 0.04279, y: 0.4625, w: 0.43243, h: 0.36, radius: 0.00901 },
  { x: 0.52478, y: 0.4625, w: 0.43243, h: 0.36, radius: 0.00901 },
]

/** sunset is a 900 x 800 card; kraft is 880 x 790. Both keep the family's 4:3 slots. */
const SUNSET_ASPECT = 900 / 800
const KRAFT_ASPECT = 880 / 790

const SUNSET_SLOTS: PhotoSlot[] = [
  { x: 0.04444, y: 0.05, w: 0.42778, h: 0.36094, radius: 0.01111 },
  { x: 0.52778, y: 0.05, w: 0.42778, h: 0.36094, radius: 0.01111 },
  { x: 0.04444, y: 0.47344, w: 0.42778, h: 0.36094, radius: 0.01111 },
  { x: 0.52778, y: 0.47344, w: 0.42778, h: 0.36094, radius: 0.01111 },
]

/** No `radius`: kraft's prints are square-cornered, taped down at two corners. */
const KRAFT_SLOTS: PhotoSlot[] = [
  { x: 0.05455, y: 0.06076, w: 0.41136, h: 0.34367 },
  { x: 0.53409, y: 0.06076, w: 0.41136, h: 0.34367 },
  { x: 0.05455, y: 0.48038, w: 0.41136, h: 0.34367 },
  { x: 0.53409, y: 0.48038, w: 0.41136, h: 0.34367 },
]

export const STRIP_TEMPLATES: StripTemplate[] = [
  {
    id: 'classic',
    label: 'classic',
    src: classic,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('default'),
    footer: { y: 0.945, color: '#2b2b2b' },
  },
  {
    id: 'film',
    label: 'film',
    src: film,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('default'),
    footer: { y: 0.945, color: '#f4f4f5' },
  },
  {
    id: 'hearts',
    label: 'hearts',
    src: hearts,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('default'),
    footer: { y: 0.945, color: '#d6488a' },
  },
  {
    id: 'newspaper',
    label: 'newspaper',
    src: newspaper,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('newspaper'),
  },
  {
    id: 'orangeColorful',
    label: 'orangeColorful',
    src: orangeColorful,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('orange'),
  },
  {
    id: 'blueWhiteRetro',
    label: 'blueWhiteRetro',
    src: blueWhiteRetro,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('retro'),
  },
  {
    id: 'sageBotanical',
    label: 'sageBotanical',
    src: sageBotanical,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('default'),
    footer: { y: 0.945, color: '#5a6b4e' },
  },
  {
    id: 'holo',
    label: 'holo',
    src: holo,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('default'),
    footer: { y: 0.945, color: '#ffffff' },
  },
  {
    id: 'nordic',
    label: 'nordic',
    src: nordic,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('default'),
    footer: { y: 0.945, color: '#52525b' },
  },
  {
    id: 'birthday',
    label: 'birthday',
    src: birthday,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('birthday'),
    // Not the 0.945 the other ribbons use: down there the art has a pile of gift
    // boxes. 0.879 is the clear band between the last card and the presents.
    footer: { y: 0.879, color: '#405f96' },
  },
  {
    id: 'bestFriends',
    label: 'bestFriends',
    src: bestFriends,
    aspect: STRIP_ASPECT,
    layout: '4x1',
    slots: getStackedSlots('bestFriends'),
    // No footer, like newspaper and blueWhiteRetro: the art ends in its own
    // "@momoto.ldr" pill, and the 13.7 units left between the last frame and that
    // pill can't hold the two-line date band without it reading as cramped.
  },
  {
    id: 'greenRed',
    label: 'greenRed',
    src: greenRed,
    aspect: GREEN_RED_ASPECT,
    layout: '2x2',
    slots: GREEN_RED_SLOTS,
  },
  {
    id: 'terrazzo',
    label: 'terrazzo',
    src: terrazzo,
    aspect: TERRAZZO_ASPECT,
    layout: '2x2',
    slots: TERRAZZO_SLOTS,
    footer: { y: 0.932, color: '#6b5a4a' },
  },
  {
    id: 'midnightGold',
    label: 'midnightGold',
    src: midnightGold,
    aspect: MIDNIGHT_GOLD_ASPECT,
    layout: '2x2',
    slots: MIDNIGHT_GOLD_SLOTS,
    footer: { y: 0.9163, color: '#e0c07a' },
  },
  {
    id: 'sunset',
    label: 'sunset',
    src: sunset,
    aspect: SUNSET_ASPECT,
    layout: '2x2',
    slots: SUNSET_SLOTS,
    footer: { y: 0.9234, color: '#7c3a5e' },
  },
  {
    id: 'kraft',
    label: 'kraft',
    src: kraft,
    aspect: KRAFT_ASPECT,
    layout: '2x2',
    slots: KRAFT_SLOTS,
    footer: { y: 0.9222, color: '#4a3a2a' },
  },
]

/**
 * Aspect (width / height) of a template's photo slot, in real strip pixels.
 *
 * Slot geometry is stored as fractions of the strip, so a slot's own w/h ratio has
 * to be scaled by the strip's aspect to become a real one. The stacked strips land
 * between 1.40 and 1.81 — landscape; the green-red grid is portrait (~0.80), so
 * nothing downstream may assume a landscape cut.
 *
 * This is what the capture pipeline sizes a cut to (see captureCompositeFrame) and
 * what the live preview tiles are shaped to, so that what you frame is what
 * composeStrip cover-crops into the slot. Slots within a template are uniform, so
 * the first one speaks for all four.
 */
export function slotAspect(template: StripTemplate): number {
  const slot = template.slots[0]
  if (!slot || !slot.h) return 1
  return (slot.w / slot.h) * template.aspect
}

/**
 * A slot's corner radius as a CSS `border-radius`, for the DOM overlays that mirror
 * composeStrip (StripPreview, StripSelector).
 *
 * `radius` is a fraction of the strip's *width*, but a single percentage
 * `border-radius` resolves its horizontal half against the box's width and its
 * vertical half against the box's height — on a portrait slot that reads as a
 * visibly squashed ellipse. So emit the two-axis `h% / v%` form, converting the
 * vertical half through the strip aspect. Returns `undefined` for square slots, so
 * the class's own radius (if any) still applies.
 */
export function slotRadius(slot: PhotoSlot, aspect: number): string | undefined {
  if (!slot.radius || !slot.w || !slot.h) return undefined
  const horizontal = (slot.radius / slot.w) * 100
  const vertical = ((slot.radius * aspect) / slot.h) * 100
  return `${horizontal}% / ${vertical}%`
}

/**
 * Templates of one layout, in registry order. The picker shows one layout at a time,
 * behind a grid toggle, rather than one mixed row: a 2x2 card is 2:3 where a 4x1
 * ribbon is 1:3, so side by side the odd one out reads as a broken thumbnail instead
 * of a different format.
 */
export function templatesForLayout(layout: StripLayout): StripTemplate[] {
  return STRIP_TEMPLATES.filter((template) => template.layout === layout)
}

export const STRIP_TEMPLATE_MAP = Object.fromEntries(
  STRIP_TEMPLATES.map((template) => [template.id, template])
) as Record<string, StripTemplate>

export const DEFAULT_TEMPLATE_ID = STRIP_TEMPLATES[0].id
