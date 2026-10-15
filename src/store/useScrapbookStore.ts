import { create } from 'zustand'

import ApiError from '@/api/apiError'
import {
  createScrapbook,
  deleteScrapbook,
  duplicateScrapbook,
  getScrapbook,
  listScrapbooks,
  removeScrapbook,
  saveScrapbook,
} from '@/api/services/scrapbooksService'
import {
  DEFAULT_SCRAPBOOK_TEMPLATE_ID,
  getScrapbookTemplate,
  type ScrapbookTemplate,
} from '@/constants/scrapbookTemplates'
import type { Scrapbook, ScrapbookSummary } from '@/types/scrapbookType'
import type { QuotaBucket, StoredStrip } from '@/types/stripType'

import { useCartStore } from './useCartStore'

/** The scrapbook open in the editor or viewer, and everything needed to draw it. */
export interface OpenScrapbook {
  scrapbook: Scrapbook
  /** Null for a template this build doesn't know; the page shows that as unsupported. */
  template: ScrapbookTemplate | null
  /** Every strip the layout can draw, by id: the server's list plus any placed since. */
  strips: Record<string, StoredStrip>
  /** Placed strips that have left the gallery since — drawn as empty slots with a note. */
  missing: string[]
}

/**
 * Autosave, as the header shows it. `pending` — edits waiting out the debounce; `saving`
 * — a request in flight; `error` — the last save failed (it is retried, and on the next
 * edit or `flush`).
 */
export type SaveState = 'saved' | 'pending' | 'saving' | 'error'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** `limit` is the server's cap (409); it needs its own message, not "try again". */
export type CreateResult =
  { ok: true; scrapbook: Scrapbook } | { ok: false; reason: 'limit' | 'failed' }

/** `stale` — the server disagrees about it (gone, or paid since); a reload settles it. */
export type ShelfChangeResult = { ok: true } | { ok: false; reason: 'stale' | 'failed' }

interface ScrapbookStoreState {
  // ── The shelf ──
  shelf: ScrapbookSummary[]
  /** The server's cap and how much of it is spent. Never mirrored in the client's env. */
  quota: QuotaBucket | null
  shelfStatus: LoadStatus
  loadShelf: () => Promise<void>
  create: (templateId?: string) => Promise<CreateResult>
  duplicate: (id: string) => Promise<CreateResult>
  /** Delete an unpaid scrapbook (`DELETE`) or take a paid one off the shelf (`remove`). */
  discard: (summary: ScrapbookSummary) => Promise<ShelfChangeResult>

  // ── The open scrapbook ──
  current: OpenScrapbook | null
  openStatus: LoadStatus
  saveState: SaveState
  open: (id: string) => Promise<void>
  /** Save anything pending, then let go of it. */
  close: () => Promise<void>
  /** Put a strip in a slot, or empty it with null. Drafts only. */
  placeStrip: (slotId: string, strip: StoredStrip | null) => void
  /** Set a text slot. The caller checks it fits (`layoutScrapbookText`). Drafts only. */
  setText: (textId: string, text: string) => void
  setTitle: (title: string) => void
  /**
   * Save now and wait until everything typed so far is on the server. Resolves with the
   * saved scrapbook — whose `contentVersion` is what a finish must be rendered from — or
   * null when it couldn't be saved. Finish calls this first (plan §7): a debounced save
   * still pending would otherwise land mid-finish and refuse it as `content_changed`.
   */
  flush: () => Promise<Scrapbook | null>
  /**
   * True while a finish is running — in this tab, or announced by another one (plan §7b).
   * Every edit is ignored while it is: content changed under a finish would make its PDF
   * describe something other than what is saved.
   */
  frozen: boolean
  setFrozen: (frozen: boolean) => void
  /** Take a newer copy from a finish, reopen or unlock. Local edits never outrank these. */
  replaceCurrent: (scrapbook: Scrapbook) => void
  /** Local-only reset (sign-out). */
  reset: () => void
}

/** How long typing must pause before an autosave goes out (plan §5). */
const SAVE_DEBOUNCE_MS = 1_000
/** After a failed save, try again on its own after this long. */
const SAVE_RETRY_MS = 5_000

// Autosave bookkeeping, kept out of the store's state: none of it is anything a component
// renders, and changing it shouldn't re-render one.
let saveTimer: ReturnType<typeof setTimeout> | null = null
/** Bumped by every edit. A save knows which edits it carried by the value it started at. */
let editGeneration = 0
let savedGeneration = 0
let inFlight: Promise<void> | null = null

