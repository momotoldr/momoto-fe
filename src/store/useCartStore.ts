import { create } from 'zustand'

import ApiError from '@/api/apiError'
import {
  deleteStrip,
  listStrips,
  unlockStrips,
  uploadStrip,
  type StripUploadMeta,
} from '@/api/services/stripsService'
import type { StoredStrip } from '@/types/stripType'
import {
  countGuestStrips,
  deleteGuestStrip,
  getAllGuestStrips,
  pruneGuestStrips,
} from '@/utils/guestStripsDb'

type CartStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * The outcome of a save, carrying *why* it failed rather than collapsing everything
 * into null. `cart_full` is the server's cap (409) and reads very differently to a
 * network blip — one is "you're out of room", the other is "try again" — and callers
 * can only say the right thing if the reason survives the store.
 */
export type AddStripResult =
  { ok: true; strip: StoredStrip } | { ok: false; reason: 'cart_full' | 'failed' }

/**
 * The outcome of an unlock, carrying the same "why" as `AddStripResult`.
 *
 * `gallery_full` is the storage cap (409) and needs its own message — the fix is to
 * delete something from the gallery, which is nothing like retrying. `payments_enabled`
 * (403) means the free path was called while checkout is live: a wiring bug rather than
 * anything the user did, so it's surfaced as a plain failure they can report.
 *
 * The last three are the conditions the server used to collapse into one opaque
 * `strips_not_purchasable`, and they want three different messages: `already_paid` and
 * `stale` mean the cart is out of date (both self-heal on the reload this store fires),
 * while `not_printable` is permanent and the strip can only be deleted.
 */
export type UnlockResult =
  | { ok: true; strips: StoredStrip[] }
  | {
      ok: false
      reason:
        'gallery_full' | 'payments_enabled' | 'already_paid' | 'stale' | 'not_printable' | 'failed'
    }

/**
 * The two storage ceilings, as the server reports them.
 *
 * Only the *limits* are kept. How much of each is spent is derived from `items` wherever
 * it's shown, so a meter can never disagree with the strips rendered beside it — the
 * drift you'd get from incrementing a stored counter on every add, unlock and delete.
 */
export interface StripLimits {
  cart: number
  gallery: number
}

/** Before the first load lands, nothing is known to be allowed yet. */
const EMPTY_LIMITS: StripLimits = { cart: 0, gallery: 0 }

interface CartState {
  items: StoredStrip[]
  status: CartStatus
  /**
   * The server's two storage ceilings. The client never computes these itself — a stale
   * mirror would mean showing "you have room" right before the server refuses.
   */
  limits: StripLimits
  /**
   * Strips cached in this browser while signed out that couldn't be flushed because
   * the cart is full. They stay in IndexedDB — nothing a guest made is thrown away —
   * and freeing a slot drains them (see `removeStrip`).
   */
  pendingGuestCount: number
  /** Fetch the signed-in user's strips from the server. */
  load: () => Promise<void>
  /**
   * Upload a composed strip together with its clean copy; prepends it on success.
   *
   * `clean` is optional only for strips that cannot supply one (a guest strip cached
   * before the browser kept it). Omitting it saves a strip that can never be unlocked.
   */
  addStrip: (
    image: Blob,
    meta?: StripUploadMeta,
    clean?: Blob | null,
    thumbnail?: Blob | null
  ) => Promise<AddStripResult>
  /** Flush strips cached while signed out up to the server, then load the cart. */
  syncGuestStrips: () => Promise<void>
  /** Move strips from the cart to the gallery free of charge (checkout-dark only). */
  unlock: (stripIds: string[]) => Promise<UnlockResult>
  /** Delete one strip server-side, then drop it locally. */
  removeStrip: (id: string) => Promise<void>
  /** Delete every strip server-side, then empty the cart. */
  /**
   * Empty the cart. `keepIds` survive it — strips inside a live payment, which the
   * server refuses to delete anyway; passing them keeps the request out rather than
   * firing a delete that comes back 409.
   */
  clear: (keepIds?: readonly string[]) => Promise<void>
  /** Local-only reset (e.g. on sign-out) — does not touch the server. */
  reset: () => void
}

/**
 * The cart of saved strips, backed by the server (`/strips`). Strips persist across
 * reloads and devices because the source of truth is the database, not this store —
 * this just mirrors it. Load is driven by the auth lifecycle (see AuthProvider): the
 * list is fetched on sign-in and cleared on sign-out.
 */
