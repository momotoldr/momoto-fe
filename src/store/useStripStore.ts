import { create } from 'zustand'

import type { BackdropId } from '@/constants/backdrops'
import type { PhotoFilter } from '@/constants/filters'
import { DEFAULT_TEMPLATE_ID } from '@/constants/stripTemplates'
import {
  STICKER_DEFAULT_SIZE,
  STICKER_MAX_SIZE,
  STICKER_MIN_SIZE,
  type PlacedSticker,
} from '@/constants/stickers'

interface StripState {
  /**
   * Chosen strip template (its SVG background + fixed photo slots). Defaults to
   * the first template so the strip always previews; the host picks it in the
   * post-capture arrange step and it syncs to the guest (via `strip:arrange`).
   */
  templateId: string
  /** Photo filter applied to the whole strip. Chosen (host) live in the review step. */
  filter: PhotoFilter
  /**
   * Scene behind the people in every cut, or `none` for the camera's own background.
   * Picked after capture; the cutting-out happens on this device (see `utils/backdrop`).
   */
  backdrop: BackdropId
  /** Stickers placed on the strip in the review step (drag/resize/remove). */
  stickers: PlacedSticker[]
  setTemplate: (templateId: string) => void
  setFilter: (filter: PhotoFilter) => void
  setBackdrop: (backdrop: BackdropId) => void
  /** Replace all placed stickers (guest applies the host's synced set). */
  setStickers: (stickers: PlacedSticker[]) => void
  /** Place a new sticker image (centered). */
  addSticker: (src: string) => void
  /** Patch a placed sticker's position/size/rotation (x/y/size are clamped). */
  updateSticker: (
    id: string,
    patch: Partial<Pick<PlacedSticker, 'x' | 'y' | 'size' | 'rotation'>>
  ) => void
  removeSticker: (id: string) => void
  reset: () => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function newStickerId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sticker-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useStripStore = create<StripState>((set) => ({
  templateId: DEFAULT_TEMPLATE_ID,
  filter: 'none',
  backdrop: 'none',
  stickers: [],
  setTemplate: (templateId) => set({ templateId }),
  setFilter: (filter) => set({ filter }),
  setBackdrop: (backdrop) => set({ backdrop }),
  setStickers: (stickers) => set({ stickers }),
  addSticker: (src) =>
    set((state) => ({
      stickers: [
        ...state.stickers,
        { id: newStickerId(), src, x: 0.5, y: 0.5, size: STICKER_DEFAULT_SIZE, rotation: 0 },
      ],
    })),
  updateSticker: (id, patch) =>
    set((state) => ({
      stickers: state.stickers.map((sticker) =>
        sticker.id === id
          ? {
              ...sticker,
              ...(patch.x !== undefined && { x: clamp(patch.x, 0, 1) }),
              ...(patch.y !== undefined && { y: clamp(patch.y, 0, 1) }),
              ...(patch.size !== undefined && {
                size: clamp(patch.size, STICKER_MIN_SIZE, STICKER_MAX_SIZE),
              }),
              ...(patch.rotation !== undefined && { rotation: patch.rotation }),
            }
          : sticker
      ),
    })),
  removeSticker: (id) =>
    set((state) => ({ stickers: state.stickers.filter((sticker) => sticker.id !== id) })),
  reset: () =>
    set({ templateId: DEFAULT_TEMPLATE_ID, filter: 'none', backdrop: 'none', stickers: [] }),
}))
