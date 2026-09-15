import type { StoredStrip } from '@/types/stripType'

/**
 * The cart and the gallery are two views of one list.
 *
 * `useCartStore` holds every strip and is loaded and cleared by the auth lifecycle;
 * splitting it into two stores would mean two fetches, two guest-sync paths, and two
 * things to keep consistent after a delete. So the split lives here instead, as a
 * predicate on `paid` — the same column an unlock sets.
 *
 * These are plain array helpers, not zustand selectors, and callers wrap them in
 * `useMemo` over the store's `items`. A selector that returns `items.filter(...)`
 * hands React a new array on every snapshot read, which under `useSyncExternalStore`
 * never settles — the "getSnapshot should be cached" render loop.
 */

/** Strips still awaiting an unlock: the cart. */
export function cartItems(items: StoredStrip[]): StoredStrip[] {
  return items.filter((item) => !item.paid)
}

/** Unlocked strips, with a clean copy to download: the gallery. */
export function galleryItems(items: StoredStrip[]): StoredStrip[] {
  return items.filter((item) => item.paid)
}
