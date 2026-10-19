import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ANALYTICS_EVENTS, trackEvents, useTrackPageView } from '@/analytics'
import { ROUTES } from '@/constants/routes'
import {
  DEFAULT_SCRAPBOOK_TEMPLATE_ID,
  SCRAPBOOK_TEMPLATES,
  type ScrapbookPage,
  type ScrapbookTemplate,
} from '@/constants/scrapbookTemplates'
import { STRIP_LAYOUTS, type StripLayout } from '@/constants/stripTemplates'
import { pageLabel } from '@/features/scrapbook/pageLabel'
import { ScrapbookPageView } from '@/features/scrapbook/ScrapbookPageView'
import { cn } from '@/lib/utils'
import { useScrapbookStore } from '@/store/useScrapbookStore'
import type { ScrapbookContent } from '@/types/scrapbookType'

import styles from './ScrapbookTemplatePage.module.scss'

/** A template shown as it is before anything is placed: art only. */
const EMPTY: ScrapbookContent = { strips: {}, texts: {} }

/**
 * From this many templates the choice moves out of the side panel into a scrolling rail
 * above the preview — a list of rows stops fitting the panel well before that.
 */
const RAIL_FROM = 5

/** How far one press of a rail arrow scrolls, in px. */
const RAIL_STEP = 540

/** How many strip places of each family a template has, across all its pages. */
function stripCounts(template: ScrapbookTemplate): Record<StripLayout, number> {
  const counts: Record<StripLayout, number> = { '4x1': 0, '2x2': 0 }
  for (const page of template.pages) for (const slot of page.strips) counts[slot.layout] += 1
  return counts
}

function stripTotal(template: ScrapbookTemplate): number {
  return template.pages.reduce((sum, page) => sum + page.strips.length, 0)
}

/**
 * Choosing a template — the step between "New scrapbook" and the editor (user decision,
 * 2026-10-15). Nothing is created until a template is picked: the draft is made by "Use
 * this template", and only then does the user land in the editor.
 *
 * Layout from the "Scrapbook New - redesign" mockup (2026-10-19): a page-flipper. A large
 * preview of one page with arrows, every page as a thumbnail below it, and a side panel with
 * the template choice, what there is to fill, and the one button. A phone drops the big
 * preview for a scrolling row of pages. A scrapbook keeps its template for life
 * (`Scrapbook.templateId`), so the whole book is shown before committing.
 */
