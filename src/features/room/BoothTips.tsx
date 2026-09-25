import {
  Copy,
  Download,
  GripVertical,
  LayoutTemplate,
  Lightbulb,
  Lock,
  LogIn,
  Palette,
  Play,
  RefreshCw,
  Rows3,
  Sparkles,
  Timer,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { env } from '@/env'
import { Button } from '@/components/ui/button'
import type { BoothStage } from '@/constants/boothTips'
import { useTipsStore } from '@/store/useTipsStore'

import styles from './BoothTips.module.scss'
import type { SessionMode } from '@/types/roomsType'

/**
 * What each screen's advice is made of: an icon and the slug its copy lives under
 * (`tips.<stage>.items.<slug>`). Order is the order they're read in — first thing to
 * do first — so it isn't alphabetical by accident.
 */
const STAGE_TIPS: Record<BoothStage, { icon: LucideIcon; slug: string }[]> = {
  lobby: [
    { icon: Copy, slug: 'share' },
    { icon: Timer, slug: 'clock' },
    { icon: Video, slug: 'camera' },
  ],
  booth: [
    { icon: LayoutTemplate, slug: 'template' },
    { icon: Rows3, slug: 'preview' },
    { icon: Play, slug: 'start' },
    { icon: Sparkles, slug: 'pose' },
  ],
  arrange: [
    { icon: GripVertical, slug: 'reorder' },
    { icon: RefreshCw, slug: 'retake' },
    { icon: Palette, slug: 'style' },
    { icon: Lock, slug: 'final' },
  ],
  result: [
    { icon: Download, slug: 'download' },
    { icon: Sparkles, slug: 'watermark' },
    { icon: LogIn, slug: 'guest' },
    { icon: Video, slug: 'live' },
  ],
}

/**
 * The height of a piece of the app's fixed chrome, kept up to date, or zero when it
 * isn't on this screen. The card has to fit between two of them:
 *
 * - `[data-booth-actions]`, the booth's own controls pinned to the bottom of a phone.
 *   They carry Start (and later Create), which would be a poor thing to cover. On a
 *   desktop the bar is `display: none` and this measures zero — no media query needed
 *   on our side.
 * - `[data-app-bar]`, the sticky bar across the top. It outranks the card, so without
 *   a cap a tall card simply slides under it and loses its heading.
 *
 * Both move under us — the start button becomes a progress readout mid-capture, and a
 * phone's safe-area inset changes as its browser chrome slides away — hence the
 * observer rather than a single measurement.
 */
function useChromeHeight(selector: string, active: boolean): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (!active) return
    const element = document.querySelector(selector)
    if (!element) {
      setHeight(0)
      return
    }
    const measure = () => setHeight(element.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    // The observer alone isn't enough: the booth's action bar is hidden outright at
    // the wide layout, and an element that stops being rendered reports no resize at
    // all — so rotating a phone (or dragging a window across the breakpoint) would
    // leave the card holding a gap for a bar that is no longer there.
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [selector, active])

  return height
}

/**
 * The booth's coach. A card of "what do I do here" for the screen currently on show,
 * which pops itself open the first time someone reaches each stage and can be called
 * back any time from the room bar's help button.
 *
 * Deliberately *not* a modal: a session runs on a five-minute clock, both cameras are
 * live, and the tips describe controls that are right there on the page — so the card
 * sits in a corner and leaves everything behind it working, rather than holding the
 * booth still until someone dismisses it.
 *
 * Mounted once by `RoomPage` rather than per screen, so it survives the moves between
 * lobby → booth → arrange → result and can follow along instead of being re-created.
 *
 * A few lines don't hold outside a room of two — solo has no host to wait for and no
 * second camera, and a group has no moment where "they're here" means everyone. Those
 * carry a `_solo` or `_group` variant that wins for that mode; every other line is
 * shared, so a mode only overrides what actually differs.
 */
