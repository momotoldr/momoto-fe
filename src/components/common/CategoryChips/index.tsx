import { useTranslation } from 'react-i18next'

import type { CategoryFilter } from '@/hooks/useCategoryFilter'

import { cn } from '@/lib/utils'

import styles from './CategoryChips.module.scss'

interface CategoryChipsProps<C extends string> {
  /** Categories that have options here, in display order (from `useCategoryFilter`). */
  categories: readonly C[]
  active: CategoryFilter<C>
  onChange: (category: CategoryFilter<C>) => void
  /** i18n prefix the category ids hang off, e.g. `stickers.categories`. */
  labelPrefix: string
  disabled?: boolean
}

/**
 * A scroll row of category chips, "All" first, above a picker's options — so a long
 * palette of templates, backdrops or stickers can be narrowed instead of scrolled.
 *
 * A filter, not a selection: changing chips never changes what's picked, it only
 * changes what's in view. Renders nothing until there are two categories to choose
 * between; a lone chip would just be a label.
 */
export function CategoryChips<C extends string>({
  categories,
  active,
  onChange,
  labelPrefix,
  disabled,
}: CategoryChipsProps<C>) {
  const { t } = useTranslation()
  if (categories.length < 2) return null

  const chips: CategoryFilter<C>[] = ['all', ...categories]

  return (
    <div className={styles.chips} role="group" aria-label={t('common.categories')}>
      {chips.map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={active === category}
          disabled={disabled}
          className={cn(styles.chip, active === category && styles.chipActive)}
          onClick={() => onChange(category)}
        >
          {category === 'all' ? t('common.all') : t(`${labelPrefix}.${category}`)}
        </button>
      ))}
    </div>
  )
}
