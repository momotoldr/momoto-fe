import { Loader2, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchPrintBlob } from '@/api/services/stripsService'
import { FilterEmpty, GalleryEmpty } from '@/features/gallery/GalleryEmpty'
import {
  applyFilter,
  countByMode,
  groupByMonth,
  groupByYear,
  type GalleryFilter,
} from '@/features/gallery/galleryData'
import { MonthSection } from '@/features/gallery/MonthSection'
import { MonthSpine } from '@/features/gallery/MonthSpine'
import { galleryItems } from '@/features/gallery/selectors'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/store/useCartStore'
import type { StoredStrip } from '@/types/stripType'
import { extensionForBlob, saveImageBlob, toPngBlob } from '@/utils/download'

import styles from './GalleryPage.module.scss'

/** The filter pills, in the order the design shows them. */
const FILTERS: GalleryFilter[] = ['all', 'solo', 'date', 'group']

/**
 * The gallery: every unlocked strip, as a contact sheet indexed by month.
 *
 * This page holds only paid strips — clean, watermark-free copies — so everything on it
 * is finished work. Past a hundred of them the problem stops being layout and becomes
 * navigation, which is why time is the index here: dense month sections at the strip's
 * true 1:3 shape, a sticky spine to jump between them, and Solo/Date demoted from the
 * grouping to a filter plus a marker on each tile.
 */