export function BoothTips({ mode }: { mode: SessionMode }) {
  const { t } = useTranslation()
  const stage = useTipsStore((state) => state.stage)
  const open = useTipsStore((state) => state.open)
  const closeTips = useTipsStore((state) => state.closeTips)
  const muted = useTipsStore((state) => state.muted)
  const setMuted = useTipsStore((state) => state.setMuted)

  const showing = open && stage !== null
  const actionBarHeight = useChromeHeight('[data-booth-actions]', showing)
  const appBarHeight = useChromeHeight('[data-app-bar]', showing)
  const cardRef = useRef<HTMLElement>(null)

  // Prefer a line worded for this mode where one exists, and fall back to the shared
  // copy (i18next takes the first key that resolves) everywhere else. With backdrops on,
  // a `_backdrop` wording (one that mentions the Background tab) beats both.
  const line = (key: string) => {
    const keys = mode === 'date' ? [key] : [`${key}_${mode}`, key]
    return t(env.backdropsEnabled ? [`${key}_backdrop`, ...keys] : keys)
  }

  // Escape closes it, as it would any dismissible panel — and so does reaching for
  // anything else on the page. The booth is a dense workspace and the card has to park
  // somewhere, so on the arrange screen it clips the edge of the strip; getting out of
  // the way the moment someone goes to use what's underneath costs them one click
  // instead of leaving them to hunt for the X.
  //
  // Nothing else is taken from the page: no backdrop, no scroll lock, and focus stays
  // where the person put it — a card that appears on its own has no business stealing
  // the keyboard.
  useEffect(() => {
    if (!showing) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTips()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (cardRef.current?.contains(target)) return
      // The room bar's help button opens this card; letting the outside-click close it
      // first would make the button do nothing at all.
      if (target instanceof Element && target.closest('[data-booth-tips-trigger]')) return
      closeTips()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [showing, closeTips])

  if (!showing) return null

  return createPortal(
    <aside
      ref={cardRef}
      role="region"
      aria-live="polite"
      aria-labelledby="booth-tips-title"
      className={styles.card}
      style={{
        // Clears the phone's pinned action bar; zero on a desktop, where nothing is
        // pinned and the card simply sits in the bottom-left corner.
        bottom: `calc(${actionBarHeight}px + var(--booth-tips-gap))`,
        // ...and stops short of the sticky app bar at the top, so a long stage's tips
        // scroll inside the card instead of growing up behind it. `dvh` rather than
        // `vh` because a phone's browser chrome comes and goes; where it isn't
        // understood the declaration is dropped and the stylesheet's cap stands in.
        maxHeight: `calc(100dvh - ${actionBarHeight}px - ${appBarHeight}px - var(--booth-tips-gap) * 2)`,
      }}
    >
      <button
        type="button"
        className={styles.close}
        onClick={closeTips}
        aria-label={t('common.close')}
      >
        <X />
      </button>

      <div className={styles.body}>
        <div className={styles.head}>
          <span className={styles.badge}>
            <Lightbulb />
          </span>
          <div>
            <p className={styles.eyebrow}>{t('tips.eyebrow')}</p>
            <h2 id="booth-tips-title" className={styles.title}>
              {line(`tips.${stage}.title`)}
            </h2>
          </div>
        </div>

        <p className={styles.lead}>{line(`tips.${stage}.lead`)}</p>

        <ol className={styles.list}>
          {STAGE_TIPS[stage].map(({ icon: Icon, slug }, index) => (
            <li key={slug} className={styles.item}>
              <span className={styles.itemIcon} aria-hidden="true">
                <Icon />
              </span>
              <div className={styles.itemBody}>
                <p className={styles.itemTitle}>
                  <span className={styles.itemIndex}>{index + 1}</span>
                  {line(`tips.${stage}.items.${slug}.title`)}
                </p>
                <p className={styles.itemText}>{line(`tips.${stage}.items.${slug}.text`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.actions}>
        {/* A checkbox rather than a "don't show again" button, so the setting can be
         * read as well as written: someone who turned the tips off months ago and has
         * come back wondering where they went finds it ticked here, and can untick it.
         * Ticking only records the preference — the card stays put until it's
         * dismissed, so a mis-click isn't the end of the tips you were reading. */}
        <label className={styles.mute}>
          <input
            type="checkbox"
            className={styles.muteBox}
            checked={muted}
            onChange={(event) => setMuted(event.target.checked)}
          />
          <span>{t('tips.mute')}</span>
        </label>
        <Button size="sm" onClick={closeTips}>
          {t('tips.gotIt')}
        </Button>
      </div>
    </aside>,
    document.body
  )
}
