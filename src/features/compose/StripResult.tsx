import { Download, Loader2, Printer, RotateCcw, Share2, ShoppingBag } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { resolveBackdrop } from '@/constants/backdrops'
import { SHOT_COUNT } from '@/constants/capture'
import { ROUTES } from '@/constants/routes'
import { env } from '@/env'
import { useAuthStore } from '@/store/useAuthStore'
import { useCartStore } from '@/store/useCartStore'
import { usePhotosStore } from '@/store/usePhotosStore'
import { useRoomStore } from '@/store/useRoomStore'
import { resolveSessionMode } from '@/utils/rooms'
import { framesWithBackdrop } from '@/utils/backdrop'
import { dataUrlToBlob } from '@/utils/dataUrl'
import { extensionForBlob, saveImageBlob, toPngBlob } from '@/utils/download'
import {
  addGuestStrip,
  countGuestStrips,
  hasGuestStrip,
  pruneGuestStrips,
} from '@/utils/guestStripsDb'

import { PHOTO_FILTER_MAP } from '../../constants/filters'
import { STRIP_TEMPLATES, STRIP_TEMPLATE_MAP } from '../../constants/stripTemplates'
import { composeShareCard, type ShareCard } from '../../utils/composeShareCard'
import { composeStrip, type ComposedStrip } from '../../utils/composeStrip'
import { ShareStripDialog } from './ShareStripDialog'
import { StripRating } from './StripRating'
import styles from './StripResult.module.scss'

interface StripResultProps {
  /** Recovery only: re-run capture from scratch if composition fails. */
  onRetake: () => void
}

/** How few slots must remain before a save is worth warning about. */
const LOW_SLOTS = 3

/**
 * Tack "2 slots left" onto a save confirmation once the cart is nearly full.
 *
 * Only when it's nearly full: a user with three strips doesn't need a running quota on
 * every save, but someone about to hit the wall should learn it here rather than on the
 * save that gets refused. `held` is whatever the relevant store now holds — the server
 * cart when signed in, the browser cache when not.
 */
function withSlotsLeft(t: TFunction, message: string, held: number): string {
  const left = Math.max(0, env.stripMaxItems - held)
  return left > LOW_SLOTS ? message : `${message} — ${t('cart.slotsLeft', { count: left })}`
}