function clearSaveTimer(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
}

/** Save as soon as the page is hidden — a closed tab shouldn't lose the last second typed. */
function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') void useScrapbookStore.getState().flush()
}

export const useScrapbookStore = create<ScrapbookStoreState>((set, get) => {
  /**
   * Send the current title and content, one request at a time. Edits made while it is in
   * flight are kept: the response only replaces the server-owned fields unless nothing
   * changed since it was sent, and a further save follows for whatever did.
   */
  function runSave(): Promise<void> {
    if (inFlight) return inFlight
    const open = get().current
    if (!open || open.scrapbook.state !== 'draft' || editGeneration === savedGeneration) {
      return Promise.resolve()
    }
    const id = open.scrapbook.id
    const sentGeneration = editGeneration
    const change = { title: open.scrapbook.title, content: open.scrapbook.content }
    set({ saveState: 'saving' })

    inFlight = saveScrapbook(id, change)
      .then((saved) => {
        const now = get().current
        if (now?.scrapbook.id !== id) return
        savedGeneration = sentGeneration
        const newer = editGeneration !== sentGeneration
        set({
          current: {
            ...now,
            scrapbook: newer
              ? { ...saved, title: now.scrapbook.title, content: now.scrapbook.content }
              : saved,
          },
          saveState: newer ? 'pending' : 'saved',
        })
      })
      .catch(async (error: unknown) => {
        const now = get().current
        if (now?.scrapbook.id !== id) return
        if (error instanceof ApiError && error.code === 'strip_unavailable') {
          // A newly placed strip the server won't take: it left the gallery (another tab
          // removed it) or was never unlocked. The error carries no ids — the client's
          // interceptor keeps only the code — so ask the gallery, which is what decides
          // usability, and clear just the slots holding a strip it no longer has.
          const cart = useCartStore.getState()
          await cart.load()
          const usable = new Set(
            useCartStore
              .getState()
              .items.filter((strip) => strip.paid)
              .map((strip) => strip.id)
          )
          const latest = get().current
          if (useCartStore.getState().status !== 'ready' || latest?.scrapbook.id !== id) {
            set({ saveState: 'error' })
            return
          }
          const strips = Object.fromEntries(
            Object.entries(latest.scrapbook.content.strips).filter(([, stripId]) =>
              usable.has(stripId)
            )
          )
          editGeneration++
          set({
            current: {
              ...latest,
              scrapbook: { ...latest.scrapbook, content: { ...latest.scrapbook.content, strips } },
            },
            saveState: 'pending',
          })
          return
        }
        if (error instanceof ApiError && error.code === 'scrapbook_locked') {
          // Finished elsewhere (another tab). The server's copy is the truth now.
          await get().open(id)
          return
        }
        set({ saveState: 'error' })
        clearSaveTimer()
        saveTimer = setTimeout(() => void runSave(), SAVE_RETRY_MS)
      })
      .finally(() => {
        inFlight = null
        if (get().saveState === 'pending') {
          clearSaveTimer()
          void runSave()
        }
      })
    return inFlight
  }

  /** Apply a local edit to the open draft and schedule its autosave. */
  function edit(change: (scrapbook: Scrapbook) => Scrapbook): void {
    const open = get().current
    if (!open || open.scrapbook.state !== 'draft' || get().frozen) return
    editGeneration++
    set({ current: { ...open, scrapbook: change(open.scrapbook) }, saveState: 'pending' })
    clearSaveTimer()
    saveTimer = setTimeout(() => void runSave(), SAVE_DEBOUNCE_MS)
  }

  return {
    shelf: [],
    quota: null,
    shelfStatus: 'idle',

    loadShelf: async () => {
      set({ shelfStatus: 'loading' })
      try {
        const { scrapbooks, quota } = await listScrapbooks()
        set({ shelf: scrapbooks, quota, shelfStatus: 'ready' })
      } catch {
        set({ shelfStatus: 'error' })
      }
    },

    create: async (templateId = DEFAULT_SCRAPBOOK_TEMPLATE_ID) => {
      try {
        const scrapbook = await createScrapbook(templateId)
        set((state) => ({
          shelf: [scrapbook, ...state.shelf],
          quota: state.quota ? { ...state.quota, used: state.quota.used + 1 } : state.quota,
        }))
        return { ok: true, scrapbook }
      } catch (error) {
        const limit = error instanceof ApiError && error.code === 'scrapbook_limit'
        return { ok: false, reason: limit ? 'limit' : 'failed' }
      }
    },

    duplicate: async (id) => {
      try {
        const scrapbook = await duplicateScrapbook(id)
        set((state) => ({
          shelf: [scrapbook, ...state.shelf],
          quota: state.quota ? { ...state.quota, used: state.quota.used + 1 } : state.quota,
        }))
        return { ok: true, scrapbook }
      } catch (error) {
        const limit = error instanceof ApiError && error.code === 'scrapbook_limit'
        return { ok: false, reason: limit ? 'limit' : 'failed' }
      }
    },

    discard: async (summary) => {
      try {
        const quota =
          summary.state === 'paid'
            ? await removeScrapbook(summary.id)
            : await deleteScrapbook(summary.id)
        set((state) => ({ shelf: state.shelf.filter((item) => item.id !== summary.id), quota }))
        return { ok: true }
      } catch (error) {
        // Paid since, gone, or a payment is open on it: the shelf is out of date.
        const stale =
          error instanceof ApiError &&
          (error.status === 404 ||
            error.code === 'scrapbook_paid' ||
            error.code === 'scrapbook_not_paid' ||
            error.code === 'payment_in_progress')
        if (stale) void get().loadShelf()
        return { ok: false, reason: stale ? 'stale' : 'failed' }
      }
    },

    current: null,
    openStatus: 'idle',
    saveState: 'saved',

    open: async (id) => {
      // Opening another scrapbook mid-edit: save the one being left first.
      const previous = get().current
      if (previous && previous.scrapbook.id !== id) await get().flush()
      set({ openStatus: 'loading' })
      try {
        const { scrapbook, strips, missing } = await getScrapbook(id)
        clearSaveTimer()
        editGeneration = 0
        savedGeneration = 0
        set({
          current: {
            scrapbook,
            template: getScrapbookTemplate(scrapbook.templateId),
            strips: Object.fromEntries(strips.map((strip) => [strip.id, strip])),
            missing,
          },
          openStatus: 'ready',
          saveState: 'saved',
        })
        document.removeEventListener('visibilitychange', onVisibilityChange)
        document.addEventListener('visibilitychange', onVisibilityChange)
      } catch {
        set({ openStatus: 'error' })
      }
    },

    close: async () => {
      await get().flush()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearSaveTimer()
      set({ current: null, openStatus: 'idle', saveState: 'saved', frozen: false })
    },

    placeStrip: (slotId, strip) => {
      if (strip) {
        // Remember the strip itself, so the slot can draw it without the cart store.
        const open = get().current
        if (open && !open.strips[strip.id]) {
          set({ current: { ...open, strips: { ...open.strips, [strip.id]: strip } } })
        }
      }
      edit((scrapbook) => {
        const strips = { ...scrapbook.content.strips }
        if (strip) strips[slotId] = strip.id
        else delete strips[slotId]
        return { ...scrapbook, content: { ...scrapbook.content, strips } }
      })
    },

    setText: (textId, text) => {
      edit((scrapbook) => {
        const texts = { ...scrapbook.content.texts }
        if (text) texts[textId] = text
        else delete texts[textId]
        return { ...scrapbook, content: { ...scrapbook.content, texts } }
      })
    },

    setTitle: (title) => {
      edit((scrapbook) => ({ ...scrapbook, title }))
    },

    flush: async () => {
      clearSaveTimer()
      // Up to two rounds: the save in flight, then one more for edits made during it.
      for (let round = 0; round < 3; round++) {
        if (inFlight) await inFlight
        if (editGeneration === savedGeneration) break
        await runSave()
      }
      const state = get()
      if (!state.current) return null
      return editGeneration === savedGeneration && state.saveState !== 'error'
        ? state.current.scrapbook
        : null
    },

    frozen: false,
    setFrozen: (frozen) => set({ frozen }),

    replaceCurrent: (scrapbook) => {
      const open = get().current
      if (!open || open.scrapbook.id !== scrapbook.id) return
      clearSaveTimer()
      editGeneration = 0
      savedGeneration = 0
      set((state) => ({
        current: { ...open, scrapbook },
        saveState: 'saved',
        shelf: state.shelf.map((item) => (item.id === scrapbook.id ? scrapbook : item)),
      }))
    },

    reset: () => {
      clearSaveTimer()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      editGeneration = 0
      savedGeneration = 0
      set({
        shelf: [],
        quota: null,
        shelfStatus: 'idle',
        current: null,
        openStatus: 'idle',
        saveState: 'saved',
        frozen: false,
      })
    },
  }
})
