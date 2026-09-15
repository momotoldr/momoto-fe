/**
 * Browser-side cache for strips a **signed-out** user creates. Guests can run the whole
 * booth (capture / compose / view / share) without an account, but we don't write their
 * strips to the server — instead the composed PNGs are stashed here in IndexedDB and
 * flushed up to `/strips` once they sign in or register (see `contexts/AuthProvider`).
 *
 * IndexedDB (not localStorage) because a strip is a full-res PNG (~1–3 MB) and a few of
 * them blow localStorage's ~5 MB quota. This is purely a hold-until-sync buffer: guests
 * never see a cart UI, so there's no read path for previews — only bulk read on flush.
 *
 * Being a buffer, it has to stay bounded — a guest who never signs in would otherwise grow
 * it by megabytes per strip until the browser evicts the whole origin (taking real data
 * with it) with nothing in the app any the wiser. Two things keep it in check: callers cap
 * how many records they add (`env.stripMaxItems`), and `pruneGuestStrips` expires anything
 * old enough that it's never going to sync.
 */

import type { SessionMode } from '@/types/roomsType'

const DB_NAME = 'momoto-guest'
const STORE = 'strips'
const DB_VERSION = 1

/** A strip cached locally while signed out, awaiting sync to the server on sign-in. */
export interface GuestStripRecord {
  /** The `resultId` from the compose that created it (the dedupe key). */
  id: string
  /** Watermarked PNG — uploaded to the cart (`POST /strips`) on flush. */
  watermarked: Blob
  /** Clean copy — uploaded as the paid print image on flush; null if it failed to compose. */
  clean: Blob | null
  /**
   * The preview this browser rendered, uploaded alongside on flush. Null for a record
   * cached before the client rendered its own, or a browser that could not encode one —
   * the server renders it instead in that case.
   */
  thumbnail?: Blob | null
  /** Room code (date) or "solo" — the cart's grouping hint. */
  sessionId: string | null
  sessionMode: SessionMode | null
  /** ISO-8601 creation timestamp. */
  createdAt: string
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

/** Cache a strip (upsert by id, so a recompose of the same result can't duplicate it). */
export function addGuestStrip(record: GuestStripRecord): Promise<IDBValidKey> {
  return run('readwrite', (store) => store.put(record))
}

/** Every cached strip, oldest first (creation order) — the flush uploads them all. */
export async function getAllGuestStrips(): Promise<GuestStripRecord[]> {
  const all = await run<GuestStripRecord[]>('readonly', (store) => store.getAll())
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Drop one cached strip once it's synced to the server. */
export function deleteGuestStrip(id: string): Promise<undefined> {
  return run('readwrite', (store) => store.delete(id))
}

/** Empty the whole cache. */
export function clearGuestStrips(): Promise<undefined> {
  return run('readwrite', (store) => store.clear())
}

/**
 * How long a cached strip is kept before it's dropped unread.
 *
 * This store is a hold-until-sync buffer, so a record still sitting here after a month
 * belongs to someone who never signed in — keeping it costs the origin's storage quota
 * and buys nothing.
 */
export const GUEST_STRIP_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** How many strips are cached, without deserializing any of them. */
export function countGuestStrips(): Promise<number> {
  return run('readonly', (store) => store.count())
}

/**
 * Whether a strip with this id is already cached. `addGuestStrip` upserts, so a re-save of
 * something already here isn't new storage and mustn't be turned away when the cache is
 * full.
 */
export async function hasGuestStrip(id: string): Promise<boolean> {
  const key = await run<IDBValidKey | undefined>('readonly', (store) => store.getKey(id))
  return key !== undefined
}

/**
 * Drop cached strips older than `maxAgeMs`, returning how many went.
 *
 * Walks a cursor rather than querying a `createdAt` index: adding one means a version bump
 * plus an upgrade path for databases already out there, which is real migration risk for a
 * store holding a couple of dozen records at most. The values the cursor yields contain
 * Blobs, but IndexedDB hands those back lazily — the PNG bytes are never read.
 */
export function pruneGuestStrips(maxAgeMs: number = GUEST_STRIP_TTL_MS): Promise<number> {
  // ISO-8601 sorts lexicographically, which is why the records store it as a string.
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString()
  return openDb().then(
    (db) =>
      new Promise<number>((resolve, reject) => {
        let removed = 0
        const tx = db.transaction(STORE, 'readwrite')
        const request = tx.objectStore(STORE).openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return
          const record = cursor.value as GuestStripRecord
          if (record.createdAt < cutoff) {
            cursor.delete()
            removed += 1
          }
          cursor.continue()
        }
        tx.oncomplete = () => {
          resolve(removed)
          db.close()
        }
        tx.onerror = () => {
          reject(tx.error)
          db.close()
        }
      })
  )
}