/** Composes the captured frames into a strip and offers share / download / retake. */
export function StripResult({ onRetake }: StripResultProps) {
  const { t } = useTranslation()
  const { roomId } = useParams<{ roomId: string }>()
  const [searchParams] = useSearchParams()
  // Filed with the strip, so the gallery and cart can shelve it by where it came from.
  // All three modes go through as themselves — the API accepts `group` and the gallery
  // has a pill and a badge for it.
  const sessionMode = resolveSessionMode(searchParams.get('mode'))
  const frames = usePhotosStore((state) => state.selection)
  const resultId = usePhotosStore((state) => state.resultId)
  // Recovery retake is the host's: it re-runs the countdown for the whole room, which
  // is not a guest's to trigger — a guest whose compose failed shares/downloads or waits
  // for the host to call another round. Once a peer has committed their own strip even
  // the host loses it: a retake would reset a strip they've already finished (and, since
  // they now ignore the reset, would only split the room in two).
  const isHost = useRoomStore((state) => state.isHost) === true
  const peerCreated = useRoomStore((state) => state.createdPeers.length > 0)
  const canEdit = isHost && !peerCreated
  // Signed-out users can run the whole booth; their strips are cached in the browser and
  // sync to the server cart once they sign in.
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  // Read the frozen design snapshot (taken when Create was pressed), not the live
  // store — so a later host filter change can't alter a strip already created.
  const resultConfig = usePhotosStore((state) => state.resultConfig)
  const templateId = resultConfig?.templateId
  const template = (templateId && STRIP_TEMPLATE_MAP[templateId]) || STRIP_TEMPLATES[0]
  const filter = resultConfig?.filter ?? 'none'
  const backdrop = resolveBackdrop(resultConfig?.backdrop)
  // Stable ref from the frozen snapshot (avoid `?? []` here — a fresh array each
  // render would churn the compose effect's deps).
  const stickers = resultConfig?.stickers
  const [strip, setStrip] = useState<ComposedStrip | null>(null)
  /**
   * `saveFailed` is its own screen rather than a toast over the success screen. The two
   * used to be indistinguishable — a failed save still rendered "saved to your cart", a
   * "View in cart" button, and no way to try again — so the only signal that anything had
   * gone wrong was a toast that dismissed itself.
   */
  const [status, setStatus] = useState<'composing' | 'saving' | 'saveFailed' | 'ready' | 'error'>(
    'composing'
  )
  /** Why the last save failed, so the retry screen can say something specific. */
  const [saveError, setSaveError] = useState<string>('cart.saveError')

  const [shareOpen, setShareOpen] = useState(false)
  const [shareCard, setShareCard] = useState<ShareCard | null>(null)
  const [shareStatus, setShareStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const brand = t('brand.name')

  // Set false on unmount so an in-flight share-card compose can't setState after
  // the result screen is gone (e.g. the session ends mid-compose).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Which resultId we've already uploaded to the cart, so a recompose / StrictMode
  // remount can't create a duplicate strip on the server.
  const uploadedResultIdRef = useRef<string | null>(null)

  /**
   * Compose the clean copy and store the strip — the server cart when signed in, this
   * browser's cache when not.
   *
   * Both copies are produced and written together. The clean, watermark-free copy used to
   * be composed and uploaded *after* this reported success, so anything that interrupted
   * it — a closed tab, a rate limit, a failed second render — left a strip in the cart
   * that can never be unlocked and that nothing can repair, because rebuilding it needs
   * frames the session no longer holds. Now it is half of what "saved" means: if the
   * clean copy can't be made or stored, the save fails and says so.
   *
   * `isStale` lets the caller abandon a save whose screen has gone: the effect passes its
   * own cancellation flag, the retry button passes the mounted ref.
   */
  const saveStrip = useCallback(
    async (composed: ComposedStrip, isStale: () => boolean) => {
      if (!resultId) {
        setStatus('ready')
        return
      }
      setStatus('saving')
      try {
        const watermarked = await dataUrlToBlob(composed.dataUrl)
        // Rendered during compose, from the canvas that was already in hand. Null when
        // this browser has no WebP encoder — the server then renders it as before.
        const thumbnailBlob = composed.thumbnailDataUrl
          ? await dataUrlToBlob(composed.thumbnailDataUrl)
          : null
        // Cached from the watermarked compose, so this is the same cuts, not a second
        // round of cutting out.
        const clean = await composeStrip(await framesWithBackdrop(frames, backdrop), {
          template,
          title: brand,
          filter: PHOTO_FILTER_MAP[filter].value,
          stickers: stickers ?? [],
          watermark: false,
          // The copy someone pays for — encoded losslessly, unlike the preview.
          encoding: 'archival',
        })
        if (isStale()) return
        // A second full-size render is where a weaker phone runs out of memory. Failing
        // the save is the point: saving only the watermarked half is what produced strips
        // that looked fine and could never be bought.
        if (!clean) {
          setSaveError('cart.cleanError')
          setStatus('saveFailed')
          return
        }
        const cleanBlob = await dataUrlToBlob(clean.dataUrl)
        if (isStale()) return

        // Signed out: don't touch the server. Cache both copies in the browser; they're
        // flushed to the cart when the user signs in / registers.
        if (!isAuthenticated) {
          // Expire stale records first, so a strip from months ago is never what turns
          // this one away.
          await pruneGuestStrips()
          if (isStale()) return
          // The cache has to stay bounded (see `utils/guestStripsDb`). `addGuestStrip`
          // upserts, so only a *new* id counts against the ceiling — recomposing a
          // strip that's already cached is free.
          const full =
            (await countGuestStrips()) >= env.stripMaxItems && !(await hasGuestStrip(resultId))
          if (isStale()) return
          if (full) {
            toast.error(t('cart.fullGuest', { count: env.stripMaxItems }))
            // Only the caching is refused: the strip composed fine, it's on screen, and
            // it stays shareable and downloadable like any other. Retrying would hit the
            // same wall, so this settles as `ready` rather than as a failure.
            uploadedResultIdRef.current = resultId
            setStatus('ready')
            return
          }

          await addGuestStrip({
            id: resultId,
            watermarked,
            clean: cleanBlob,
            thumbnail: thumbnailBlob,
            sessionId: roomId ?? 'solo',
            sessionMode,
            createdAt: new Date().toISOString(),
          })
          if (isStale()) return
          uploadedResultIdRef.current = resultId
          toast.success(withSlotsLeft(t, t('cart.savedLocally'), await countGuestStrips()))
          setStatus('ready')
          return
        }

        const saved = await useCartStore.getState().addStrip(
          watermarked,
          {
            sessionId: roomId ?? 'solo',
            mode: sessionMode,
            // The strip's own id, so a retry of a save that only *looked* like it failed
            // is recognised server-side instead of saving the strip twice. `resultId` is
            // minted once per created strip and doesn't change across attempts, which is
            // exactly what makes it the key rather than something per-request.
            clientKey: resultId,
          },
          cleanBlob,
          thumbnailBlob
        )
        if (isStale()) return
        if (!saved.ok) {
          setSaveError(saved.reason === 'cart_full' ? 'cart.full' : 'cart.saveError')
          setStatus('saveFailed')
          return
        }
        // Only now. Latching before the attempt is what made a failed save permanent:
        // every later run of the effect saw the strip as already handled and skipped
        // straight to the success screen, with no way left to try again.
        uploadedResultIdRef.current = resultId
        toast.success(
          withSlotsLeft(
            t,
            t('cart.added'),
            useCartStore.getState().items.filter((item) => !item.paid).length
          )
        )
        setStatus('ready')
      } catch {
        if (isStale()) return
        setSaveError('cart.saveError')
        setStatus('saveFailed')
      }
    },
    [
      frames,
      template,
      brand,
      filter,
      backdrop,
      stickers,
      resultId,
      roomId,
      sessionMode,
      isAuthenticated,
      t,
    ]
  )

  useEffect(() => {
    let cancelled = false
    setStatus('composing')
    // Instant when the arrange screen already cut these out; a draft restored straight
    // onto the result screen has to redo it here.
    framesWithBackdrop(frames, backdrop)
      .then((sources) =>
        composeStrip(sources, {
          template,
          // Footer shows the app name + the session date.
          title: brand,
          filter: PHOTO_FILTER_MAP[filter].value,
          stickers: stickers ?? [],
          // Free strips are watermarked; the clean copy saved alongside is composed with
          // `watermark: false` in `saveStrip`.
          watermark: true,
          watermarkText: brand,
        })
      )
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setStatus('error')
          return
        }
        setStrip(result)

        // Already saved on a prior run (recompose / StrictMode remount): the strip is
        // in the cart, so reveal it straight away.
        if (!resultId || uploadedResultIdRef.current === resultId) {
          setStatus('ready')
          return
        }

        // Gate the result screen on the save so the strip and the toast land together —
        // not whenever a slow API happens to return.
        void saveStrip(result, () => cancelled)
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [frames, template, filter, backdrop, stickers, brand, resultId, saveStrip])

  /** Try the whole save again with the strip already on screen — nothing is re-captured. */
  const retrySave = () => {
    if (strip) void saveStrip(strip, () => !mountedRef.current)
  }

  // Build the branded share card lazily when the user opens the share preview.
  const openShare = () => {
    if (!strip) return
    setShareOpen(true)
    if (shareCard) return
    setShareStatus('loading')
    composeShareCard(strip.dataUrl, { brand, tagline: t('result.shareTagline') })
      .then((card) => {
        if (!mountedRef.current) return
        if (card) {
          setShareCard(card)
          setShareStatus('ready')
        } else {
          setShareStatus('error')
        }
      })
      .catch(() => {
        if (mountedRef.current) setShareStatus('error')
      })
  }

  const shareFile =
    shareCard?.blob &&
    new File([shareCard.blob], `${brand.toLowerCase()}-strip.png`, {
      type: 'image/png',
    })

  const canNativeShare = Boolean(
    shareFile && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [shareFile] })
  )

  const shareFilename = `${brand.toLowerCase()}-strip-${Date.now()}.png`

  /**
   * Hand the composed strip over as a PNG.
   *
   * `strip.dataUrl` is WebP now — small to hold and to upload, but the wrong thing to
   * drop in someone's downloads folder, where WhatsApp reads it as a sticker. Same
   * conversion the gallery's download does, and the name follows the bytes rather than
   * assuming, because the re-encode can fail on a weak phone.
   */
  const downloadStripFile = useCallback(async () => {
    // The button only renders once a strip exists; the guard is for the hook, which is
    // declared before that narrowing.
    if (!strip) return
    const file = await toPngBlob(await dataUrlToBlob(strip.dataUrl))
    const base = shareFilename.replace(/\.png$/, '')
    const result = await saveImageBlob(file, `${base}.${extensionForBlob(file)}`)
    // No route to a file on this browser — the strip is on screen behind this button,
    // so point at the one gesture that still saves it.
    if (result === 'unsupported') toast.info(t('common.pressAndHoldToSave'))
  }, [strip, shareFilename, t])

  /**
   * Save the share card, by download or by share sheet, and say whether a file landed.
   *
   * The card is composed in a canvas, so the blob is the real thing and the data URL is
   * only for the preview `<img>`; handing the blob over means the iOS browsers that
   * ignore `download` get the share sheet instead of nothing at all. Returns false when
   * the browser managed neither — the caller must not then claim it saved.
   */
  const saveShareCard = async (): Promise<boolean> => {
    try {
      const blob = shareCard?.blob ?? (shareCard ? await dataUrlToBlob(shareCard.dataUrl) : null)
      if (!blob) return false
      const result = await saveImageBlob(blob, shareFilename)
      if (result === 'unsupported') toast.info(t('common.pressAndHoldToSave'))
      return result === 'downloaded' || result === 'shared'
    } catch {
      // The button handlers are fire-and-forget, so a throw here would otherwise be an
      // unhandled rejection and a dead-looking button.
      toast.error(t('result.shareError'))
      return false
    }
  }

  const nativeShare = async () => {
    if (!shareFile) return false
    try {
      await navigator.share({ files: [shareFile], title: brand, text: t('result.shareText') })
      return true
    } catch (err) {
      // Swallow the user-cancelled case; surface anything else.
      if ((err as DOMException)?.name !== 'AbortError') toast.error(t('result.shareError'))
      return true // sheet opened; don't fall back to a download
    }
  }

  // Instagram has no direct web-post API: on mobile the native sheet delivers the
  // image (Instagram is a target); on desktop we save the card and open Instagram
  // so the user can upload it manually.
  const handleInstagram = async () => {
    if (!shareCard) return
    if (canNativeShare && (await nativeShare())) return
    if (!(await saveShareCard())) return
    toast.success(t('result.instagramSaved'))
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
  }

  const handleShare = async () => {
    if (!shareCard) return
    if (canNativeShare && (await nativeShare())) return
    if (await saveShareCard()) toast.success(t('result.saved'))
  }

  const handleShareDownload = async () => {
    if (!shareCard) return
    if (await saveShareCard()) toast.success(t('result.saved'))
  }

  if (status === 'composing' || status === 'saving') {
    return (
      <div className={styles.composing}>
        <Loader2 className={styles.spinner} />
        <p className={styles.message}>
          {t(status === 'saving' ? 'result.saving' : 'result.composing')}
        </p>
      </div>
    )
  }

  /**
   * The save failed and the strip exists only on this screen.
   *
   * Deliberately not the success screen with a toast over it. The strip is shown so it
   * isn't lost, `Download` keeps it whatever happens next, and `Try again` re-runs the
   * whole save — the frames are still in memory, so nothing has to be re-captured. The
   * message is the specific reason, because a full cart needs a different action from
   * a network blip.
   */
  if (status === 'saveFailed' && strip) {
    return (
      <div className={styles.result}>
        <div className={styles.layout}>
          <div className={styles.intro}>
            <p className={styles.eyebrowError}>{t('result.notSaved')}</p>
            <h1 className={styles.headline}>{t('result.headline')}</h1>
          </div>

          <figure className={styles.stripBlock}>
            <div className={styles.pedestal}>
              <img src={strip.dataUrl} alt={t('result.stripAlt')} className={styles.strip} />
            </div>
          </figure>

          <div className={styles.body}>
            <p className={styles.lead}>{t(saveError, { count: env.stripMaxItems })}</p>
            <div className={styles.actions}>
              <Button className={styles.action} onClick={retrySave}>
                <RotateCcw /> {t('result.retrySave')}
              </Button>
              <Button
                variant="outline"
                className={styles.action}
                onClick={() => {
                  void downloadStripFile().then(() => toast.success(t('result.saved')))
                }}
              >
                <Download /> {t('result.downloadStrip')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error' || !strip) {
    return (
      <div className={styles.composing}>
        <p className={styles.message}>{t('result.composeError')}</p>
        {canEdit && (
          <Button variant="outline" onClick={onRetake}>
            <RotateCcw /> {t('result.retake')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className={styles.result}>
      {/* The strip is the page: it stands on a light pedestal in its own column, and
       * everything that can be done with it is stated beside the artwork rather than
       * discovered later in the cart. On a phone the same blocks stack in reading
       * order — title, strip, what happens to it, then the actions. */}
      <div className={styles.layout}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>
            {t(isAuthenticated ? 'result.savedToCart' : 'result.savedOnDevice')}
          </p>
          <h1 className={styles.headline}>{t('result.headline')}</h1>
        </div>

        <figure className={styles.stripBlock}>
          <div className={styles.pedestal}>
            <img src={strip.dataUrl} alt={t('result.stripAlt')} className={styles.strip} />
          </div>
          <figcaption className={styles.stripMeta}>
            {t('result.stripMeta', {
              template: t(`templates.${template.label}`),
              cuts: SHOT_COUNT,
            })}
          </figcaption>
        </figure>

        <div className={styles.body}>
          {/* Signed in, the clean copy is already waiting in the cart; a guest's strip
           * only lives in this browser until they sign in. */}
          <p className={styles.lead}>
            {t(isAuthenticated ? 'result.leadSignedIn' : 'result.leadGuest', { brand })}
          </p>

          <div className={styles.actions}>
            <Button className={styles.action} onClick={openShare}>
              <Share2 /> {t('result.shareTitle')}
            </Button>
            {isAuthenticated ? (
              <Button variant="outline" className={styles.action} asChild>
                <Link to={ROUTES.cart}>
                  <ShoppingBag /> {t('result.viewInCart')}
                </Link>
              </Button>
            ) : (
              <Button variant="outline" className={styles.action} asChild>
                <Link to={`${ROUTES.login}?redirect=${encodeURIComponent(ROUTES.cart)}`}>
                  <ShoppingBag /> {t('result.signInToSave')}
                </Link>
              </Button>
            )}
          </div>

          {/* Where the watermark goes, said next to the strip that carries one. A guest
           * has already been told the same thing by the lead above (sign in first), so
           * this only stands for someone whose cart is real. */}
          {isAuthenticated && (
            <div className={styles.printCard} role="note">
              <span className={styles.printIcon}>
                <Printer aria-hidden="true" />
              </span>
              <div className={styles.noteBody}>
                <p className={styles.noteTitle}>{t('result.printTitle')}</p>
                <p className={styles.noteText}>{t('result.printText')}</p>
              </div>
            </div>
          )}

          {/* Asked here rather than from the floating button: this is the moment the
           * person has an opinion, and the booth hides the FAB anyway. */}
          <StripRating sessionMode={sessionMode} />
        </div>
      </div>

      <ShareStripDialog
        open={shareOpen}
        status={shareStatus}
        imageUrl={shareCard?.dataUrl ?? null}
        canShare={canNativeShare}
        onInstagram={handleInstagram}
        onShare={handleShare}
        onDownload={handleShareDownload}
        onClose={() => setShareOpen(false)}
      />
    </div>
  )
}
