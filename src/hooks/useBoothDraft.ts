import { useEffect } from 'react'
import { toast } from 'sonner'

import { resolveBackdrop } from '@/constants/backdrops'
import { SHOT_COUNT } from '@/constants/capture'
import i18n from '@/lib/i18n'
import { usePhotosStore } from '@/store/usePhotosStore'
import { useSessionStore } from '@/store/useSessionStore'
import { useStripStore } from '@/store/useStripStore'

import type { SessionMode } from '@/types/roomsType'
import {
  boothDraftId,
  deleteBoothDraft,
  isDraftUsable,
  loadBoothDraft,
  saveBoothDraft,
  sweepBoothDrafts,
} from '@/utils/boothDraftDb'

/**
 * Coalescing window for writes. A cut lands every few seconds, but sticker drags fire
 * continuously — this keeps a full strip's worth of PNGs from being rewritten per
 * pointer move, while staying short enough that a tab closed moments after a shot
 * still has it saved.
 */
const SAVE_DEBOUNCE_MS = 400

/** IndexedDB can be unavailable (private mode, embedded webviews) — never fatal. */
const ignore = () => undefined

/**
 * Keeps a recovery copy of the booth's work in progress, and puts it back when
 * someone returns to a session they were interrupted in.
 *
 * The captured cuts live in memory in one tab. A closed tab, a crashed browser or a
 * dropped connection therefore used to cost the whole strip — even though the room
 * keeps running for the rest of its window and the person can walk right back in on
 * the same code. Mounted at the room level so it covers the booth for the session's
 * whole life, and so it survives anything that swaps out the body underneath it.
 *
 * A strip that was already created is recovered too — as the result screen, where the
 * person actually left off. The strip itself is durable elsewhere by then (the cart,
 * or `guestStripsDb` while signed out); what the draft brings back is the *view* of
 * it, without saving a second copy. See `restoreDraft`.
 */
export function useBoothDraft(mode: SessionMode, roomId: string) {
  useEffect(() => {
    if (!roomId) return
    const draftId = boothDraftId(mode, roomId)
    let cancelled = false
    let timer: number | undefined

    // Sessions nobody came back to would otherwise pile up full-res PNGs.
    void sweepBoothDrafts().catch(ignore)

    void loadBoothDraft(draftId)
      .then((draft) => {
        if (cancelled || !draft || !isDraftUsable(draft)) return
        const before = usePhotosStore.getState().frames.length
        usePhotosStore.getState().restoreDraft(draft)
        // The store refuses the draft if shooting has already started again; only
        // claim the rest of the session back when it actually took it.
        if (usePhotosStore.getState().frames.length === before) return
        // The design belongs with the shots. In a date room the host re-broadcasts it
        // on peer-join anyway, which simply overwrites this with the same thing.
        useStripStore.getState().setTemplate(draft.templateId)
        useStripStore.getState().setFilter(draft.filter)
        // The cutouts themselves aren't stored — they're remade from the frames, which
        // costs one model run per cut the first time the backdrop is shown again.
        useStripStore.getState().setBackdrop(resolveBackdrop(draft.backdrop))
        useStripStore.getState().setStickers(draft.stickers)
        toast.success(i18n.t('capture.draftRestored', { count: draft.frames.length }))
      })
      .catch(ignore)

    const discard = () => {
      window.clearTimeout(timer)
      void deleteBoothDraft(draftId).catch(ignore)
    }

    const persist = () => {
      const photos = usePhotosStore.getState()
      // Only a *finished* set is worth keeping. A sequence can't be resumed halfway —
      // there is no way to shoot cuts 3 and 4 of a countdown that already stopped — so
      // a partial run would only come back as a strip that can never be completed.
      if (photos.frames.length < SHOT_COUNT) return
      const strip = useStripStore.getState()
      // The created strip, as positions in `frames`. If any of them can't be placed
      // (it shouldn't happen — the selection is those same cuts, reordered) the result
      // is left out rather than stored half-formed, and the draft still brings back
      // the shots themselves.
      const picked = photos.selection.map((chosen) =>
        photos.frames.findIndex((frame) => frame.id === chosen.id)
      )
      const selection = picked.length > 0 && picked.every((index) => index >= 0) ? picked : null
      void saveBoothDraft({
        id: draftId,
        frames: photos.frames,
        order: photos.order,
        captureTiles: photos.captureTiles,
        captureMembers: photos.captureMembers,
        reviewing: photos.reviewing,
        selection,
        resultConfig: selection ? photos.resultConfig : null,
        templateId: strip.templateId,
        filter: strip.filter,
        backdrop: strip.backdrop,
        stickers: strip.stickers,
        endsAt: useSessionStore.getState().endsAt,
        savedAt: Date.now(),
      }).catch(ignore)
    }

    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(persist, SAVE_DEBOUNCE_MS)
    }

    const unsubscribePhotos = usePhotosStore.subscribe((state, prev) => {
      // The shots were thrown away deliberately — "Retake all", a fresh sequence, or
      // the booth closing out at the end of a session. The recovery copy goes with
      // them: it stands for work the user still wants, and they just said they don't.
      //
      // A tab being closed never reaches here. Page teardown doesn't run React
      // cleanups, so nothing empties the store on the way out — which is precisely why
      // the draft survives the crash it exists for. (A *single-shot* retake doesn't
      // clear the frames either, so the draft keeps covering the other three shots
      // while that one is re-taken.)
      if (prev.frames.length > 0 && state.frames.length === 0) {
        discard()
        return
      }
      if (
        state.frames !== prev.frames ||
        state.order !== prev.order ||
        state.reviewing !== prev.reviewing ||
        // Creating a strip (or stepping back from it) is part of where someone left
        // off, so it is saved rather than treated as the end of the draft's job.
        state.selection !== prev.selection ||
        state.resultConfig !== prev.resultConfig
      ) {
        schedule()
      }
    })

    const unsubscribeStrip = useStripStore.subscribe((state, prev) => {
      if (usePhotosStore.getState().frames.length === 0) return
      if (
        state.templateId !== prev.templateId ||
        state.filter !== prev.filter ||
        state.backdrop !== prev.backdrop ||
        state.stickers !== prev.stickers
      ) {
        schedule()
      }
    })

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      unsubscribePhotos()
      unsubscribeStrip()
    }
  }, [mode, roomId])
}
