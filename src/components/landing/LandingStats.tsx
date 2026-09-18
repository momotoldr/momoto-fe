import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchPublicStats } from '@/api/services/statsService'
import {
  STATS_CACHE_MAX_AGE_MS,
  STATS_CACHE_STORAGE_KEY,
  STATS_MIN_SESSIONS,
  STATS_MIN_STRIPS,
  STATS_MIN_USERS,
} from '@/constants/stats'
import type { PublicStats } from '@/types/statsType'
import { roundTotalDown } from '@/utils/stats'

import styles from './LandingStats.module.scss'

/** What survives between visits — the three totals, all of which only ever grow. */
interface CachedCounts {
  users: number
  sessions: number
  strips: number
  /** When it was written — anything past `STATS_CACHE_MAX_AGE_MS` is ignored. */
  at: number
}

/** A count is only usable if it's a finite, non-negative number. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** The last snapshot this browser saw, if it's still recent enough to show. */
function readCache(): PublicStats | null {
  try {
    const raw = localStorage.getItem(STATS_CACHE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedCounts>
    if (
      !isCount(parsed.users) ||
      !isCount(parsed.sessions) ||
      !isCount(parsed.strips) ||
      !isCount(parsed.at)
    ) {
      return null
    }
    if (Date.now() - parsed.at > STATS_CACHE_MAX_AGE_MS) return null
    return { users: parsed.users, sessions: parsed.sessions, strips: parsed.strips }
  } catch {
    // Unreadable, unparseable, or a private window that throws on access. The fetch
    // is the real source; this was only ever a head start.
    return null
  }
}

function writeCache(stats: PublicStats): void {
  try {
    const entry: CachedCounts = {
      users: stats.users,
      sessions: stats.sessions,
      strips: stats.strips,
      at: Date.now(),
    }
    localStorage.setItem(STATS_CACHE_STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // A full or disabled store costs a head start on the next visit, nothing more.
  }
}

/**
 * The three platform counters under "How it works": accounts, shared sessions, strips.
 *
 * They took the FAQ's place on the landing page. The questions moved to the Help
 * Center; what a visitor deciding whether to try the booth actually wants at that point
 * is evidence that other people are in it.
 *
 * **First paint comes from `localStorage` when there is one**, so a returning visitor
 * gets numbers immediately and an offline one gets them at all. The fetch then corrects
 * them. A browser with no cache and no answer renders **nothing** — a skeleton would
 * reserve space for a section that may never fill, and zeros would say "nobody uses
 * this" when the truth is "we couldn't ask". A quiet section is the honest failure
 * here, and it costs the page nothing.
 *
 * **It also stays quiet until the totals are worth showing** (`STATS_MIN_*`). Numbers
 * this small make the argument in reverse, and a landing page that closes on its call
 * to action is stronger than one that closes on proof nobody is here yet.
 */
export function LandingStats() {
  const { t, i18n } = useTranslation()
  // Read during the initial render, not in an effect: the point of the cache is to be
  // on screen for the first paint.
  const [counts, setCounts] = useState<PublicStats | null>(readCache)

  // One request per visit, no polling. The totals are a daily snapshot on the server
  // and get rounded down here, so a minutely refresh would spend a request per visitor
  // per minute to redraw the same digits.
  useEffect(() => {
    const controller = new AbortController()

    fetchPublicStats(controller.signal)
      .then((stats) => {
        setCounts(stats)
        writeCache(stats)
      })
      // A failed fetch keeps whatever the cache already put on screen — it was true
      // earlier today, which beats the section vanishing under the reader.
      .catch(() => {})

    return () => controller.abort()
  }, [])

  if (!counts) return null
  // Below the floor the band would undersell the product rather than sell it — see
  // `STATS_MIN_USERS`. Checked against the true totals, not the rounded-down ones, so
  // the floor means what it says.
  if (
    counts.users < STATS_MIN_USERS ||
    counts.sessions < STATS_MIN_SESSIONS ||
    counts.strips < STATS_MIN_STRIPS
  ) {
    return null
  }

  const format = new Intl.NumberFormat(i18n.language).format

  /**
   * A cumulative total: rounded down, and marked with a "+" once it's big enough to
   * round at all. The rounding is what lets the server compute these once a day —
   * a figure that only claims "at least this many" doesn't go stale between refreshes.
   */
  const total = (value: number): string => {
    const { value: rounded, approximate } = roundTotalDown(value)
    return approximate ? `${format(rounded)}+` : format(rounded)
  }

  // The dash above each number is the only colour in the band, and it is what tells
  // the three cells apart at a glance.
  const cells = [
    { key: 'users', dash: styles.dashPink, text: total(counts.users) },
    { key: 'sessions', dash: styles.dashMint, text: total(counts.sessions) },
    { key: 'strips', dash: styles.dashBlue, text: total(counts.strips) },
  ]

  return (
    <section className={styles.stats} aria-labelledby="stats-heading">
      <h2 id="stats-heading" className={styles.srOnly}>
        {t('landing.stats.title')}
      </h2>
      <dl className={styles.row}>
        {cells.map(({ key, dash, text }) => (
          <div key={key} className={styles.cell}>
            <span className={`${styles.dash} ${dash}`} aria-hidden="true" />
            {/* Term before its definition, as a `dl` group requires — on desktop the
             * cell lifts the number back above the caption with `order`. */}
            <dt className={styles.label}>{t(`landing.stats.${key}`)}</dt>
            <dd className={styles.value}>{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
