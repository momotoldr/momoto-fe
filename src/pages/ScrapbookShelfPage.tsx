import { BookHeart, Loader2, Plus, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useTrackPageView } from '@/analytics'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_SCRAPBOOK_TEMPLATE_ID, getScrapbookTemplate } from '@/constants/scrapbookTemplates'
import { cn } from '@/lib/utils'
import { useScrapbookStore } from '@/store/useScrapbookStore'
import type { ScrapbookSummary } from '@/types/scrapbookType'

import styles from './ScrapbookShelfPage.module.scss'

const editPath = (id: string) => ROUTES.scrapbookEdit.replace(':scrapbookId', id)

/**
 * The shelf (docs/PLAN-scrapbook.md §6): every scrapbook the user holds — drafts, finished
 * and paid alike, each with a tape saying which — and the way to start another. Paid
 * scrapbooks live here, never in the gallery (user decision, 2026-10-14).
 *
 * Nothing is created here. "New scrapbook" — and the empty shelf's own button — go to the
 * template picker (`/scrapbook/new`), and a draft exists only once a template is chosen
 * there. (Until 2026-10-15 an empty shelf created a draft on arrival; the user changed
 * that, since merely looking left an empty draft saved to the account.)
 *
 * A finished, unpaid scrapbook stays on the shelf, taped "In cart": it's also a cart item,
 * paid for there with everything else (user decisions, 2026-10-17).
 */
export function ScrapbookShelfPage() {
  useTrackPageView()
  const { t, i18n } = useTranslation()

  const shelf = useScrapbookStore((state) => state.shelf)
  const quota = useScrapbookStore((state) => state.quota)
  const status = useScrapbookStore((state) => state.shelfStatus)
  const loadShelf = useScrapbookStore((state) => state.loadShelf)

  // Whether *this visit's* load has landed. The store may still hold an earlier visit's
  // list, which shouldn't be shown as current — an empty one least of all.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void loadShelf().then(() => setLoaded(true))
  }, [loadShelf])

  if (!loaded && shelf.length === 0) {
    return (
      <div className={styles.state}>
        <Loader2 className={styles.stateSpinner} />
        <span className={styles.stateText}>{t('scrapbook.shelf.loading')}</span>
      </div>
    )
  }

  if (status === 'error' && shelf.length === 0) {
    return (
      <div className={styles.state}>
        <TriangleAlert className={styles.stateIcon} />
        <span className={styles.stateText}>{t('scrapbook.shelf.loadError')}</span>
        <button type="button" className={styles.stateRetry} onClick={() => void loadShelf()}>
          {t('scrapbook.shelf.retry')}
        </button>
      </div>
    )
  }

  const used = quota?.used ?? shelf.length
  const limit = quota?.limit ?? 0
  const full = limit > 0 && used >= limit
  const pages = getScrapbookTemplate(DEFAULT_SCRAPBOOK_TEMPLATE_ID)?.pages.length ?? 0

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <h1 className={styles.title}>{t('scrapbook.shelf.title')}</h1>
          <p className={styles.subtitle}>
            {shelf.length === 0
              ? t('scrapbook.shelf.subtitleEmpty')
              : t('scrapbook.shelf.subtitle', { count: shelf.length })}
          </p>
        </div>
        <div className={styles.headActions}>
          {limit > 0 && (
            <div className={styles.meter}>
              <span className={cn(styles.meterLabel, full && styles.meterLabelFull)}>
                {t(full ? 'scrapbook.shelf.meterFull' : 'scrapbook.shelf.meter', { used, limit })}
              </span>
              <span className={cn(styles.meterTrack, full && styles.meterTrackFull)}>
                <span
                  className={cn(styles.meterFill, full && styles.meterFillFull)}
                  style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
                />
              </span>
            </div>
          )}
          {/* A link styled as the button, so it can't be followed at the cap. */}
          {full ? (
            <Button disabled>
              <Plus />
              {t('scrapbook.shelf.new')}
            </Button>
          ) : (
            shelf.length > 0 && (
              <Button asChild>
                <Link to={ROUTES.scrapbookNew}>
                  <Plus />
                  {t('scrapbook.shelf.new')}
                </Link>
              </Button>
            )
          )}
        </div>
      </header>

      {shelf.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <BookHeart />
          </span>
          <h2 className={styles.emptyTitle}>{t('scrapbook.shelf.emptyTitle')}</h2>
          <p className={styles.emptyText}>{t('scrapbook.shelf.emptyText', { pages })}</p>
          <Button asChild className={styles.emptyCta}>
            <Link to={ROUTES.scrapbookNew}>
              <Plus />
              {t('scrapbook.shelf.emptyCta')}
            </Link>
          </Button>
        </div>
      ) : (
        <ul className={styles.shelf}>
          {shelf.map((scrapbook) => (
            <li key={scrapbook.id}>
              <ShelfCard scrapbook={scrapbook} language={i18n.language} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ShelfCard({ scrapbook, language }: { scrapbook: ScrapbookSummary; language: string }) {
  const { t } = useTranslation()
  const template = getScrapbookTemplate(scrapbook.templateId)
  const title = scrapbook.title || t('scrapbook.shelf.untitled')
  // A finished scrapbook shows its real cover; a draft has none yet, so it shows the
  // template's cover art — recognisably the same book, just not filled in.
  const cover = scrapbook.coverUrl ?? template?.pages[0]?.background ?? null

  return (
    <Link to={editPath(scrapbook.id)} className={styles.card}>
      <span
        className={styles.cover}
        style={template ? { aspectRatio: `${template.aspect}` } : undefined}
      >
        {cover && (
          <img
            src={cover}
            alt={t('scrapbook.shelf.coverAlt', { title })}
            className={cn(styles.coverImage, !scrapbook.coverUrl && styles.coverImageDraft)}
            loading="lazy"
          />
        )}
        <span className={cn(styles.tape, styles[`tape_${scrapbook.state}`])}>
          {t(`scrapbook.states.${scrapbook.state}`)}
        </span>
      </span>
      <span className={styles.cardTitle}>{title}</span>
      <span className={styles.cardMeta}>
        {t('scrapbook.shelf.edited', {
          date: new Date(scrapbook.updatedAt).toLocaleDateString(language, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
        })}
      </span>
    </Link>
  )
}
