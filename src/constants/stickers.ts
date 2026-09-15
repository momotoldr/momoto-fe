import bolt from '@/assets/stickers/bolt.svg'
import bunny from '@/assets/stickers/bunny.svg'
import bunnyYellow from '@/assets/stickers/bunny-yellow.svg'
import cat from '@/assets/stickers/cat.svg'
import clip from '@/assets/stickers/clip.svg'
import cloud from '@/assets/stickers/cloud.svg'
import crown from '@/assets/stickers/crown.svg'
import cuteRainbow from '@/assets/stickers/cute-rainbow.svg'
import faceBear from '@/assets/stickers/face-bear.svg'
import faceHeart from '@/assets/stickers/face-heart.svg'
import flower from '@/assets/stickers/flower.svg'
import flowers from '@/assets/stickers/flowers.svg'
import frog from '@/assets/stickers/frog.svg'
import heartColorful from '@/assets/stickers/heart-colorful.svg'
import heart from '@/assets/stickers/heart.svg'
import rainbow from '@/assets/stickers/rainbow.svg'
import smileFlower from '@/assets/stickers/smile-flower.svg'
import smiley from '@/assets/stickers/smiley.svg'
import smiling from '@/assets/stickers/smiling.svg'
import snail from '@/assets/stickers/snail.svg'
import sparkle from '@/assets/stickers/sparkle.svg'
import speech from '@/assets/stickers/speech.svg'
import star from '@/assets/stickers/star.svg'
import stars from '@/assets/stickers/stars.svg'
import sun from '@/assets/stickers/sun.svg'

/**
 * The sticker palette shown on the arrange screen. Each sticker is a bundled SVG
 * (Vite fingerprints it to a same-origin URL), so it renders as an `<img>` in the
 * DOM preview and via `drawImage` in the composed PNG. Same-origin assets don't
 * taint the canvas, so the strip stays downloadable (`toDataURL`).
 */
export interface StickerOption {
  id: string
  /** Bundled asset URL for the sticker image. */
  src: string
  /** i18n key suffix under `stickers.*` for the accessible label. */
  label: string
}

export const STICKERS: StickerOption[] = [
  { id: 'heart', src: heart, label: 'heart' },
  { id: 'star', src: star, label: 'star' },
  { id: 'sparkle', src: sparkle, label: 'sparkle' },
  { id: 'crown', src: crown, label: 'crown' },
  { id: 'flower', src: flower, label: 'flower' },
  { id: 'rainbow', src: rainbow, label: 'rainbow' },
  { id: 'bolt', src: bolt, label: 'bolt' },
  { id: 'speech', src: speech, label: 'speech' },
  { id: 'smiley', src: smiley, label: 'smiley' },
  { id: 'cloud', src: cloud, label: 'cloud' },
  { id: 'bunny', src: bunny, label: 'bunny' },
  { id: 'clip', src: clip, label: 'clip' },
  { id: 'cuteRainbow', src: cuteRainbow, label: 'cuteRainbow' },
  { id: 'faceBear', src: faceBear, label: 'faceBear' },
  { id: 'faceHeart', src: faceHeart, label: 'faceHeart' },
  { id: 'flowers', src: flowers, label: 'flowers' },
  { id: 'smileFlower', src: smileFlower, label: 'smileFlower' },
  { id: 'heartColorful', src: heartColorful, label: 'heartColorful' },
  { id: 'smiling', src: smiling, label: 'smiling' },
  { id: 'sun', src: sun, label: 'sun' },
  { id: 'stars', src: stars, label: 'stars' },
  { id: 'frog', src: frog, label: 'frog' },
  { id: 'bunnyYellow', src: bunnyYellow, label: 'bunnyYellow' },
  { id: 'cat', src: cat, label: 'cat' },
  { id: 'snail', src: snail, label: 'snail' },
]

/** A sticker placed on the strip. Position/size are fractions of the photo-grid
 * content box (the region containing the cuts, excluding the footer), so the
 * same values map identically to the live preview and the composed canvas.
 * Stickers are drawn in a square box (the SVG art is square). */
export interface PlacedSticker {
  /** Unique instance id (a palette sticker can be placed many times). */
  id: string
  /** The sticker image URL (from a `StickerOption`). */
  src: string
  /** Center X as a fraction [0..1] of the grid content width. */
  x: number
  /** Center Y as a fraction [0..1] of the grid content height. */
  y: number
  /** Sticker size as a fraction of the grid content width. */
  size: number
  /** Clockwise rotation in degrees (about the sticker's center). */
  rotation: number
}

/** Default size (fraction of strip width) a sticker is placed at. */
export const STICKER_DEFAULT_SIZE = 0.22
export const STICKER_MIN_SIZE = 0.08
export const STICKER_MAX_SIZE = 0.9