export function GalleryPage() {
  const { t, i18n } = useTranslation()

  const items = useCartStore((state) => state.items)
  const status = useCartStore((state) => state.status)
  const limit = useCartStore((state) => state.limits.gallery)
  const load = useCartStore((state) => state.load)

  const [filter, setFilter] = useState<GalleryFilter>('all')
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  // The strip whose clean file is downloading, so its tile button can show it.
  const [busyId, setBusyId] = useState<string | null>(null)
  /**
   * Touch only: the tile whose actions are showing.
   *
   * A pointer reveals a tile's actions by hovering it; a finger has no equivalent, so on
   * touch a tap reveals them instead — one tile at a time, which keeps the other
   * twenty-odd images in the grid unobscured.
   */
  const [activeTileId, setActiveTileId] = useState<string | null>(null)
  const [activeMonth, setActiveMonth] = useState<string | null>(null)

  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status === 'idle') void load()
  }, [status, load])

  // Derived from the store's stable `items` rather than selected out of it: a selector
  // returning `items.filter(...)` hands React a fresh array per snapshot read, which
  // never settles under `useSyncExternalStore`.
  const strips = useMemo(() => galleryItems(items), [items])
  const counts = useMemo(() => countByMode(strips), [strips])
  const visible = useMemo(() => applyFilter(strips, filter), [strips, filter])
  const months = useMemo(() => groupByMonth(visible, i18n.language), [visible, i18n.language])
  const years = useMemo(() => groupByYear(months), [months])

  const used = strips.length
  const full = limit > 0 && used >= limit
  // A Solo/Date pill that matched nothing. Can only happen on a mode pill: with any
  // strips at all, "All" always has something, so `filter` here is never 'all'.
  const filterEmpty = used > 0 && visible.length === 0
  // A strip is stuck in the cart *because* the gallery is full — the state the design
  // shows as a banner plus a placeholder at the head of the newest month. Both conditions
  // matter: a full gallery with an empty cart is simply a full gallery, not a problem.
  const blocked = full && items.some((item) => !item.paid)

  // Highlight the month the reader is actually looking at. The rail is a jump list, so it
  // has to track free scrolling too, not just its own clicks.
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const sections = sheet.querySelectorAll('[id^="gallery-month-"]')
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // The topmost section currently intersecting wins. Sorting by position rather
        // than taking the first entry keeps the highlight stable when several months are
        // on screen at once — short months easily are.
        const onScreen = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const top = onScreen[0]?.target.id
        if (top) setActiveMonth(top.replace('gallery-month-', ''))
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 }
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [months])

  // A revealed tile can outlive what it points at — a filter change, or a strip removed
  // from another tab. Drop it rather than leaving an overlay pinned to nothing.
  useEffect(() => {
    setActiveTileId((current) =>
      current && visible.some((strip) => strip.id === current) ? current : null
    )
  }, [visible])

  const toggleTile = useCallback((id: string) => {
    setActiveTileId((current) => (current === id ? null : id))
  }, [])

  const toggleExpanded = useCallback((key: string) => {
    setExpandedMonths((current) => new Set(current).add(key))
  }, [])

  /**
   * Jump the sheet to a month.
   *
   * Deliberately an instant scroll, not a smooth one. `behavior: 'smooth'` is silently a
   * no-op in some engines and embedded webviews — it doesn't fall back to an instant
   * scroll, it simply doesn't scroll — which would leave the spine looking broken. The
   * control is called "jump to"; landing there at once is also the honest reading of it.
   * The offset comes from the section's own `scroll-mt`, so the heading clears the sticky
   * app bar.
   */
  const jumpToMonth = useCallback((key: string) => {
    document.getElementById(`gallery-month-${key}`)?.scrollIntoView({ block: 'start' })
  }, [])

  /** Fetch one clean file and hand it to the browser. */
  const downloadOne = useCallback(async (strip: StoredStrip) => {
    // Stored as WebP, handed over as PNG — see `toPngBlob`. The extension comes from
    // what that actually returned, because it falls back to the original on failure.
    const file = await toPngBlob(await fetchPrintBlob(strip.id))
    return saveImageBlob(file, `momoto-strip-${strip.id}.${extensionForBlob(file)}`)
  }, [])

  const downloadStrip = useCallback(
    async (strip: StoredStrip) => {
      setBusyId(strip.id)
      try {
        // `unsupported` means the browser has no route to a file at all — the iOS
        // engines that ignore `download` and can't reach a share sheet. Saying nothing
        // there would look exactly like the button being broken, so name the way out.
        if ((await downloadOne(strip)) === 'unsupported') {
          toast.info(t('common.pressAndHoldToSave'))
        }
      } catch {
        toast.error(t('gallery.downloadError'))
      } finally {
        setBusyId(null)
      }
    },
    [downloadOne, t]
  )

  if (status === 'loading' && items.length === 0) {
    return (
      <div className={styles.state}>
        <Loader2 className={styles.stateSpinner} />
        <span className={styles.stateText}>{t('gallery.loading')}</span>
      </div>
    )
  }

  if (status === 'error' && items.length === 0) {
    return (
      <div className={styles.state}>
        <TriangleAlert className={styles.stateIcon} />
        <span className={styles.stateText}>{t('gallery.loadError')}</span>
        <button type="button" className={styles.stateRetry} onClick={() => void load()}>
          {t('gallery.retry')}
        </button>
      </div>
    )
  }

  const empty = strips.length === 0

  return (
    <div className={styles.page}>
      <header className={cn(styles.head, empty && styles.headEmpty)}>
        <h1 className={styles.title}>{t('gallery.title')}</h1>
        <p className={styles.subtitle}>
          {empty ? t('gallery.subtitleEmpty') : t('gallery.subtitle', { count: used })}
        </p>
      </header>

      {empty ? (
        <GalleryEmpty limit={limit} />
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.filters} role="group" aria-label={t('gallery.filterLabel')}>
              {FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={cn(styles.pill, filter === key && styles.pillActive)}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {key !== 'all' && (
                    <span
                      className={cn(styles.dot, key === 'date' && styles.dotDate)}
                      aria-hidden="true"
                    />
                  )}
                  {t(`gallery.filter_${key}`, {
                    count: counts[key],
                  })}
                </button>
              ))}
            </div>

            {/* The capacity meter. It turns destructive at the cap rather than only
                warning near it — until you're full, the number is information, not a
                thing to act on. */}
            <div className={styles.meter}>
              <span className={cn(styles.meterLabel, full && styles.meterLabelFull)}>
                {t(full ? 'gallery.meterFull' : 'gallery.meter', { used, limit })}
              </span>
              <span className={cn(styles.meterTrack, full && styles.meterTrackFull)}>
                <span
                  className={cn(styles.meterFill, full && styles.meterFillFull)}
                  style={{ width: limit > 0 ? `${Math.min(100, (used / limit) * 100)}%` : '0%' }}
                />
              </span>
            </div>
          </div>

          {blocked && (
            <div className={styles.banner}>
              <span className={styles.bannerIcon} aria-hidden="true">
                <TriangleAlert />
              </span>
              <p className={styles.bannerText}>{t('gallery.fullBanner', { used, limit })}</p>
            </div>
          )}

          {filterEmpty && filter !== 'all' ? (
            <FilterEmpty mode={filter} total={used} onShowAll={() => setFilter('all')} />
          ) : (
            <div className={styles.body}>
              <MonthSpine years={years} activeKey={activeMonth} onJump={jumpToMonth} />

              <div className={styles.sheet} ref={sheetRef}>
                {months.map((month, index) => (
                  <MonthSection
                    key={month.key}
                    month={month}
                    strips={month.strips}
                    activeTileId={activeTileId}
                    busyId={busyId}
                    expanded={expandedMonths.has(month.key)}
                    // Only the newest month carries the placeholder: it stands for a strip
                    // that would have landed today.
                    showLocked={blocked && index === 0}
                    onToggleExpanded={toggleExpanded}
                    onToggleTile={toggleTile}
                    onDownload={(strip) => void downloadStrip(strip)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
