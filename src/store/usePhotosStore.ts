import { create } from 'zustand'

import { newId } from '@/utils/id'
import type { CapturedFrame } from '@/utils/captureFrame'
import type { PhotoFilter } from '@/constants/filters'
import type { PlacedSticker } from '@/constants/stickers'
import { COUNTDOWN_SECONDS } from '@/constants/capture'

/**
 * The strip design captured at the moment "Create strip" is pressed. Frozen here
 * so later live changes (e.g. the host tweaking the filter) can't retroactively
 * alter a result already on screen.
 */
export interface ResultConfig {
  templateId: string
  filter: PhotoFilter
  /** Stickers placed on the strip, frozen at create time. */
  stickers: PlacedSticker[]
}

interface PhotosState {
  /** Captured shots, kept in stable capture order (never reordered). */
  frames: CapturedFrame[]
  /**
   * Strip arrangement: `order[slot]` is the capture index shown in that slot.
   * Reordering permutes this (frames stay put), so a host can broadcast the
   * permutation and a guest can apply it to its own frames.
   */
  order: number[]
  isCapturing: boolean
  /**
   * How many cameras this run's cuts are laid out for — pinned when the run starts and
   * held for every shot in it, single-slot retakes included.
   *
   * Counted once rather than per shot because the grid *is* the strip's geometry: a cut
   * with four faces followed by one with three is not a strip anyone asked for. If
   * someone's camera drops mid-run their cell goes black and the other three stay put.
   */
  captureTiles: number
  /**
   * How many people were in the room when this run started.
   *
   * Kept apart from `captureTiles`, which counts *cameras*: a run can begin with three
   * members but only two streams up, and comparing membership against a camera count
   * then reads as a change that never happened. This is the number the "has the cast
   * changed?" check measures against, in both directions.
   */
  captureMembers: number
  /** Current countdown value (3→2→1→0), or null when not counting. */
  countdown: number | null
  /** True after capture finishes, while the user is arranging the strip. */
  reviewing: boolean
  /** Slot being re-shot (single-shot retake), or null during a normal sequence. */
  retakeSlot: number | null
  /** The confirmed, ordered frames to compose onto the strip. */
  selection: CapturedFrame[]
  /** Design snapshot taken at confirm time (see ResultConfig); null until confirmed. */
  resultConfig: ResultConfig | null
  /**
   * Stable id for the current created strip, minted at confirm time. Lets the
   * result screen add the strip to the cart exactly once (dedupe key). Null until
   * confirmed; cleared on reset / a fresh capture.
   */
  resultId: string | null

  addFrame: (frame: CapturedFrame) => void
  /** Begin a run, fixing its grid at `tiles` cameras and its cast at `members` people. */
  startCapture: (tiles?: number, members?: number) => void
  tickCountdown: () => void
  startNextShot: () => void
  finishCapture: () => void
  swapSlots: (a: number, b: number) => void
  startRetake: (slot: number) => void
  replaceFrame: (captureIndex: number, frame: CapturedFrame) => void
  finishRetake: () => void
  confirmSelection: (selection: CapturedFrame[], config: ResultConfig) => void
  backToReview: () => void
  /** Re-seed an interrupted session's shots — see the implementation below. */
  restoreDraft: (draft: {
    frames: CapturedFrame[]
    order: number[]
    captureTiles?: number
    captureMembers?: number
    reviewing: boolean
    selection: number[] | null
    resultConfig: ResultConfig | null
  }) => void
  reset: () => void
}

