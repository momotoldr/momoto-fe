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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROUTES } from '@/constants/routes'
import { PageRail } from '@/features/scrapbook/PageRail'
import { pageLabel } from '@/features/scrapbook/pageLabel'
import { ScrapbookPageView, type ScrapbookSelection } from '@/features/scrapbook/ScrapbookPageView'
import { StripPickerModal } from '@/features/scrapbook/StripPickerModal'
import { StripTray } from '@/features/scrapbook/StripTray'
import { TextPanel } from '@/features/scrapbook/TextPanel'
import { useDesktopLayout } from '@/features/scrapbook/useDesktopLayout'
import { useScrapbookFinish, type FinishOutcome } from '@/features/scrapbook/useScrapbookFinish'
import { ViewerPanel } from '@/features/scrapbook/ViewerPanel'
import { cn } from '@/lib/utils'
import { useScrapbookStore } from '@/store/useScrapbookStore'
import type { StoredStrip } from '@/types/stripType'

import styles from './ScrapbookPage.module.scss'

/** The scrapbook name's limit, matching the server's. */
const TITLE_MAX_LENGTH = 80

/** The cover title as a one-line scrapbook name. */
const asName = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX_LENGTH)

/**
 * One scrapbook: the editor while it's a draft, a read-only viewer once it's finished or
 * paid (docs/PLAN-scrapbook.md §6). One route and one layout for all three states — the
 * page rail, the page, and a side column that holds the strip tray or the text field while
 * editing, and the scrapbook's actions otherwise.
 *
 * Finishing renders the PDF in this tab (`useScrapbookFinish`); unlocking, paying and
 * downloading live in `ViewerPanel`.
 */

