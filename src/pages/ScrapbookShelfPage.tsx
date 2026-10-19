import { Loader2, Plus, TriangleAlert } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useTrackPageView } from '@/analytics'
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
 * A finished, unpaid scrapbook stays on the shelf, tagged "Unpaid": it's also a cart item,
 * paid for there with everything else (user decisions, 2026-10-17).
 *
 * Layout from the "Scrapbook - redesign" mockup (2026-10-19): explain first, shelf second.
 * The Photobooth page's masthead (eyebrow, headline, "You'll get"), then three steps —
 * design → fill → unlock — then the shelf itself.
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

  const used = quota?.used ?? shelf.length
  const limit = quota?.limit ?? 0
  const full = limit > 0 && used >= limit
  const pages = getScrapbookTemplate(DEFAULT_SCRAPBOOK_TEMPLATE_ID)?.pages.length ?? 0

  // Only the shelf waits on the load: the masthead and the steps explain the activity, and
  // they read the same whether or not the list has arrived.
  let shelfBody: ReactNode
  if (!loaded && shelf.length === 0) {
    shelfBody = (
      <div className={styles.state}>
        <Loader2 className={styles.stateSpinner} />
        <span className={styles.stateText}>{t('scrapbook.shelf.loading')}</span>
      </div>
    )
  } else if (status === 'error' && shelf.length === 0) {
    shelfBody = (
      <div className={styles.state}>
        <TriangleAlert className={styles.stateIcon} />
        <span className={styles.stateText}>{t('scrapbook.shelf.loadError')}</span>
        <button type="button" className={styles.stateRetry} onClick={() => void loadShelf()}>
          {t('scrapbook.shelf.retry')}
        </button>
      </div>
    )
  } else if (shelf.length === 0) {
    shelfBody = (
      <div className={styles.empty}>
        <span className={styles.emptyCover} aria-hidden="true" />
        <p className={styles.emptyText}>{t('scrapbook.shelf.emptyTitle')}</p>
        <Link to={ROUTES.scrapbookNew} className={styles.cta}>
          <Plus />
          {t('scrapbook.shelf.emptyCta')}
        </Link>
      </div>
    )
  } else {
    shelfBody = (
      <ul className={styles.covers}>
        {shelf.map((scrapbook) => (
          <li key={scrapbook.id}>
            <ShelfCard scrapbook={scrapbook} language={i18n.language} />
          </li>
        ))}
      </ul>
    )
  }

  const steps = [1, 2, 3] as const

  return (
    <div className={styles.page}>
      <div className={styles.masthead}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('scrapbook.shelf.eyebrow')}</p>
          <h1 className={styles.title}>{t('scrapbook.shelf.heading')}</h1>
          <p className={styles.subtitle}>{t('scrapbook.shelf.intro', { pages })}</p>
        </div>

        {/* A shape-only sample of two pages, the Photobooth masthead's "You'll get". It's
            decorative, so it stays out of the reading order; the caption says what it is. */}
        <div className={styles.sample}>
          <span className={styles.sampleLabel}>{t('scrapbook.shelf.sampleLabel')}</span>
          <div className={styles.sampleBody}>
            <div className={styles.sampleSpread} aria-hidden="true">
              <div className={cn(styles.samplePage, styles.samplePageStrip)}>
                <div className={styles.sampleStrip} />
                <div className={styles.sampleLines}>
                  <div className={styles.sampleLine} />
                  <div className={styles.sampleLine} />
                  <div className={cn(styles.sampleLine, styles.sampleLineShort)} />
                </div>
              </div>
              <div className={styles.samplePage}>
                <div className={styles.sampleCard} />
                <div className={styles.sampleLine} />
                <div className={cn(styles.sampleLine, styles.sampleLineShorter)} />
              </div>
            </div>
            <span className={styles.sampleHint}>{t('scrapbook.shelf.sampleHint', { pages })}</span>
          </div>
        </div>
      </div>

      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step} className={styles.step}>
            <span className={styles.stepNumber}>{String(step).padStart(2, '0')}</span>
            <div className={styles.stepText}>
              <span className={styles.stepTitle}>{t(`scrapbook.shelf.step${step}Title`)}</span>
              <span className={styles.stepBody}>{t(`scrapbook.shelf.step${step}Text`)}</span>
            </div>
          </li>
        ))}
      </ol>

      <section className={styles.shelf} aria-labelledby="scrapbook-shelf-title">
        <div className={styles.shelfHead}>
          <div className={styles.shelfHeading}>
            <h2 id="scrapbook-shelf-title" className={styles.shelfTitle}>
              {t('scrapbook.shelf.title')}
            </h2>
            {shelf.length > 0 && (
              <span className={styles.shelfCount}>
                {t('scrapbook.shelf.subtitle', { count: shelf.length })}
              </span>
            )}
          </div>
          <div className={styles.shelfActions}>
            {limit > 0 && (
              <div className={styles.meter}>
                <span className={cn(styles.meterLabel, full && styles.meterLabelFull)}>
                  {t(full ? 'scrapbook.shelf.meterFull' : 'scrapbook.shelf.meter', {
                    used,
                    limit,
                  })}
                </span>
                {shelf.length > 0 && (
                  <span className={cn(styles.meterTrack, full && styles.meterTrackFull)}>
                    <span
                      className={cn(styles.meterFill, full && styles.meterFillFull)}
                      style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
                    />
                  </span>
                )}
              </div>
            )}
            {/* At the cap it's a disabled button, since a link can't be. The empty
                shelf carries its own, bigger one. */}
            {full ? (
              <button type="button" disabled className={styles.cta}>
                <Plus />
                {t('scrapbook.shelf.new')}
              </button>
            ) : (
              shelf.length > 0 && (
                <Link to={ROUTES.scrapbookNew} className={styles.cta}>
                  <Plus />
                  {t('scrapbook.shelf.new')}
                </Link>
              )
            )}
          </div>
        </div>

        {shelfBody}
      </section>
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
      <span className={styles.cardText}>
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
      </span>
    </Link>
  )
}
