export type PhotoFilter =
  'none' | 'bw' | 'sepia' | 'vintage' | 'warm' | 'cool' | 'vivid' | 'fade' | 'noir'

export interface PhotoFilterOption {
  id: PhotoFilter
  /** i18n key suffix under `filters.*` for the label. */
  label: string
  /**
   * CSS/Canvas filter string. Both the live preview (CSS `filter`) and the
   * composed strip (Canvas `ctx.filter`) use the same value, so the download
   * matches what the user saw. `'none'` disables filtering.
   */
  value: string
}

export const PHOTO_FILTERS: PhotoFilterOption[] = [
  { id: 'none', label: 'none', value: 'none' },
  { id: 'bw', label: 'bw', value: 'grayscale(1) contrast(1.05)' },
  { id: 'sepia', label: 'sepia', value: 'sepia(0.7)' },
  {
    id: 'vintage',
    label: 'vintage',
    value: 'sepia(0.35) contrast(0.95) saturate(1.2) brightness(1.05)',
  },
  { id: 'warm', label: 'warm', value: 'sepia(0.2) saturate(1.35) brightness(1.05)' },
  { id: 'cool', label: 'cool', value: 'saturate(1.1) hue-rotate(-12deg) brightness(1.03)' },
  { id: 'vivid', label: 'vivid', value: 'saturate(1.6) contrast(1.15)' },
  { id: 'fade', label: 'fade', value: 'contrast(0.85) brightness(1.1) saturate(0.8)' },
  { id: 'noir', label: 'noir', value: 'grayscale(1) contrast(1.4) brightness(0.95)' },
]

export const PHOTO_FILTER_MAP = Object.fromEntries(
  PHOTO_FILTERS.map((filter) => [filter.id, filter])
) as Record<PhotoFilter, PhotoFilterOption>
