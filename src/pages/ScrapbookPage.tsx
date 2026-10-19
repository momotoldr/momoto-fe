import {
  ArrowLeft,
  BookCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ANALYTICS_EVENTS, trackEvents, useTrackPageView } from '@/analytics'
import ApiError from '@/api/apiError'
import { reopenScrapbook } from '@/api/services/scrapbooksService'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ROUTES } from '@/constants/routes'
import { env } from '@/env'
import { EditorMenu, type EditorMenuItem } from '@/features/scrapbook/EditorMenu'
import { EditorSheet } from '@/features/scrapbook/EditorSheet'
import { PageChecklist } from '@/features/scrapbook/PageChecklist'
import { PageRail } from '@/features/scrapbook/PageRail'
import { pageLabel } from '@/features/scrapbook/pageLabel'
import { ScrapbookPageView, type ScrapbookSelection } from '@/features/scrapbook/ScrapbookPageView'
import { StripTray } from '@/features/scrapbook/StripTray'
import { TextPanel } from '@/features/scrapbook/TextPanel'
import { useDesktopLayout } from '@/features/scrapbook/useDesktopLayout'
import { useScrapbookFinish, type FinishOutcome } from '@/features/scrapbook/useScrapbookFinish'
import { useScrapbookDownload } from '@/features/scrapbook/useScrapbookDownload'
import { ViewerPanel } from '@/features/scrapbook/ViewerPanel'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/store/useCartStore'
import { useScrapbookStore } from '@/store/useScrapbookStore'
import type { Scrapbook } from '@/types/scrapbookType'
import type { StoredStrip } from '@/types/stripType'

import styles from './ScrapbookPage.module.scss'

/** The scrapbook name's limit, matching the server's. */
const TITLE_MAX_LENGTH = 80

/** The cover title as a one-line scrapbook name. */
const asName = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX_LENGTH)

/**
 * One scrapbook: the editor while it's a draft, a read-only viewer once it's finished or
 * paid (docs/PLAN-scrapbook.md §6). One route and one layout for all three states.
 *
 * Layout from the "Scrapbook Editor - redesign" mockup (2026-10-19): the editor fills the
 * screen under the app bar with no page scroll — the rail and the side panel scroll on their
 * own. Finish waits for every strip place, so progress sits in the header beside it and each
 * page in the rail says how many places it still needs. The side panel follows what's
 * tapped: the page's checklist → the strip tray → the text field. On a phone the panel
 * becomes a bottom sheet, and the pager and Finish move to a bar under the page.
 *
 * Finishing renders the PDF in this tab (`useScrapbookFinish`); unlocking, paying and
 * downloading live in `ViewerPanel`.
 */

