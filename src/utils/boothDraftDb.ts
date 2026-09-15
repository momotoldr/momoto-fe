/**
 * Browser-side cache of the booth work in progress — the cuts already taken and how
 * they're arranged — so an interrupted session can be picked up where it left off.
 *
 * Captured frames otherwise live only in `usePhotosStore`, in one tab: close it, lose
 * the connection, or crash mid-session and the shots are gone for good, even though
 * the room itself is still running and the person can walk straight back in. This is
 * the recovery copy behind `useBoothDraft`.
 *
 * IndexedDB (not localStorage) for the same reason as `guestStripsDb`: a cut is a
 * full-res PNG data URL, and a strip's worth of them dwarfs localStorage's ~5 MB.
 *
 * A draft is scoped to one booth session by room code (see `boothDraftId`) and is
 * only ever restored into an empty booth, so it can't overwrite live work. Note the
 * store is per-origin rather than per-tab: two tabs of the *same browser* in the same
 * room would share one draft. That's a development scenario, not a real one — the two
 * people in a date room are on different devices.
 */

import type { PhotoFilter } from '@/constants/filters'
import type { PlacedSticker } from '@/constants/stickers'
import type { ResultConfig } from '@/store/usePhotosStore'
import type { CapturedFrame } from '@/utils/captureFrame'

const DB_NAME = 'momoto-booth'
const STORE = 'drafts'
const DB_VERSION = 1

/**
 * How long a draft with no session window of its own stays usable. Only a fallback:
 * a draft normally expires with the window it was taken in (`endsAt`).
 */
const DRAFT_TTL_MS = 30 * 60_000

/** One booth session's work in progress. */
export interface BoothDraft {
  /** `boothDraftId(mode, roomId)` — the session this draft belongs to. */
  id: string
  /** Captured cuts, in capture order (the store's `frames`). */
  frames: CapturedFrame[]
  /** Strip arrangement (`order[slot]` → capture index). */
  order: number[]
  /**
   * How many cameras these cuts were laid out for (`usePhotosStore.captureTiles`).
   * Stored because a single-slot retake after a recovery has to reproduce the same
   * geometry — re-shooting one cut of a four-person strip as a solo one would leave a
   * strip with a hole in it. Absent on drafts saved before this existed.
   */
  captureTiles?: number
  /**
   * How many people were in the room when these cuts were shot
   * (`usePhotosStore.captureMembers`). Stored for the same reason as `captureTiles`: a
   * retake after a recovery is measured against it, and a draft that came back without
   * it would look like the whole room had left. Absent on older drafts.
   */
  captureMembers?: number
  /** True if capture had finished and the arrange step was open. */
  reviewing: boolean
  /**
   * Set once a strip was created from these shots: the frames that went onto it, as
   * indices into `frames` in strip order. Stored as indices rather than a second copy
   * of the images — it is the same cuts, rearranged.
   */
  selection: number[] | null
  /** The design frozen when that strip was created; null if none was. */
  resultConfig: ResultConfig | null
  templateId: string
  filter: PhotoFilter
  stickers: PlacedSticker[]
  /**
   * End of the session window this was taken in, as a **local** timestamp, or null if
   * no window was running. A draft outlives neither.
   */
  endsAt: number | null
  savedAt: number
}

/** Draft key for a booth session — its mode and room code identify it. */
export function boothDraftId(mode: string, roomId: string): string {
  return `${mode}:${roomId}`
}

/**
 * Whether a draft still belongs to a session that could be resumed. Tied to the
 * window it was taken in: once that has elapsed the room is retired server-side (and
 * a solo booth has run out), so its frames can't be continued — only re-shot.
 */
export function isDraftUsable(draft: BoothDraft, now: number = Date.now()): boolean {
  if (draft.frames.length === 0) return false
  if (draft.endsAt !== null) return draft.endsAt > now
  return draft.savedAt + DRAFT_TTL_MS > now
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Promisify a single-store transaction, resolving with the request's result. */
function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = work(tx.objectStore(STORE))
        tx.oncomplete = () => {
          resolve(request.result)
          db.close()
        }
        tx.onerror = () => {
          reject(tx.error)
          db.close()
        }
      })
  )
}

/** Write this session's draft (upsert by id — one draft per session). */
export function saveBoothDraft(draft: BoothDraft): Promise<IDBValidKey> {
  return run('readwrite', (store) => store.put(draft))
}

/** This session's draft, or undefined if there is none. */
export function loadBoothDraft(id: string): Promise<BoothDraft | undefined> {
  return run<BoothDraft | undefined>('readonly', (store) => store.get(id))
}

/** Drop a draft — the work it held is finished, discarded, or out of time. */
export function deleteBoothDraft(id: string): Promise<undefined> {
  return run('readwrite', (store) => store.delete(id))
}

/**
 * Drop every draft whose session is over. Cheap to run on entering a booth, and it's
 * what keeps abandoned sessions (a code nobody came back to) from accumulating.
 */
export async function sweepBoothDrafts(now: number = Date.now()): Promise<number> {
  const all = await run<BoothDraft[]>('readonly', (store) => store.getAll())
  const stale = all.filter((draft) => !isDraftUsable(draft, now))
  await Promise.all(stale.map((draft) => deleteBoothDraft(draft.id)))
  return stale.length
}
