import { Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { PHOTO_FILTERS, PHOTO_FILTER_MAP } from '@/constants/filters'
import { STICKERS } from '@/constants/stickers'
import {
  STRIP_TEMPLATES,
  STRIP_TEMPLATE_MAP,
  slotAspect,
  slotRadius,
} from '@/constants/stripTemplates'
import { cn } from '@/lib/utils'
import { usePhotosStore } from '@/store/usePhotosStore'
import { useRoomStore } from '@/store/useRoomStore'
import { useStripStore } from '@/store/useStripStore'

import { StickerOverlay } from './StickerOverlay'
import styles from './StripSelector.module.scss'

interface StripSelectorProps {
  /** Discard all shots and re-run the capture sequence. */
  onRetake: () => void
  /**
   * Why re-shooting is on hold (already localized), or null when it isn't. The cause
   * lives in `CameraStage`: the friend is out of the room, or this end is offline.
   */
  /** Why neither retake can be used right now, or null. */
  blockedReason: string | null
  /**
   * Why a *single slot* can't be re-shot, or null. Broader than `blockedReason`: a room
   * that has gained someone can still start over (that's how the newcomer gets in), but
   * one cut re-taken among three would hold a different set of faces.
   */
  shotBlockedReason: string | null
  /** Re-shoot a single slot (synced to the guest in a live room). */
  onRetakeShot: (slot: number) => void
  /**
   * The slot whose retake has been asked for and hasn't started yet, or null. A retake
   * is a round trip through the server, so this is a real second of screen time in which
   * nothing has visibly happened — see `useCountdownSync`.
   */
  retakingSlot: number | null
}

/** The design sections left after capture. Desktop stacks both down the rail; a
 * phone shows one at a time behind a segmented control. The template is not among
 * them — it is chosen in the booth, so the shots can be framed against it. */
const TABS = ['filter', 'stickers'] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = {
  filter: 'select.tabFilter',
  stickers: 'select.tabStickers',
}

/**
 * Review step shown after the capture sequence: arrange the shots into the template's
 * fixed slots (drag to reorder), pick a filter, place stickers, then confirm.
 *
 * Two roles, split along a line that isn't "who is in charge" but "whose strip is it":
 *  - **Design** is everyone's, over their own shots. Each member's frames hold the room's
 *    cameras in their own order and only themselves mirrored, so a placement made against
 *    someone else's copy would land somewhere else on theirs — decorating what you can
 *    actually see is the only arrangement that can be right.
 *  - **Direction** is the host's: re-shooting a slot or the whole strip re-runs the
 *    countdown for the entire room, so it can't be everyone's to trigger.
 */
export function StripSelector({
  onRetake,
  onRetakeShot,
  blockedReason,
  shotBlockedReason,
  retakingSlot,
}: StripSelectorProps) {
  const { t } = useTranslation()
  const frames = usePhotosStore((state) => state.frames)
  const order = usePhotosStore((state) => state.order)
  const templateId = useStripStore((state) => state.templateId)
  const filter = useStripStore((state) => state.filter)
  const isHost = useRoomStore((state) => state.isHost)
  const peerCreated = useRoomStore((state) => state.createdPeers.length > 0)
  // Arranging, filtering and stickering are done on your own copy, so everyone may —
  // there is no flag for it. Re-shooting drags the whole room through another
  // countdown, so that one stays the host's call.
  const canDirect = isHost === true
  // Once a peer has finalized their strip, "Retake all" would reset them out of
  // it — so hide it entirely.
  const showRetakeAll = canDirect && !peerCreated
  // A hold is a different case from that: whatever caused it is expected to pass, so
  // the controls stay put and say why they can't be used, rather than vanishing from
  // under the host mid-session.
  const retakeBlocked = blockedReason !== null
  // A retake is already on its way. Every retake control on the strip is held until it
  // lands, not just the one that was pressed: a second press is a second broadcast, and
  // the room re-shoots whichever slot was named last — so pressing 1 and then 2 loses
  // the first press silently. "Retake all" is held with them, since it would throw away
  // the strip the pending shot is about to land in.
  const retakePending = retakingSlot !== null
  const template = STRIP_TEMPLATE_MAP[templateId] ?? STRIP_TEMPLATES[0]
  // Filter swatches carry a real cut, so they take the cut's shape. A portrait
  // swatch cover-cropped the sides off — barely readable in a date room, where the
  // frame holds two people side by side.
  const thumbAspect = slotAspect(template)
  const filterValue = PHOTO_FILTER_MAP[filter].value
  const previewFrame = frames[0]

  // Slots in strip order; fall back to capture order if the arrangement is unset.
  const slotOrder = order.length === frames.length ? order : frames.map((_, index) => index)

  // Index of the slot currently being dragged (for reorder-by-swap).
  const dragIndex = useRef<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Creating the strip is irreversible (no going back to re-arrange/retake), so
  // confirm the current setup first.
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Narrow-screen only: which design section is on show. Ignored from lg up, where
  // every section is visible at once.
  const [tab, setTab] = useState<Tab>('filter')
  /**
   * Which sticker's art has arrived, by id. The palette is 25 bundled SVGs fetched over
   * HTTP, and on a slow connection they land well after the buttons they belong to —
   * leaving a row of blank squares that look broken and get tapped anyway. Each button
   * waits for its own image rather than the palette waiting for all of them: the first
   * sticker through should be usable while the twenty-fifth is still coming.
   *
   * A failed load counts as arrived. The alternative is a button disabled for the rest
   * of the session over what, on this audience's connection, is usually a blip — and the
   * same URL is very often in cache by the time anyone places one.
   */
  const [stickerReady, setStickerReady] = useState<Record<string, boolean>>({})
  const markStickerReady = useCallback(
    (id: string) => setStickerReady((prev) => (prev[id] ? prev : { ...prev, [id]: true })),
    []
  )

  /**
   * One stable `ref` callback per sticker, built once.
   *
   * It has to be memoised. An inline `ref={(node) => …}` is a new function every render,
   * so React detaches and re-attaches it every time — running the `complete` check, and
   * with it a `setState`, on every render. React normally drops a same-value update, but
   * only while the fiber has no pending work; once this screen re-renders steadily from
   * outside (the session countdown ticking, peer tiles updating) each render schedules
   * another and the tree dies with "Maximum update depth exceeded" — React error #185,
   * seen on a phone right after capture, where those updates never stop.
   *
   * Keyed by sticker id, and `markStickerReady` is itself stable, so each callback runs
   * once per mount: exactly the cached-image case it exists for.
   */
  const stickerRefs = useMemo(() => {
    const refs = new Map<string, (node: HTMLImageElement | null) => void>()
    for (const option of STICKERS) {
      refs.set(option.id, (node) => {
        if (node?.complete) markStickerReady(option.id)
      })
    }
    return refs
  }, [markStickerReady])

  const onDragStart = (slot: number) => (event: React.DragEvent) => {
    dragIndex.current = slot
    setIsDragging(true)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(slot))
  }

  const onDragEnd = () => {
    dragIndex.current = null
    setIsDragging(false)
  }

  const allowDrop = (event: React.DragEvent) => event.preventDefault()

  const onDropSlot = (slot: number) => (event: React.DragEvent) => {
    event.preventDefault()
    const from = dragIndex.current
    if (from !== null) usePhotosStore.getState().swapSlots(from, slot)
    onDragEnd()
  }

  // The buttons are disabled while one is pending, so this is the backstop for the
  // press that lands in the same tick as the first.
  const retakeShot = (slot: number) => {
    if (retakePending) return
    onRetakeShot(slot)
  }

  const createStrip = () => {
    setConfirmOpen(false)
    if (frames.length === 0) return
    // Snapshot the current design so later live changes (a filter tried on after the
    // fact, a sticker nudged) can't alter this strip once it's created.
    usePhotosStore.getState().confirmSelection(
      slotOrder
        .map((index) => frames[index])
        .filter((frame): frame is (typeof frames)[number] => Boolean(frame)),
      {
        templateId,
        filter,
        stickers: useStripStore.getState().stickers.map((sticker) => ({ ...sticker })),
      }
    )
  }

  /** A rail section: always visible on desktop, tab-gated on a phone. */
  const sectionClass = (name: Tab) => cn(styles.section, tab !== name && styles.sectionInactive)

  return (
    <div className={styles.selector}>
      {/* The strip itself — the object being made, so it leads. */}
      <div className={styles.stripColumn}>
        <h2 className={styles.railLabel}>{t('select.stripLabel')}</h2>
        <div
          className={cn(styles.strip, isDragging && styles.stripDragging)}
          style={{
            aspectRatio: String(template.aspect),
            backgroundImage: `url("${template.src}")`,
          }}
          aria-label={t('select.stripAria')}
        >
          {slotOrder.map((frameIndex, slot) => {
            const frame = frames[frameIndex]
            const rect = template.slots[slot]
            // A restored draft's `order` is only length-checked, so a stale/out-of-range
            // index would make `frame` undefined — skip it rather than crash.
            if (!frame || !rect) return null
            return (
              <div
                key={frame.id}
                className={styles.slot}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                  borderRadius: slotRadius(rect, template.aspect),
                }}
                draggable
                onDragStart={onDragStart(slot)}
                onDragEnd={onDragEnd}
                onDragOver={allowDrop}
                onDrop={onDropSlot(slot)}
              >
                <span className={styles.slotNumber}>{slot + 1}</span>
                <img
                  src={frame.dataUrl}
                  alt={t('select.slotAlt', { index: slot + 1 })}
                  className={styles.slotImage}
                  style={{ filter: filterValue }}
                  draggable={false}
                />
                {canDirect &&
                  (() => {
                    const pendingHere = retakingSlot === slot
                    // The pending slot says what it is waiting on; the rest fall back to
                    // whatever is holding retakes generally.
                    const label = pendingHere
                      ? t('capture.retakingPhoto', { index: slot + 1 })
                      : (shotBlockedReason ?? t('select.retakeShot', { index: slot + 1 }))
                    return (
                      <button
                        type="button"
                        className={styles.retakeButton}
                        onClick={() => retakeShot(slot)}
                        disabled={shotBlockedReason !== null || retakePending}
                        aria-busy={pendingHere}
                        aria-label={label}
                        title={label}
                      >
                        {pendingHere ? <Loader2 className={styles.retakeSpinner} /> : <RotateCcw />}
                      </button>
                    )
                  })()}
              </div>
            )
          })}
          <StickerOverlay editable />
        </div>
        {/* Everyone may reorder; only the host's hint mentions the retake icon, which
         * is the one control on this strip a guest doesn't have. */}
        <p className={styles.stripHint}>
          {canDirect ? t('select.dragHint') : t('select.dragHintGuest')}
        </p>
      </div>

      {/* Design rail — template, filter, stickers, then the way out. */}
      <div className={styles.rail}>
        {/* Phone-only switch between the three sections; from lg they all show. */}
        <div className={styles.tabs} role="tablist" aria-label={t('select.title')}>
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={cn(styles.tab, tab === name && styles.tabActive)}
              onClick={() => setTab(name)}
            >
              {t(TAB_LABELS[name])}
            </button>
          ))}
        </div>

        <div
          className={sectionClass('filter')}
          role="radiogroup"
          aria-label={t('select.filterLabel')}
        >
          {/* Short label on screen, the fuller phrase for screen readers — the
           * rail's mono caps make a long label shout. */}
          <p className={cn(styles.railLabel, styles.sectionLabel)}>{t('select.tabFilter')}</p>
          <div className={styles.filterList}>
            {PHOTO_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={filter === option.id}
                className={cn(styles.filter, filter === option.id && styles.filterActive)}
                onClick={() => useStripStore.getState().setFilter(option.id)}
              >
                <span className={styles.filterThumb} style={{ aspectRatio: String(thumbAspect) }}>
                  {previewFrame ? (
                    <img
                      src={previewFrame.dataUrl}
                      alt=""
                      className={styles.filterImage}
                      style={{ filter: option.value }}
                      draggable={false}
                    />
                  ) : (
                    <span className={styles.filterSwatch} style={{ filter: option.value }} />
                  )}
                </span>
                <span className={styles.optionName}>{t(`filters.${option.label}`)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.divider} />

        <div className={sectionClass('stickers')} role="group" aria-label={t('stickers.label')}>
          <div className={styles.sectionHead}>
            <p className={cn(styles.railLabel, styles.sectionLabel)}>{t('select.tabStickers')}</p>
            <p className={styles.sectionTip}>{t('stickers.tipShort')}</p>
          </div>
          <div className={styles.stickerList}>
            {STICKERS.map((option) => {
              const ready = stickerReady[option.id] === true
              const name = t(`stickers.${option.label}`)
              return (
                <button
                  key={option.id}
                  type="button"
                  className={styles.stickerButton}
                  onClick={() => useStripStore.getState().addSticker(option.src)}
                  disabled={!ready}
                  aria-busy={!ready}
                  aria-label={name}
                  title={ready ? name : `${name} — ${t('common.loading')}`}
                >
                  <img
                    src={option.src}
                    alt=""
                    className={cn(styles.stickerThumb, !ready && styles.stickerThumbLoading)}
                    /* A cached image can finish before React attaches `onLoad`, which
                     * would leave the button disabled over art that is already here —
                     * so the mount checks `complete` as well. The callback is memoised
                     * per sticker; see `stickerRefs`. */
                    ref={stickerRefs.get(option.id)}
                    onLoad={() => markStickerReady(option.id)}
                    onError={() => markStickerReady(option.id)}
                  />
                  {!ready && <span className={styles.stickerSkeleton} aria-hidden />}
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.divider} />

        {/* `data-booth-actions`: pinned to the bottom of a phone's screen, so the
         * tips card measures it and sits above rather than over these buttons. */}
        <div className={styles.actions} data-booth-actions>
          <Button
            className={styles.createButton}
            onClick={() => setConfirmOpen(true)}
            disabled={frames.length === 0}
          >
            <Sparkles /> {t('select.create')}
          </Button>
          {showRetakeAll && (
            <Button
              variant="outline"
              className={styles.retakeAllButton}
              onClick={onRetake}
              disabled={retakeBlocked || retakePending}
            >
              <RotateCcw /> {t('select.retake')}
            </Button>
          )}
          {(blockedReason ?? shotBlockedReason) && (
            <span className={styles.actionsNote} role="status" aria-live="polite">
              {blockedReason ?? shotBlockedReason}
            </span>
          )}
          <span className={styles.actionsNote}>{t('select.createNote')}</span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('select.confirmTitle')}
        description={t('select.confirmDescription')}
        confirmLabel={t('select.confirmCreate')}
        cancelLabel={t('select.confirmCancel')}
        onConfirm={createStrip}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