/** What to tell the user once a finish ends, other than success. */
const FINISH_MESSAGES: Record<Exclude<FinishOutcome, 'done'>, string> = {
  cancelled: 'scrapbook.finish.cancelled',
  changed: 'scrapbook.finish.changed',
  unsaved: 'scrapbook.finish.unsaved',
  cartFull: 'scrapbook.finish.cartFull',
  failed: 'scrapbook.finish.failed',
}
export function ScrapbookPage() {
  useTrackPageView()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { scrapbookId } = useParams<{ scrapbookId: string }>()

  const current = useScrapbookStore((state) => state.current)
  const openStatus = useScrapbookStore((state) => state.openStatus)
  const saveState = useScrapbookStore((state) => state.saveState)
  const open = useScrapbookStore((state) => state.open)
  const close = useScrapbookStore((state) => state.close)
  const placeStrip = useScrapbookStore((state) => state.placeStrip)
  const setText = useScrapbookStore((state) => state.setText)
  const setTitle = useScrapbookStore((state) => state.setTitle)
  const replaceCurrent = useScrapbookStore((state) => state.replaceCurrent)
  const discard = useScrapbookStore((state) => state.discard)
  const frozen = useScrapbookStore((state) => state.frozen)

  const [pageIndex, setPageIndex] = useState(0)
  const [selection, setSelection] = useState<ScrapbookSelection | null>(null)
  const [busy, setBusy] = useState<'reopen' | 'discard' | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const { finish, cancel, progress, otherTabFinishing } = useScrapbookFinish(scrapbookId)

  useEffect(() => {
    if (!scrapbookId) return
    setPageIndex(0)
    setSelection(null)
    void open(scrapbookId)
    // Leaving saves whatever is still pending.
    return () => void close()
  }, [scrapbookId, open, close])

  const scrapbook = current?.scrapbook.id === scrapbookId ? current?.scrapbook : undefined
  const template = current?.template ?? null
  const missing = useMemo(() => new Set(current?.missing ?? []), [current?.missing])
  const draft = scrapbook?.state === 'draft'
  // A draft only takes edits while nothing is finishing it — here or in another tab.
  const editing = draft && !frozen && !progress && !otherTabFinishing
  // Where the strip picker opens: the side column on desktop, a pop-up on a phone.
  const desktop = useDesktopLayout()

  const page = template?.pages[pageIndex]
  const stripSlot =
    selection?.kind === 'strip' ? page?.strips.find((slot) => slot.id === selection.id) : undefined
  const textSlot =
    selection?.kind === 'text' ? page?.texts.find((slot) => slot.id === selection.id) : undefined

  const goToPage = useCallback((index: number) => {
    setPageIndex(index)
    setSelection(null)
  }, [])

  const keepEditing = useCallback(async () => {
    if (!scrapbook) return
    setBusy('reopen')
    try {
      replaceCurrent(await reopenScrapbook(scrapbook.id))
    } catch (error) {
      const inProgress = error instanceof ApiError && error.code === 'payment_in_progress'
      toast.error(
        t(inProgress ? 'scrapbook.viewer.paymentInProgress' : 'scrapbook.viewer.reopenError')
      )
    } finally {
      setBusy(null)
    }
  }, [scrapbook, replaceCurrent, t])

  const confirmDiscardThis = useCallback(async () => {
    if (!scrapbook) return
    setBusy('discard')
    const result = await discard(scrapbook)
    setBusy(null)
    setConfirmDiscard(false)
    if (result.ok) {
      toast.success(t('scrapbook.discard.done'))
      navigate(ROUTES.scrapbook)
    } else {
      toast.error(
        t(result.reason === 'stale' ? 'scrapbook.discard.stale' : 'scrapbook.discard.error')
      )
    }
  }, [scrapbook, discard, navigate, t])

  /**
   * Every place for a strip that is still empty — or emptied by its strip leaving the gallery,
   * since that prints as blank paper too. Finish waits until there are none (user decision,
   * 2026-10-17); text places stay optional.
   */
  const emptyPlaces = useMemo(() => {
    if (!template || !scrapbook) return 0
    return template.pages
      .flatMap((page) => page.strips)
      .filter((slot) => {
        const stripId = scrapbook.content.strips[slot.id]
        return !stripId || missing.has(stripId)
      }).length
  }, [template, scrapbook, missing])

  /** Empty strip places per page, for the rail's badges. */
  const emptyByPage = useMemo(() => {
    if (!template || !scrapbook) return []
    return template.pages.map(
      (item) =>
        item.strips.filter((slot) => {
          const stripId = scrapbook.content.strips[slot.id]
          return !stripId || missing.has(stripId)
        }).length
    )
  }, [template, scrapbook, missing])

  /** Strips placed in some other place of this book — the tray marks them "Used". */
  const usedElsewhere = useMemo(() => {
    const placed = Object.entries(scrapbook?.content.strips ?? {})
    return new Set(placed.filter(([slotId]) => slotId !== stripSlot?.id).map(([, id]) => id))
  }, [scrapbook?.content.strips, stripSlot?.id])

  /**
   * Finishing puts the scrapbook in the cart, where it takes a slot like a strip (user
   * decision, 2026-10-17) — so a full cart holds Finish back here, before minutes of
   * rendering, rather than refusing at upload. The server refuses too (`cart_full`); this
   * is the early, friendlier copy of that rule, read from what the stores already hold.
   */
  const stripsInCart = useCartStore((state) =>
    state.items.reduce((n, item) => n + (item.paid ? 0 : 1), 0)
  )
  const scrapbooksInCart = useScrapbookStore((state) =>
    state.shelf.reduce((n, item) => n + (item.state === 'finished' ? 1 : 0), 0)
  )
  const cartFull = stripsInCart + scrapbooksInCart >= env.stripMaxItems

  /** Put a strip in a place, the same way from the side column and the phone's pop-up. */
  const pickStrip = useCallback(
    (slot: { id: string; layout: '4x1' | '2x2' }, strip: StoredStrip) => {
      placeStrip(slot.id, strip)
      trackEvents(ANALYTICS_EVENTS.SCRAPBOOK_STRIP_PLACED, { layout: slot.layout })
    },
    [placeStrip]
  )

  const startFinish = useCallback(async () => {
    setConfirmFinish(false)
    // The button is disabled while places are empty; this is the same rule for any other way
    // in. The server doesn't check it — it knows slot ids by shape only, not the template.
    if (emptyPlaces > 0 || cartFull) return
    setSelection(null)
    const outcome = await finish()
    if (outcome === 'done') {
      // Finished means it's waiting in the cart, where it's paid for (2026-10-17).
      toast.success(t('scrapbook.finish.done'))
      navigate(ROUTES.cart)
    } else if (outcome === 'cancelled') toast.info(t(FINISH_MESSAGES[outcome]))
    else toast.error(t(FINISH_MESSAGES[outcome]))
  }, [finish, t, emptyPlaces, cartFull, navigate])

  if (openStatus === 'error') {
    return (
      <div className={styles.state}>
        <TriangleAlert className={styles.stateIcon} />
        <span className={styles.stateText}>{t('scrapbook.editor.loadError')}</span>
        <Link to={ROUTES.scrapbook} className={styles.stateLink}>
          {t('scrapbook.editor.back')}
        </Link>
      </div>
    )
  }

  if (!scrapbook || !current) {
    return (
      <div className={styles.state}>
        <Loader2 className={styles.stateSpinner} />
        <span className={styles.stateText}>{t('scrapbook.editor.loading')}</span>
      </div>
    )
  }

  if (!template || !page) {
    return (
      <div className={styles.state}>
        <TriangleAlert className={styles.stateIcon} />
        <span className={styles.stateText}>{t('scrapbook.editor.unsupported')}</span>
        <Link to={ROUTES.scrapbook} className={styles.stateLink}>
          {t('scrapbook.editor.back')}
        </Link>
      </div>
    )
  }

  const paid = scrapbook.state === 'paid'
  const total = template.pages.length
  const label = pageLabel(page, pageIndex, t)
  const placesTotal = template.pages.reduce((n, item) => n + item.strips.length, 0)
  const placed = placesTotal - emptyPlaces
  const ready = emptyPlaces === 0
  const finishing = draft && (progress !== null || otherTabFinishing)
  const canFinish = editing && ready && !cartFull
  const saveLabel = t(
    {
      saved: 'scrapbook.editor.saved',
      pending: 'scrapbook.editor.pending',
      saving: 'scrapbook.editor.saving',
      error: 'scrapbook.editor.saveError',
    }[saveState]
  )
  const pickInPlace = (strip: StoredStrip) => stripSlot && pickStrip(stripSlot, strip)
  const clearPlace = () => stripSlot && placeStrip(stripSlot.id, null)

  /** Write into a text place. The scrapbook's name (shelf, PDF file name) follows its cover
   * title until the user names it something else — otherwise a book whose cover reads "Our
   * Bali Weekend" sits on the shelf as "Untitled". */
  const writeText = (value: string) => {
    if (!textSlot) return
    if (textSlot.placeholder === 'coverTitle') {
      const before = asName(scrapbook.content.texts[textSlot.id] ?? '')
      if (!scrapbook.title || scrapbook.title === before) setTitle(asName(value))
    }
    setText(textSlot.id, value)
  }

  const titleField = (className: string) =>
    editing ? (
      <input
        value={scrapbook.title}
        maxLength={TITLE_MAX_LENGTH}
        aria-label={t('scrapbook.editor.titleLabel')}
        placeholder={t('scrapbook.editor.titlePlaceholder')}
        className={className}
        onChange={(event) => setTitle(event.target.value)}
      />
    ) : null

  const progressLabel = (
    <span className={styles.progressPlaced}>
      {t('scrapbook.editor.placed', { filled: placed, total: placesTotal })}
    </span>
  )
  const progressBar = (
    <span className={styles.progressTrack}>
      <span
        className={cn(styles.progressFill, ready && styles.progressFillReady)}
        style={{ width: `${placesTotal ? (placed / placesTotal) * 100 : 100}%` }}
      />
    </span>
  )
  // Ready but the cart has no room: the one thing still standing between here and Finish.
  const cartFullLink = (
    <Link to={ROUTES.cart} className={styles.cartFull}>
      {t('scrapbook.finish.cartFullHint')}
    </Link>
  )

  const progressText = (stage: NonNullable<typeof progress> | null) =>
    !stage
      ? t('scrapbook.finish.otherTab')
      : stage.stage === 'rendering'
        ? t('scrapbook.finish.rendering', { page: stage.page, total: stage.total })
        : t(`scrapbook.finish.${stage.stage}`)

  const finishProgress = (
    <div className={styles.finishing} role="status">
      <Loader2 className={styles.finishingSpinner} aria-hidden="true" />
      <p className={styles.finishingText}>{progressText(progress)}</p>
      {progress && progress.stage !== 'uploading' && (
        <button type="button" className={styles.finishingStop} onClick={cancel}>
          {t('scrapbook.finish.stop')}
        </button>
      )}
    </div>
  )

  const menuItems: EditorMenuItem[] = draft
    ? [
        // The phone's Finish: off until every strip place is filled, as the progress row
        // above the page says.
        {
          label: t('scrapbook.finish.button'),
          disabled: !canFinish,
          onSelect: () => setConfirmFinish(true),
        },
        {
          label: t('scrapbook.viewer.delete'),
          danger: true,
          disabled: !editing,
          onSelect: () => setConfirmDiscard(true),
        },
      ]
    : [
        ...(paid
          ? []
          : [
              {
                label: t('scrapbook.viewer.keepEditing'),
                disabled: busy !== null,
                onSelect: () => void keepEditing(),
              },
            ]),
        {
          label: t(paid ? 'scrapbook.viewer.remove' : 'scrapbook.viewer.delete'),
          danger: true,
          disabled: busy !== null,
          onSelect: () => setConfirmDiscard(true),
        },
      ]

  const panelHead = (eyebrow: string, title: string) => (
    <div className={styles.panelHead}>
      <div className={styles.panelHeading}>
        <span className={styles.panelEyebrow}>{eyebrow}</span>
        <h2 className={styles.panelTitle}>{title}</h2>
      </div>
      <button type="button" className={styles.panelDone} onClick={() => setSelection(null)}>
        {t('scrapbook.editor.close')}
      </button>
    </div>
  )

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        {/* Desktop: name and state on the left; progress, Delete and Finish on the right. */}
        <div className={styles.headWide}>
          <div className={styles.headStart}>
            <Link
              to={ROUTES.scrapbook}
              className={styles.iconButton}
              aria-label={t('scrapbook.editor.back')}
              title={t('scrapbook.editor.back')}
            >
              <ArrowLeft />
            </Link>
            <div className={styles.headText}>
              <div className={styles.titleRow}>
                {titleField(styles.titleInput) ?? (
                  <h1 className={styles.title}>
                    {scrapbook.title || t('scrapbook.shelf.untitled')}
                  </h1>
                )}
                <span className={cn(styles.tape, styles[`tape_${scrapbook.state}`])}>
                  {t(`scrapbook.states.${scrapbook.state}`)}
                </span>
              </div>
              <span className={styles.headMeta}>
                {t('scrapbook.editor.meta', {
                  template: t(`scrapbook.templates.${template.label}`),
                  pages: t('scrapbook.picker.pages', { count: total }),
                })}
                {draft && (
                  <>
                    {' · '}
                    <span className={cn(saveState === 'error' && styles.saveError)} role="status">
                      {saveLabel}
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>

          {draft && (
            <div className={styles.headEnd}>
              <div className={styles.progress}>
                <div className={styles.progressRow}>
                  {progressLabel}
                  {!ready ? (
                    <span className={styles.progressLeft}>
                      {t('scrapbook.editor.left', { count: emptyPlaces })}
                    </span>
                  ) : cartFull ? (
                    cartFullLink
                  ) : (
                    <span className={styles.progressLeft}>{t('scrapbook.editor.ready')}</span>
                  )}
                </div>
                {progressBar}
              </div>
              <button
                type="button"
                className={styles.deleteButton}
                aria-label={t('scrapbook.viewer.delete')}
                title={t('scrapbook.viewer.delete')}
                disabled={!editing}
                onClick={() => setConfirmDiscard(true)}
              >
                <Trash2 />
              </button>
              <button
                type="button"
                className={styles.finishButton}
                disabled={!canFinish}
                title={!ready ? t('scrapbook.finish.fillAll') : undefined}
                onClick={() => setConfirmFinish(true)}
              >
                <BookCheck />
                {t('scrapbook.finish.button')}
              </button>
            </div>
          )}
        </div>

        {/* Phone: back, the name centred over its state, and the rest behind "…". */}
        <div className={styles.headNarrow}>
          <Link
            to={ROUTES.scrapbook}
            className={styles.iconButtonBare}
            aria-label={t('scrapbook.editor.back')}
          >
            <ArrowLeft />
          </Link>
          <div className={styles.narrowText}>
            {titleField(styles.narrowTitleInput) ?? (
              <h1 className={styles.narrowTitle}>
                {scrapbook.title || t('scrapbook.shelf.untitled')}
              </h1>
            )}
            <span
              className={cn(styles.narrowMeta, saveState === 'error' && draft && styles.saveError)}
            >
              {t(`scrapbook.states.${scrapbook.state}`)}
              {draft && ` · ${saveLabel}`}
            </span>
          </div>
          <EditorMenu items={menuItems} />
        </div>
      </header>

      {draft && (
        <div className={styles.narrowProgress}>
          {progressBar}
          {ready && cartFull ? cartFullLink : progressLabel}
        </div>
      )}

      <div className={styles.body}>
        <PageRail
          template={template}
          content={scrapbook.content}
          strips={current.strips}
          missing={missing}
          current={pageIndex}
          onSelect={goToPage}
          emptyByPage={editing ? emptyByPage : undefined}
        />

        <div className={styles.stage}>
          <button
            type="button"
            className={cn(styles.arrow, styles.stageArrow)}
            aria-label={t('scrapbook.editor.previous')}
            disabled={pageIndex === 0}
            onClick={() => goToPage(pageIndex - 1)}
          >
            <ChevronLeft />
          </button>
          <div className={styles.stageCenter}>
            {/* A tap on the paper itself (not a place) puts the panel back to the checklist. */}
            <div
              className={styles.pageArea}
              onClick={(event) => {
                if (!(event.target as HTMLElement).closest('button')) setSelection(null)
              }}
            >
              <div
                className={styles.pageFit}
                style={{ ['--page-aspect' as string]: template.aspect }}
              >
                <ScrapbookPageView
                  template={template}
                  page={page}
                  content={scrapbook.content}
                  strips={current.strips}
                  missing={missing}
                  mode={editing ? 'edit' : 'view'}
                  selected={editing ? selection : null}
                  onSelect={editing ? setSelection : undefined}
                />
              </div>
            </div>
            <span className={styles.caption}>
              <strong>{label}</strong> · {t('scrapbook.editor.page', { n: pageIndex + 1, total })}
            </span>
          </div>
          <button
            type="button"
            className={cn(styles.arrow, styles.stageArrow)}
            aria-label={t('scrapbook.editor.next')}
            disabled={pageIndex === total - 1}
            onClick={() => goToPage(pageIndex + 1)}
          >
            <ChevronRight />
          </button>
        </div>

        {/* The side panel follows what's picked: the page's checklist, the strip tray, or
            the text field; a finished or paid book's actions otherwise. Desktop only — a
            phone opens the same pieces in `EditorSheet`, and mounting both would have two
            text fields competing for focus. */}
        {desktop && (
          <aside className={styles.panel}>
            {finishing ? (
              finishProgress
            ) : draft && stripSlot ? (
              <div className={styles.panelSection}>
                {panelHead(
                  t('scrapbook.editor.stripPlace', { page: label }),
                  t(`scrapbook.tray.title_${stripSlot.layout}`)
                )}
                <StripTray
                  layout={stripSlot.layout}
                  currentStripId={scrapbook.content.strips[stripSlot.id]}
                  usedStripIds={usedElsewhere}
                  onPick={pickInPlace}
                  onClear={clearPlace}
                  variant="panel"
                />
              </div>
            ) : draft && textSlot ? (
              <div className={styles.panelSection}>
                {panelHead(
                  t('scrapbook.editor.textPlace', { page: label }),
                  t(`scrapbook.text.label_${textSlot.placeholder}`)
                )}
                <TextPanel
                  slot={textSlot}
                  value={scrapbook.content.texts[textSlot.id] ?? ''}
                  onChange={writeText}
                />
              </div>
            ) : draft ? (
              <PageChecklist
                page={page}
                label={label}
                content={scrapbook.content}
                strips={current.strips}
                missing={missing}
                onSelect={(next) => editing && setSelection(next)}
              />
            ) : (
              <ViewerPanel
                scrapbook={scrapbook}
                busy={busy !== null}
                onKeepEditing={() => void keepEditing()}
                onDiscard={() => setConfirmDiscard(true)}
              />
            )}
          </aside>
        )}
      </div>

      {/* Phone: the pager, centred under the page. Finish lives in the header's "…"; a
          finished or paid book keeps its one action at the side. */}
      <div className={styles.bottomBar}>
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.arrow}
            aria-label={t('scrapbook.editor.previous')}
            disabled={pageIndex === 0}
            onClick={() => goToPage(pageIndex - 1)}
          >
            <ChevronLeft />
          </button>
          <span className={styles.pagerLabel}>
            {label}
            <span className={styles.pagerCount}>
              {t('scrapbook.editor.page', { n: pageIndex + 1, total })}
            </span>
          </span>
          <button
            type="button"
            className={styles.arrow}
            aria-label={t('scrapbook.editor.next')}
            disabled={pageIndex === total - 1}
            onClick={() => goToPage(pageIndex + 1)}
          >
            <ChevronRight />
          </button>
        </div>
        {!draft && (
          <div className={styles.barEnd}>
            <NarrowViewerAction scrapbook={scrapbook} />
          </div>
        )}
      </div>

      {!desktop &&
        (finishing ? (
          <EditorSheet title={t('scrapbook.finish.button')}>{finishProgress}</EditorSheet>
        ) : editing && stripSlot ? (
          <EditorSheet
            title={t(`scrapbook.tray.title_${stripSlot.layout}`)}
            onClose={() => setSelection(null)}
          >
            <StripTray
              layout={stripSlot.layout}
              currentStripId={scrapbook.content.strips[stripSlot.id]}
              usedStripIds={usedElsewhere}
              onPick={(strip) => {
                pickInPlace(strip)
                setSelection(null)
              }}
              onClear={() => {
                clearPlace()
                setSelection(null)
              }}
              variant="sheet"
            />
          </EditorSheet>
        ) : editing && textSlot ? (
          <EditorSheet
            title={t(`scrapbook.text.label_${textSlot.placeholder}`)}
            onClose={() => setSelection(null)}
          >
            <TextPanel
              slot={textSlot}
              value={scrapbook.content.texts[textSlot.id] ?? ''}
              onChange={writeText}
            />
          </EditorSheet>
        ) : null)}

      <ConfirmDialog
        open={confirmFinish}
        title={t('scrapbook.finish.confirmTitle')}
        description={t('scrapbook.finish.confirmDescription')}
        confirmLabel={t('scrapbook.finish.confirm')}
        cancelLabel={t('scrapbook.finish.cancel')}
        onConfirm={() => void startFinish()}
        onCancel={() => setConfirmFinish(false)}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title={t(paid ? 'scrapbook.discard.removeTitle' : 'scrapbook.discard.deleteTitle')}
        description={t(
          paid ? 'scrapbook.discard.removeDescription' : 'scrapbook.discard.deleteDescription'
        )}
        confirmLabel={
          busy === 'discard'
            ? t('scrapbook.discard.working')
            : t(paid ? 'scrapbook.discard.confirmRemove' : 'scrapbook.discard.confirmDelete')
        }
        cancelLabel={t('scrapbook.discard.cancel')}
        destructive
        confirmDisabled={busy === 'discard'}
        onConfirm={() => void confirmDiscardThis()}
        onCancel={() => busy !== 'discard' && setConfirmDiscard(false)}
      />
    </div>
  )
}

/** The phone bottom bar's action once a book is finished: the cart, or its PDF. */
function NarrowViewerAction({ scrapbook }: { scrapbook: Scrapbook }) {
  const { t } = useTranslation()
  const { download, downloading } = useScrapbookDownload(scrapbook)

  if (scrapbook.state !== 'paid') {
    return (
      <Link to={ROUTES.cart} className={styles.primaryNarrow}>
        {t('scrapbook.viewer.goToCart')}
      </Link>
    )
  }
  return (
    <button
      type="button"
      className={styles.primaryNarrow}
      disabled={downloading}
      onClick={() => void download()}
    >
      {downloading && <Loader2 className={styles.spin} />}
      {t(downloading ? 'scrapbook.viewer.downloading' : 'scrapbook.viewer.downloadShort')}
    </button>
  )
}