export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  status: 'idle',
  limits: EMPTY_LIMITS,
  pendingGuestCount: 0,

  load: async () => {
    set({ status: 'loading' })
    try {
      const { strips, quota } = await listStrips()
      set({
        items: strips,
        limits: { cart: quota.cart.limit, gallery: quota.gallery.limit },
        status: 'ready',
      })
    } catch {
      set({ status: 'error' })
    }
  },

  addStrip: async (image, meta, clean, thumbnail) => {
    try {
      const strip = await uploadStrip(image, meta, clean, thumbnail)
      // Newest first, and guard against a duplicate id (shouldn't happen server-side).
      set((state) => ({
        items: [strip, ...state.items.filter((item) => item.id !== strip.id)],
        status: 'ready',
      }))
      return { ok: true, strip }
    } catch (error) {
      const full = error instanceof ApiError && error.code === 'cart_full'
      return { ok: false, reason: full ? 'cart_full' : 'failed' }
    }
  },

  /**
   * On sign-in, push any strips the user cached while signed out up to the server cart,
   * then load it. Each cached strip is uploaded (watermarked → `/strips`, clean →
   * print-image); only strips that upload cleanly are dropped from the local cache, so a
   * failure just retries on the next sign-in (and can't re-create a server row it already
   * made).
   *
   * Lives in the store rather than in AuthProvider because a *delete* has to be able to
   * re-run it — that's what drains strips the cart was too full to accept.
   */
  syncGuestStrips: async () => {
    // Anything old enough to have expired is dropped rather than uploaded — a strip cached
    // a month ago by someone who only signed in today isn't one they're waiting for.
    await pruneGuestStrips()
    const cached = await getAllGuestStrips()
    if (cached.length === 0) {
      set({ pendingGuestCount: 0 })
      await get().load()
      return
    }
    // Show the cart as loading while we upload, so the just-signed-in user doesn't flash an
    // empty cart before the flushed strips appear.
    set({ status: 'loading' })
    let blocked = false
    for (const record of cached) {
      const result = await get().addStrip(
        record.watermarked,
        {
          sessionId: record.sessionId,
          mode: record.sessionMode,
          // The moment it was taken, not the moment it's being flushed. Without this the
          // server stamps `now()`, dating a strip cached last week to today and filing it
          // under the wrong month in the gallery.
          createdAt: record.createdAt,
          // The cache is keyed by the strip's own id, so the flush is idempotent for the
          // same reason the create path is: an upload that commits server-side but never
          // reports back leaves the record cached, and the next sign-in retries it. Without
          // the key that retry is a second copy of a strip already in the cart.
          clientKey: record.id,
        },
        // Both copies go up together, so a flushed guest strip is either fully saved or
        // not saved at all. `record.clean` is null only for strips cached before the
        // clean copy was kept — those still flush, and the cart marks them unprintable.
        record.clean,
        record.thumbnail ?? null
      )
      // Out of room. Stop rather than march on: every remaining strip would fail for the
      // same reason, stay cached, and repeat the whole futile pass on the next sign-in.
      // Breaking leaves a clean partial flush — what fitted is in, the rest wait.
      if (!result.ok && result.reason === 'cart_full') {
        blocked = true
        break
      }
      // Upload failed (offline / server error) — leave it cached to retry next sign-in.
      if (!result.ok) continue
      // Safe to drop the local copy: the save carried the clean copy with it, so there is
      // no second upload left that could still fail. This used to discard the cached clean
      // copy even when its follow-up upload had just failed, which permanently stranded a
      // strip that could never be unlocked.
      await deleteGuestStrip(record.id)
    }
    // Only strips held back by a *full cart* are surfaced to the user: those need them to
    // act. One left behind by a network error retries on its own and isn't worth a banner.
    set({ pendingGuestCount: blocked ? await countGuestStrips() : 0 })
    await get().load()
  },

  /**
   * Flip strips from cart to gallery. The returned rows replace their local twins in
   * place, so both surfaces update from one response and neither needs a refetch — the
   * strip simply stops matching the cart's filter and starts matching the gallery's.
   */
  unlock: async (stripIds) => {
    try {
      const unlocked = await unlockStrips(stripIds)
      const byId = new Map(unlocked.map((strip) => [strip.id, strip]))
      set((state) => ({ items: state.items.map((item) => byId.get(item.id) ?? item) }))
      return { ok: true, strips: unlocked }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'gallery_full') return { ok: false, reason: 'gallery_full' }
        if (error.code === 'payments_enabled') return { ok: false, reason: 'payments_enabled' }
        if (error.code === 'strips_not_printable') return { ok: false, reason: 'not_printable' }
        // Both of these mean this store is describing strips the server no longer agrees
        // about — one already unlocked (a double-submit, or a second tab), one deleted or
        // never theirs. Refetching *is* the fix, so do it rather than telling the user to:
        // the strip corrects itself under them while the toast explains what happened.
        if (error.code === 'strips_already_paid' || error.code === 'strip_not_found') {
          await get().load()
          return {
            ok: false,
            reason: error.code === 'strips_already_paid' ? 'already_paid' : 'stale',
          }
        }
      }
      return { ok: false, reason: 'failed' }
    }
  },

  removeStrip: async (id) => {
    await deleteStrip(id)
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
    // A slot just opened — drain whatever the full cart was holding back, so the user
    // doesn't have to know a "sync" step exists.
    if (get().pendingGuestCount > 0) await get().syncGuestStrips()
  },

  clear: async (keepIds = []) => {
    // Unpaid strips only. "Clear all" is a cart control and the cart is the unpaid half;
    // reaching into `items` wholesale would delete the user's paid strips — the one thing
    // nothing in this app is allowed to destroy — from a button that says "clear cart".
    //
    // `keepIds` carves out strips inside a live payment. The server refuses those with a
    // 409, so they survive either way; excluding them here is what stops the clear from
    // reporting success over a pile of silent rejections.
    const keep = new Set(keepIds)
    const ids = get()
      .items.filter((item) => !item.paid && !keep.has(item.id))
      .map((item) => item.id)
    // Settle all deletes (ignore individual failures); then refetch to reflect the
    // true server state rather than assuming every delete succeeded.
    await Promise.allSettled(ids.map((id) => deleteStrip(id)))
    // Emptying the cart is the most room there will ever be, so waiting strips land now.
    // They *replace* what was cleared rather than surviving it: they were never in the
    // cart to begin with, and the banner said they'd arrive once there was space.
    if (get().pendingGuestCount > 0) await get().syncGuestStrips()
    else await get().load()
  },

  reset: () => set({ items: [], status: 'idle', limits: EMPTY_LIMITS, pendingGuestCount: 0 }),
}))
