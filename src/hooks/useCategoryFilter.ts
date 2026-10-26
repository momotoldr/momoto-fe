import { useMemo, useState } from 'react'

export type CategoryFilter<C extends string> = C | 'all'

/**
 * Narrow a picker's options to one category, for the chip row above it (see
 * `CategoryChips`).
 *
 * Only categories that actually have an option here are offered, in `order`, so a
 * template category with nothing in the open grid never shows as an empty chip. A chip
 * that stops applying (the grid switched under it) reads as `all` rather than leaving
 * an empty row.
 *
 * An option with no category is pinned: it shows under every chip. That's how a
 * backdrop's Original stays one tap away whichever category is open.
 */
export function useCategoryFilter<C extends string, T extends { category?: C }>(
  order: readonly C[],
  items: readonly T[]
) {
  const [picked, setActive] = useState<CategoryFilter<C>>('all')

  const categories = useMemo(() => {
    const present = new Set(items.map((item) => item.category))
    return order.filter((category) => present.has(category))
  }, [order, items])

  const active: CategoryFilter<C> = picked !== 'all' && categories.includes(picked) ? picked : 'all'

  const visible = useMemo(
    () =>
      active === 'all'
        ? items
        : items.filter((item) => item.category === undefined || item.category === active),
    [items, active]
  )

  return { categories, active, setActive, visible }
}
