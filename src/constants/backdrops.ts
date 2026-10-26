import blue from '@/assets/backdrops/background-blue.svg'
import beach from '@/assets/backdrops/beach.webp'
import curtain from '@/assets/backdrops/blue-gorden.webp'
import blush from '@/assets/backdrops/blush.svg'
import bokeh from '@/assets/backdrops/bokeh.svg'
import checker from '@/assets/backdrops/checker.svg'
import confetti from '@/assets/backdrops/confetti.svg'
import lake from '@/assets/backdrops/lake.webp'
import nightSky from '@/assets/backdrops/night-sky.webp'
import sky from '@/assets/backdrops/sky.svg'
import studio from '@/assets/backdrops/studio.svg'
import sunset from '@/assets/backdrops/sunset.svg'
import villa from '@/assets/backdrops/villa.webp'
import { env } from '@/env'

/**
 * Backdrops that can replace the background behind the people in a cut, chosen on the
 * arrange screen after capture (see `utils/backdrop`).
 *
 * A backdrop spans the **whole cut**, not each camera's cell, so everyone in a date or
 * group cut stands in front of the same scene. Art is 4:3 and cover-cropped to the cut
 * (1.33–1.67 across the templates), so keep anything that matters near the centre.
 * Photo backdrops are 1600×1200 WebP rasterized from the designer's SVG exports, which
 * embed multi-megabyte JPEGs — the picker loads every option's art as its thumbnail.
 *
 * Like the filter, a backdrop is each member's own design choice and never crosses the
 * wire (see per-user strip design in `StripSelector`).
 */
export type BackdropId =
  | 'none'
  | 'studio'
  | 'blush'
  | 'sunset'
  | 'bokeh'
  | 'confetti'
  | 'checker'
  | 'sky'
  | 'blue'
  | 'curtain'
  | 'beach'
  | 'lake'
  | 'villa'
  | 'nightSky'

/** Groups for the picker's category chips, in chip order. */
export const BACKDROP_CATEGORIES = ['colors', 'patterns', 'scenery'] as const
export type BackdropCategory = (typeof BACKDROP_CATEGORIES)[number]

export interface BackdropOption {
  id: BackdropId
  /** Bundled art, or null for `none` — the camera's own background. */
  src: string | null
  /** i18n key suffix under `backdrops.*`. */
  label: string
  /**
   * Group for the category chips (`backdrops.categories.*`). Left off `none`, so
   * Original shows under every chip.
   */
  category?: BackdropCategory
}

export const BACKDROPS: BackdropOption[] = [
  { id: 'none', src: null, label: 'none' },
  { id: 'studio', src: studio, label: 'studio', category: 'colors' },
  { id: 'blush', src: blush, label: 'blush', category: 'colors' },
  { id: 'sunset', src: sunset, label: 'sunset', category: 'colors' },
  { id: 'bokeh', src: bokeh, label: 'bokeh', category: 'patterns' },
  { id: 'confetti', src: confetti, label: 'confetti', category: 'patterns' },
  { id: 'checker', src: checker, label: 'checker', category: 'patterns' },
  { id: 'sky', src: sky, label: 'sky', category: 'patterns' },
  { id: 'blue', src: blue, label: 'blue', category: 'colors' },
  { id: 'curtain', src: curtain, label: 'curtain', category: 'patterns' },
  { id: 'beach', src: beach, label: 'beach', category: 'scenery' },
  { id: 'lake', src: lake, label: 'lake', category: 'scenery' },
  { id: 'villa', src: villa, label: 'villa', category: 'scenery' },
  { id: 'nightSky', src: nightSky, label: 'nightSky', category: 'scenery' },
]

export const BACKDROP_MAP = Object.fromEntries(
  BACKDROPS.map((backdrop) => [backdrop.id, backdrop])
) as Record<BackdropId, BackdropOption>

/**
 * The backdrop to actually use for a stored id. An id from an older build (or a tampered
 * draft) falls back to no backdrop, and so does *every* id while `VITE_BACKDROPS_ENABLED`
 * is off — the one gate every reader goes through, so a draft or created strip that
 * carries a backdrop can't wake the model up on a build that doesn't offer the feature.
 */
export function resolveBackdrop(id: string | undefined | null): BackdropId {
  if (!env.backdropsEnabled) return 'none'
  return id && id in BACKDROP_MAP ? (id as BackdropId) : 'none'
}
