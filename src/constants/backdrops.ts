import blush from '@/assets/backdrops/blush.svg'
import bokeh from '@/assets/backdrops/bokeh.svg'
import checker from '@/assets/backdrops/checker.svg'
import confetti from '@/assets/backdrops/confetti.svg'
import sky from '@/assets/backdrops/sky.svg'
import studio from '@/assets/backdrops/studio.svg'
import sunset from '@/assets/backdrops/sunset.svg'
import { env } from '@/env'

/**
 * Backdrops that can replace the background behind the people in a cut, chosen on the
 * arrange screen after capture (see `utils/backdrop`).
 *
 * A backdrop spans the **whole cut**, not each camera's cell, so everyone in a date or
 * group cut stands in front of the same scene. Art is 4:3 and cover-cropped to the cut
 * (1.33–1.67 across the templates), so keep anything that matters near the centre.
 *
 * Like the filter, a backdrop is each member's own design choice and never crosses the
 * wire (see per-user strip design in `StripSelector`).
 */
export type BackdropId =
  'none' | 'studio' | 'blush' | 'sunset' | 'bokeh' | 'confetti' | 'checker' | 'sky'

export interface BackdropOption {
  id: BackdropId
  /** Bundled art, or null for `none` — the camera's own background. */
  src: string | null
  /** i18n key suffix under `backdrops.*`. */
  label: string
}

export const BACKDROPS: BackdropOption[] = [
  { id: 'none', src: null, label: 'none' },
  { id: 'studio', src: studio, label: 'studio' },
  { id: 'blush', src: blush, label: 'blush' },
  { id: 'sunset', src: sunset, label: 'sunset' },
  { id: 'bokeh', src: bokeh, label: 'bokeh' },
  { id: 'confetti', src: confetti, label: 'confetti' },
  { id: 'checker', src: checker, label: 'checker' },
  { id: 'sky', src: sky, label: 'sky' },
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
