import type { StoredStrip } from '@/types/stripType'

/** Which strips the gallery is showing. Mirrors `sessionMode`, plus "everything". */
export type GalleryFilter = 'all' | 'solo' | 'date' | 'group'

/** One month's worth of strips — a section in the grid and a row in the spine. */
export interface GalleryMonth {
  /** Sort/scroll key, `YYYY-MM`. Also the DOM id the spine jumps to. */
  key: string
  year: number
  /** "August 2026" — the section heading. */
  label: string
  /** "August" — the spine row, where the year is already a heading above it. */
  shortLabel: string
  strips: StoredStrip[]
}

/** The spine's two-level index: years, each holding its months. */
export interface GalleryYear {
  year: number
  months: GalleryMonth[]
}

/** How many strips match each filter — the counts printed on the filter pills. */
export interface GalleryCounts {
  all: number
  solo: number
  date: number
  group: number
}

/**
 * Count each session mode in one pass.
 *
 * Strips with no recorded mode still count toward `all` but match neither pill, so the
 * two never silently add up to the total — that's the honest reading of "unknown", and
 * the "All" pill is always there to get back to them.
 */
export function countByMode(strips: StoredStrip[]): GalleryCounts {
  let solo = 0
  let date = 0
  let group = 0
  for (const strip of strips) {
    if (strip.sessionMode === 'solo') solo += 1
    else if (strip.sessionMode === 'date') date += 1
    else if (strip.sessionMode === 'group') group += 1
  }
  return { all: strips.length, solo, date, group }
}

/** Apply a filter pill to the list. `all` is the identity, not a copy of every strip. */
export function applyFilter(strips: StoredStrip[], filter: GalleryFilter): StoredStrip[] {
  if (filter === 'all') return strips
  return strips.filter((strip) => strip.sessionMode === filter)
}

/** `YYYY-MM` for the strip's creation date, in the viewer's own timezone. */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Group strips into month sections, newest month first and newest strip first within it.
 *
 * Time is this page's index: at a hundred-plus strips the problem isn't fitting them on
 * screen, it's finding one, and "roughly when we took it" is the only handle anyone
 * actually has. Grouping by session would scatter a single evening across the page;
 * grouping by month keeps the sections few enough for the spine to list them all.
 *
 * Sorted explicitly rather than trusting the server's order: the list is already sorted
 * newest-first, but an unlocked strip is merged back in place by id (see the store), so
 * relying on arrival order would let one land in the wrong month after a refetch.
 */
export function groupByMonth(strips: StoredStrip[], locale: string): GalleryMonth[] {
  const longFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
  const shortFormat = new Intl.DateTimeFormat(locale, { month: 'long' })

  const byKey = new Map<string, GalleryMonth>()
  for (const strip of strips) {
    const date = new Date(strip.createdAt)
    const key = monthKey(date)
    const month = byKey.get(key)
    if (month) {
      month.strips.push(strip)
    } else {
      byKey.set(key, {
        key,
        year: date.getFullYear(),
        label: longFormat.format(date),
        shortLabel: shortFormat.format(date),
        strips: [strip],
      })
    }
  }

  const months = [...byKey.values()].sort((a, b) => b.key.localeCompare(a.key))
  for (const month of months) {
    month.strips.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  return months
}

/** Fold month sections into the spine's year → months shape, newest year first. */
export function groupByYear(months: GalleryMonth[]): GalleryYear[] {
  const byYear = new Map<number, GalleryYear>()
  for (const month of months) {
    const year = byYear.get(month.year)
    if (year) year.months.push(month)
    else byYear.set(month.year, { year: month.year, months: [month] })
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year)
}

/** The day-of-month caption under a tile ("26 AUG" on desktop, "26" on a phone). */
export function tileDate(strip: StoredStrip, locale: string): { day: string; full: string } {
  const date = new Date(strip.createdAt)
  return {
    day: String(date.getDate()),
    full: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' })
      .format(date)
      .toUpperCase(),
  }
}