export function ScrapbookTemplatePage() {
  useTrackPageView()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useScrapbookStore((state) => state.create)
  const quota = useScrapbookStore((state) => state.quota)

  const [selectedId, setSelectedId] = useState(DEFAULT_SCRAPBOOK_TEMPLATE_ID)
  const [pageIndex, setPageIndex] = useState(0)
  const [creating, setCreating] = useState(false)
  const selected =
    SCRAPBOOK_TEMPLATES.find((template) => template.id === selectedId) ?? SCRAPBOOK_TEMPLATES[0]

  // Known only once the shelf has loaded this session; otherwise the create itself answers.
  const full = quota !== null && quota.limit > 0 && quota.used >= quota.limit
  const rail = SCRAPBOOK_TEMPLATES.length >= RAIL_FROM

  const select = (id: string) => {
    setSelectedId(id)
    setPageIndex(0)
  }

  const start = async () => {
    if (!selected) return
    setCreating(true)
    const result = await create(selected.id)
    setCreating(false)
    if (result.ok) {
      trackEvents(ANALYTICS_EVENTS.SCRAPBOOK_CREATED, { from: 'new' })
      // Replace: Back from the editor returns to the shelf, not to this picker.
      navigate(ROUTES.scrapbookEdit.replace(':scrapbookId', result.scrapbook.id), {
        replace: true,
      })
      return
    }
    if (result.reason === 'limit') {
      toast.error(t('scrapbook.shelf.limit', { limit: quota?.limit ?? 0 }))
      navigate(ROUTES.scrapbook)
      return
    }
    toast.error(t('scrapbook.shelf.createError'))
  }

  const pages = selected?.pages ?? []
  const page = pages[pageIndex] ?? pages[0]
  const counts = selected ? stripCounts(selected) : null
  const step = (delta: number) =>
    setPageIndex((index) => (index + delta + pages.length) % pages.length)

  const labelOf = (item: ScrapbookPage, index: number) => pageLabel(item, index, t)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link to={ROUTES.scrapbook} className={styles.back}>
          <ArrowLeft aria-hidden="true" />
          {t('scrapbook.editor.back')}
        </Link>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('scrapbook.picker.eyebrow')}</p>
          <h1 className={styles.title}>{t('scrapbook.picker.title')}</h1>
          <p className={styles.subtitle}>{t('scrapbook.picker.subtitle')}</p>
        </div>
      </header>

      {rail && <TemplateRail selectedId={selected?.id} onSelect={select} />}

      {selected && page && counts && (
        <div className={styles.body}>
          {/* Desktop: one page large, every page below it. */}
          <section className={styles.viewer} aria-label={t('scrapbook.picker.pagesLabel')}>
            <div className={styles.stage}>
              <button
                type="button"
                className={styles.stageArrow}
                aria-label={t('scrapbook.picker.prevPage')}
                onClick={() => step(-1)}
              >
                <ChevronLeft />
              </button>
              <div className={styles.stagePage}>
                <div className={styles.stageFrame} style={{ aspectRatio: `${selected.aspect}` }}>
                  <ScrapbookPageView
                    template={selected}
                    page={page}
                    content={EMPTY}
                    strips={{}}
                    mode="view"
                  />
                </div>
                <span className={styles.stageCaption} aria-live="polite">
                  {t('scrapbook.picker.position', {
                    page: labelOf(page, pageIndex),
                    n: pageIndex + 1,
                    total: pages.length,
                  })}
                </span>
              </div>
              <button
                type="button"
                className={styles.stageArrow}
                aria-label={t('scrapbook.picker.nextPage')}
                onClick={() => step(1)}
              >
                <ChevronRight />
              </button>
            </div>

            <ol className={styles.thumbs}>
              {pages.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(styles.thumb, index === pageIndex && styles.thumbActive)}
                    aria-current={index === pageIndex ? 'true' : undefined}
                    onClick={() => setPageIndex(index)}
                  >
                    <span className={styles.thumbFrame}>
                      <ScrapbookPageView
                        template={selected}
                        page={item}
                        content={EMPTY}
                        strips={{}}
                        mode="thumb"
                      />
                    </span>
                    <span className={styles.thumbLabel}>{labelOf(item, index)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {/* Phone: the pages as a row to scroll through. */}
          <section className={styles.strip} aria-label={t('scrapbook.picker.pagesLabel')}>
            <span className={styles.label}>{t('scrapbook.picker.pagesLabel')}</span>
            <ol className={styles.stripPages}>
              {pages.map((item, index) => (
                <li key={item.id} className={styles.stripPage}>
                  <ScrapbookPageView
                    template={selected}
                    page={item}
                    content={EMPTY}
                    strips={{}}
                    mode="thumb"
                  />
                  <span className={styles.stripLabel}>{labelOf(item, index)}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* On a phone the panel dissolves into the column: its template list goes above
              the pages and its button below them. */}
          <aside className={styles.panel}>
            {rail ? (
              <div className={styles.summary}>
                <span className={styles.label}>{t('scrapbook.picker.selected')}</span>
                <span className={styles.summaryName}>
                  {t(`scrapbook.templates.${selected.label}`)}
                </span>
                <span className={styles.summaryMeta}>
                  {t('scrapbook.picker.pages', { count: pages.length })}
                </span>
              </div>
            ) : (
              <TemplateList selectedId={selected.id} onSelect={select} />
            )}

            <div className={styles.fill}>
              <span className={styles.label}>{t('scrapbook.picker.toFill')}</span>
              <ul className={styles.fillRows}>
                {STRIP_LAYOUTS.map((layout) => (
                  <li key={layout} className={styles.fillRow}>
                    <span className={styles.fillName}>
                      <span
                        className={cn(styles.fillSwatch, styles[`fillSwatch_${layout}`])}
                        aria-hidden="true"
                      />
                      {t(`scrapbook.picker.strips_${layout}`)}
                    </span>
                    <span className={styles.fillCount}>{counts[layout]}</span>
                  </li>
                ))}
              </ul>
              <span className={styles.fillNote}>{t('scrapbook.picker.fillNote')}</span>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cta}
                disabled={creating || full}
                onClick={() => void start()}
              >
                {creating && <Loader2 className={styles.spin} />}
                {t(creating ? 'scrapbook.shelf.creating' : 'scrapbook.picker.use')}
                {!creating && <ArrowRight aria-hidden="true" />}
              </button>
              {quota !== null && quota.limit > 0 && (
                <span className={cn(styles.quota, full && styles.quotaFull)}>
                  {full
                    ? t('scrapbook.shelf.limit', { limit: quota.limit })
                    : t('scrapbook.picker.used', { used: quota.used, limit: quota.limit })}
                </span>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

/** Few templates: rows in the side panel (a scrolling row on a phone). */
function TemplateList({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const single = SCRAPBOOK_TEMPLATES.length === 1

  return (
    <div className={styles.list}>
      <span className={styles.label}>{t('scrapbook.picker.templates')}</span>
      <ul
        className={styles.listRows}
        role="radiogroup"
        aria-label={t('scrapbook.picker.templates')}
      >
        {SCRAPBOOK_TEMPLATES.map((template) => {
          const selected = template.id === selectedId
          const pages = t('scrapbook.picker.pages', { count: template.pages.length })
          return (
            <li key={template.id} className={cn(styles.listItem, single && styles.listItemSingle)}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(styles.row, selected && styles.rowSelected)}
                onClick={() => onSelect(template.id)}
              >
                <img
                  src={template.pages[0]?.background}
                  alt=""
                  className={styles.rowCover}
                  style={{ aspectRatio: `${template.aspect}` }}
                />
                <span className={styles.rowText}>
                  <span className={styles.rowName}>
                    {t(`scrapbook.templates.${template.label}`)}
                  </span>
                  {/* The panel has the strip counts beside it; a phone's row says them here. */}
                  <span className={cn(styles.rowMeta, styles.rowMetaWide)}>{pages}</span>
                  <span className={cn(styles.rowMeta, styles.rowMetaNarrow)}>
                    {t('scrapbook.picker.meta', { pages, count: stripTotal(template) })}
                  </span>
                </span>
                {selected && (
                  <span className={styles.check} aria-hidden="true">
                    <Check />
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Many templates: a scrolling rail of covers above the preview. */
function TemplateRail({
  selectedId,
  onSelect,
}: {
  selectedId: string | undefined
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const railRef = useRef<HTMLUListElement>(null)
  const scroll = (direction: number) =>
    railRef.current?.scrollBy({ left: direction * RAIL_STEP, behavior: 'smooth' })

  return (
    <section className={styles.rail} aria-label={t('scrapbook.picker.templates')}>
      <div className={styles.railHead}>
        <span className={styles.railTitle}>
          {t('scrapbook.picker.templates')}
          <span className={styles.railCount}>
            {t('scrapbook.picker.count', { count: SCRAPBOOK_TEMPLATES.length })}
          </span>
        </span>
        <span className={styles.railArrows}>
          <button
            type="button"
            className={styles.railArrow}
            aria-label={t('scrapbook.picker.scrollBack')}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            className={styles.railArrow}
            aria-label={t('scrapbook.picker.scrollForward')}
            onClick={() => scroll(1)}
          >
            <ChevronRight />
          </button>
        </span>
      </div>
      <ul ref={railRef} className={styles.railItems} role="radiogroup">
        {SCRAPBOOK_TEMPLATES.map((template) => {
          const selected = template.id === selectedId
          return (
            <li key={template.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(styles.cover, selected && styles.coverSelected)}
                onClick={() => onSelect(template.id)}
              >
                <span className={styles.coverFrame}>
                  <img
                    src={template.pages[0]?.background}
                    alt=""
                    className={styles.coverImage}
                    style={{ aspectRatio: `${template.aspect}` }}
                  />
                  {selected && (
                    <span className={cn(styles.check, styles.coverCheck)} aria-hidden="true">
                      <Check />
                    </span>
                  )}
                </span>
                <span className={styles.coverName}>
                  {t(`scrapbook.templates.${template.label}`)}
                </span>
                <span className={styles.coverMeta}>
                  {t('scrapbook.picker.pages', { count: template.pages.length })}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