export const usePhotosStore = create<PhotosState>((set) => ({
  frames: [],
  order: [],
  isCapturing: false,
  captureTiles: 1,
  captureMembers: 1,
  countdown: null,
  reviewing: false,
  retakeSlot: null,
  selection: [],
  resultConfig: null,
  resultId: null,

  addFrame: (frame) => set((state) => ({ frames: [...state.frames, frame] })),

  // Idempotent: ignored if a sequence is already running (guards double-triggers
  // from both the Start button and a synced socket broadcast).
  startCapture: (tiles = 1, members = 1) =>
    set((state) =>
      state.isCapturing
        ? {}
        : {
            captureTiles: Math.max(1, Math.trunc(tiles)),
            captureMembers: Math.max(1, Math.trunc(members)),
            frames: [],
            order: [],
            selection: [],
            resultConfig: null,
            resultId: null,
            reviewing: false,
            retakeSlot: null,
            isCapturing: true,
            countdown: COUNTDOWN_SECONDS,
          }
    ),

  tickCountdown: () =>
    set((state) => ({
      countdown: state.countdown === null ? null : Math.max(0, state.countdown - 1),
    })),

  startNextShot: () => set({ countdown: COUNTDOWN_SECONDS }),

  // Capture done → seed the identity arrangement and enter the review/arrange step.
  finishCapture: () =>
    set((state) => ({
      isCapturing: false,
      countdown: null,
      reviewing: true,
      order: state.frames.map((_, index) => index),
    })),

  // Reorder the strip by swapping two slots (used by drag-and-drop; host only).
  swapSlots: (a, b) =>
    set((state) => {
      if (a === b || a < 0 || b < 0 || a >= state.order.length || b >= state.order.length) return {}
      const order = [...state.order]
      ;[order[a], order[b]] = [order[b], order[a]]
      return { order }
    }),

  // Re-shoot a single slot: leaves the camera live for one more countdown/capture.
  startRetake: (slot) =>
    set({ retakeSlot: slot, reviewing: false, isCapturing: true, countdown: COUNTDOWN_SECONDS }),

  // Replace one capture's frame in place (its slot position is unchanged).
  replaceFrame: (captureIndex, frame) =>
    set((state) => {
      if (captureIndex < 0 || captureIndex >= state.frames.length) return {}
      const frames = [...state.frames]
      frames[captureIndex] = frame
      return { frames }
    }),

  // Single retake done → back to the arrange step.
  finishRetake: () =>
    set({ isCapturing: false, countdown: null, retakeSlot: null, reviewing: true }),

  // User confirmed the arrangement → freeze the design snapshot + show the result.
  // Mint a fresh resultId so the result screen can add this strip to the cart once.
  confirmSelection: (selection, config) =>
    set({ selection, resultConfig: config, resultId: newId('strip'), reviewing: false }),

  // Return to the arrange step from the result without re-capturing.
  backToReview: () => set({ reviewing: true }),

  // Put back the shots from an interrupted session (see `useBoothDraft`). Deliberately
  // a no-op unless the booth is empty and idle: the read is asynchronous, so it can
  // land after the user has already started shooting again, and recovered work must
  // never overwrite work being done now. A mismatched order is rebuilt rather than
  // dropped, so a recovered strip is never left unarranged.
  restoreDraft: ({
    frames,
    order,
    captureTiles,
    captureMembers,
    reviewing,
    selection,
    resultConfig,
  }) =>
    set((state) => {
      if (state.isCapturing || state.frames.length > 0 || frames.length === 0) return {}
      const restored = {
        frames,
        order: order.length === frames.length ? order : frames.map((_, index) => index),
        // Recovered with the shots, so a retake re-shoots the same grid for the same
        // cast. Drafts written before these were stored fall back to one, which is what
        // they were.
        captureTiles: Math.max(1, Math.trunc(captureTiles ?? 1)),
        // A draft written before the cast was stored falls back to its camera count, not
        // to one: the strip was shot with at least that many people, and guessing "one"
        // would make a recovered three-person strip read as though everyone had joined
        // since — blocking its retakes with a reason that never happened.
        captureMembers: Math.max(1, Math.trunc(captureMembers ?? captureTiles ?? 1)),
        reviewing,
      }
      // A strip had already been created from these shots, so the result screen is
      // where this person left off — not the arrange step they passed through.
      //
      // `resultId` deliberately stays null. It is the cart's dedupe key, and the strip
      // was saved the moment it was created; a null id is exactly how `StripResult`
      // already recognises "composed before" and re-renders the view without saving a
      // second copy of the same strip.
      const picked = (selection ?? [])
        .map((index) => frames[index])
        .filter((frame): frame is CapturedFrame => Boolean(frame))
      if (resultConfig && selection && picked.length === selection.length) {
        return { ...restored, reviewing: false, selection: picked, resultConfig, resultId: null }
      }
      return restored
    }),

  reset: () =>
    set({
      frames: [],
      order: [],
      // No strip, nothing pinned. Left set, it would keep the retake controls held for
      // a strip that no longer exists.
      captureTiles: 1,
      captureMembers: 1,
      isCapturing: false,
      countdown: null,
      reviewing: false,
      retakeSlot: null,
      selection: [],
      resultConfig: null,
      resultId: null,
    }),
}))