/** What to tell the user once a finish ends, other than success. */
const FINISH_MESSAGES: Record<Exclude<FinishOutcome, 'done'>, string> = {
  cancelled: 'scrapbook.finish.cancelled',
  changed: 'scrapbook.finish.changed',
  unsaved: 'scrapbook.finish.unsaved',
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
  const duplicate = useScrapbookStore((state) => state.duplicate)
  const discard = useScrapbookStore((state) => state.discard)
  const frozen = useScrapbookStore((state) => state.frozen)

  const [pageIndex, setPageIndex] = useState(0)
  const [selection, setSelection] = useState<ScrapbookSelection | null>(null)
  const [busy, setBusy] = useState<'reopen' | 'duplicate' | 'discard' | null>(null)
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

  const duplicateThis = useCallback(async () => {
    if (!scrapbook) return
    setBusy('duplicate')
    const result = await duplicate(scrapbook.id)
    setBusy(null)
    if (result.ok) {
      trackEvents(ANALYTICS_EVENTS.SCRAPBOOK_CREATED, { from: 'duplicate' })
      toast.success(t('scrapbook.viewer.duplicated'))
      navigate(ROUTES.scrapbookEdit.replace(':scrapbookId', result.scrapbook.id))
    } else {
      toast.error(
        result.reason === 'limit'
          ? t('scrapbook.shelf.limit', { limit: useScrapbookStore.getState().quota?.limit ?? 0 })
          : t('scrapbook.shelf.createError')
      )
    }
  }, [scrapbook, duplicate, navigate, t])

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
    if (emptyPlaces > 0) return
    setSelection(null)
    const outcome = await finish()
    if (outcome === 'done') toast.success(t('scrapbook.finish.done'))
    else if (outcome === 'cancelled') toast.info(t(FINISH_MESSAGES[outcome]))
    else toast.error(t(FINISH_MESSAGES[outcome]))
  }, [finish, t, emptyPlaces])

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
  // On a phone the side column is a sheet: open while a slot is picked, and while a finish
  // runs so its progress (and Cancel) stays in view.
  // A strip place on a phone opens the picker pop-up instead, so only text uses the sheet.
  const sheetOpen = draft && (selection?.kind === 'text' || progress !== null || otherTabFinishing)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link to={ROUTES.scrapbook} className={styles.back}>
          <ArrowLeft aria-hidden="true" />
          <span>{t('scrapbook.editor.back')}</span>
        </Link>

        <div className={styles.titleRow}>
          {editing ? (
            <Input
              value={scrapbook.title}
              maxLength={TITLE_MAX_LENGTH}
              aria-label={t('scrapbook.editor.titleLabel')}
              placeholder={t('scrapbook.editor.titlePlaceholder')}
              className={styles.titleInput}
              onChange={(event) => setTitle(event.target.value)}
            />
          ) : (
            <h1 className={styles.title}>{scrapbook.title || t('scrapbook.shelf.untitled')}</h1>
          )}
          <span className={cn(styles.tape, styles[`tape_${scrapbook.state}`])}>
            {t(`scrapbook.states.${scrapbook.state}`)}
          </span>
        </div>

        {draft && (
          <div className={styles.headActions}>
            <span
              className={cn(styles.saveState, saveState === 'error' && styles.saveStateError)}
              role="status"
            >
              {t(
                {
                  saved: 'scrapbook.editor.saved',
                  pending: 'scrapbook.editor.pending',
                  saving: 'scrapbook.editor.saving',
                  error: 'scrapbook.editor.saveError',
                }[saveState]
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('scrapbook.viewer.delete')}
              disabled={!editing}
              onClick={() => setConfirmDiscard(true)}
            >
              <Trash2 />
            </Button>
            {editing && emptyPlaces > 0 && (
              <span className={styles.placesLeft}>
                {t('scrapbook.finish.placesLeft', { count: emptyPlaces })}
              </span>
            )}
            <Button
              disabled={!editing || emptyPlaces > 0}
              title={emptyPlaces > 0 ? t('scrapbook.finish.fillAll') : undefined}
              onClick={() => setConfirmFinish(true)}
            >
              <BookCheck />
              {t('scrapbook.finish.button')}
            </Button>
          </div>
        )}
      </header>

      <div className={styles.body}>
        <PageRail
          template={template}
          content={scrapbook.content}
          strips={current.strips}
          missing={missing}
          current={pageIndex}
          onSelect={goToPage}
        />

        <div className={styles.stage}>
          <div className={styles.pageWrap} style={{ ['--page-aspect' as string]: template.aspect }}>
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

          <div className={styles.pager}>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('scrapbook.editor.previous')}
              disabled={pageIndex === 0}
              onClick={() => goToPage(pageIndex - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className={styles.pagerLabel}>
              {pageLabel(page, pageIndex, t)}
              <span className={styles.pagerCount}>
                {t('scrapbook.editor.page', { n: pageIndex + 1, total })}
              </span>
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('scrapbook.editor.next')}
              disabled={pageIndex === total - 1}
              onClick={() => goToPage(pageIndex + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        <aside
          className={cn(styles.side, sheetOpen && styles.sideOpen, !draft && styles.sideViewer)}
        >
          {draft && (progress || otherTabFinishing) ? (
            <div className={styles.progress} role="status">
              <Loader2 className={styles.progressSpinner} aria-hidden="true" />
              <p className={styles.progressText}>
                {!progress
                  ? t('scrapbook.finish.otherTab')
                  : progress.stage === 'rendering'
                    ? t('scrapbook.finish.rendering', {
                        page: progress.page,
                        total: progress.total,
                      })
                    : t(`scrapbook.finish.${progress.stage}`)}
              </p>
              {progress && progress.stage !== 'uploading' && (
                <Button variant="outline" size="sm" onClick={cancel}>
                  {t('scrapbook.finish.stop')}
                </Button>
              )}
            </div>
          ) : draft ? (
            <>
              {stripSlot && desktop ? (
                <StripTray
                  layout={stripSlot.layout}
                  currentStripId={scrapbook.content.strips[stripSlot.id]}
                  onPick={(strip) => pickStrip(stripSlot, strip)}
                  onClear={() => placeStrip(stripSlot.id, null)}
                />
              ) : textSlot ? (
                <TextPanel
                  slot={textSlot}
                  value={scrapbook.content.texts[textSlot.id] ?? ''}
                  onChange={(value) => {
                    // The scrapbook's name (shelf, PDF file name) follows its cover title
                    // until the user names it something else — otherwise a book whose
                    // cover reads "Our Bali Weekend" sits on the shelf as "Untitled".
                    if (textSlot.placeholder === 'coverTitle') {
                      const before = asName(scrapbook.content.texts[textSlot.id] ?? '')
                      if (!scrapbook.title || scrapbook.title === before) setTitle(asName(value))
                    }
                    setText(textSlot.id, value)
                  }}
                />
              ) : (
                <p className={styles.hint}>{t('scrapbook.editor.hint')}</p>
              )}
              {selection && (
                <Button
                  variant="secondary"
                  className={styles.done}
                  onClick={() => setSelection(null)}
                >
                  {t('scrapbook.editor.close')}
                </Button>
              )}
            </>
          ) : (
            <ViewerPanel
              scrapbook={scrapbook}
              busy={busy !== null}
              onKeepEditing={() => void keepEditing()}
              onDuplicate={() => void duplicateThis()}
              onDiscard={() => setConfirmDiscard(true)}
            />
          )}
        </aside>
      </div>

      {stripSlot && (
        <StripPickerModal
          open={!desktop && editing}
          layout={stripSlot.layout}
          currentStripId={scrapbook.content.strips[stripSlot.id]}
          onPick={(strip) => {
            pickStrip(stripSlot, strip)
            setSelection(null)
          }}
          onClear={() => {
            placeStrip(stripSlot.id, null)
            setSelection(null)
          }}
          onClose={() => setSelection(null)}
        />
      )}

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
