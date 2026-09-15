import { CameraOff, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { SHOT_COUNT } from '@/constants/capture'
import { CountdownOverlay } from '@/features/capture/CountdownOverlay'
import { StripPreview } from '@/features/capture/StripPreview'
import { STRIP_TEMPLATES, STRIP_TEMPLATE_MAP, slotAspect } from '@/constants/stripTemplates'
import { compositeGrid } from '@/utils/captureFrame'
import { minSessionMembers } from '@/utils/rooms'
import { StripSelector } from '@/features/capture/StripSelector'
import { TemplatePicker } from '@/features/capture/TemplatePicker'
import { StripResult } from '@/features/compose/StripResult'
import { PeerVideo } from '@/features/peer/PeerVideo'
import { useBoothStage } from '@/hooks/useBoothStage'
import { useCaptureSequence } from '@/hooks/useCaptureSequence'
import { useCountdownAudio } from '@/hooks/useCountdownAudio'
import { useCountdownSync } from '@/hooks/useCountdownSync'
import { usePeerConnection } from '@/hooks/usePeerConnection'
import { cn } from '@/lib/utils'
import { useMediaStore } from '@/store/useMediaStore'
import { usePeerStore } from '@/store/usePeerStore'
import { usePhotosStore } from '@/store/usePhotosStore'
import { useRoomStore } from '@/store/useRoomStore'
import { useStripStore } from '@/store/useStripStore'

import type { SessionMode } from '@/types/roomsType'
import { notifyMessage, notifyWarning } from '@/lib/notify'
import { useUserMedia } from '../../hooks/useUserMedia'
import styles from './CameraStage.module.scss'
import { MediaControls } from './MediaControls'
import { VideoPreview } from './VideoPreview'

/**
 * How long a dropped connection is tolerated before it stops a capture already in
 * flight. Long enough to ride out the blips that don't actually spoil a cut, short
 * enough that the rest of the strip can't be shot out of step with the other person.
 */
const OFFLINE_CAPTURE_GRACE_MS = 4000

/**
 * Height ceilings for a tile whose cut is portrait — see `capTileHeight`. Only a
 * portrait template is measured against them, so every 4x1 template keeps the
 * width-driven sizing it has always had, at every viewport.
 *
 * Both are viewport-relative as well as absolute: on a phone the stage is a stack,
 * and a tile allowed its full desktop height would push the picker and the strip
 * off the bottom of the screen.
 */
const STAGE_TILE_MAX_HEIGHT = 'min(26rem, 48vh)'
/** The arrange/result rail is a 13.25rem column, and a paired room stacks two. */
const RAIL_TILE_MAX_HEIGHT = 'min(17.5rem, 30vh)'

/**
 * Stop whatever is being shot right now: a single-slot retake falls back to the strip
 * as it was (nothing was replaced yet), a whole sequence is discarded — it can't be
 * resumed, and a half-shot strip is no use to anyone.
 */
function stopCapture(): void {
  const photos = usePhotosStore.getState()
  if (photos.retakeSlot !== null) photos.finishRetake()
  else photos.reset()
}

/**
 * The booth. Opens the camera + peer video immediately (so participants can see
 * and talk to each other). The host presses Start Session to run the synced
 * countdown capture; the guest waits for the host. After capture, the arrange
 * step (template + stickers) runs, then the composed result.
 *
 * Both bodies live on one route and share this shell, so the room bar and the live
 * cameras never unmount between them — only the work around them changes.
 */
export function CameraStage({ mode }: { mode: SessionMode }) {
  const { t } = useTranslation()
  const { retry } = useUserMedia()
  const status = useMediaStore((state) => state.status)
  const error = useMediaStore((state) => state.error)
  const frames = usePhotosStore((state) => state.frames)
  const isCapturing = usePhotosStore((state) => state.isCapturing)
  const reviewing = usePhotosStore((state) => state.reviewing)
  const retakeSlot = usePhotosStore((state) => state.retakeSlot)
  const captureTiles = usePhotosStore((state) => state.captureTiles)
  const captureMembers = usePhotosStore((state) => state.captureMembers)
  const selection = usePhotosStore((state) => state.selection)
  const peers = usePeerStore((state) => state.peers)
  const camEnabled = useMediaStore((state) => state.camEnabled)
  const isHost = useRoomStore((state) => state.isHost)
  const roomStatus = useRoomStore((state) => state.status)
  const peerIds = useRoomStore((state) => state.peerIds)
  const capacity = useRoomStore((state) => state.capacity)
  const peerHasShots = useRoomStore((state) => state.peerHasShots)
  const peerCreated = useRoomStore((state) => state.createdPeers.length > 0)
  const templateId = useStripStore((state) => state.templateId)

  // Shooting is a shared act: every camera fires on one count, and a retake resets the
  // other people's strips along with ours. Three things can take that away, and any one
  // of them puts the cameras on hold. Solo mode has none.
  //
  // Too few people for this kind of room. In a date room that means the friend isn't
  // here and their half of every cut would be missing; in a group room the floor is
  // three, because a group session shot by two is just a date strip taken in the wrong
  // place. Same floor the server enforces on opening the window.
  const peerAway = mode !== 'solo' && peerIds.length + 1 < minSessionMembers(capacity)
  // Or *we* are the ones cut off. Nothing tells us the other person left in this case
  // — no `peer-left` can reach a socket that's down — so without this the booth would
  // happily carry on. It can't: every shared act goes through the server, and
  // `useCountdownSync` quietly falls back to shooting locally when the socket is gone,
  // which is how someone ends up with a solo strip in a room built for two.
  const offline = mode !== 'solo' && roomStatus !== 'connected'
  // Fewer people are in the room than this strip's cuts were laid out for. The grid is
  // pinned for the strip's lifetime, so re-shooting one slot would redraw the missing
  // person's cell as black — a cut with a hole in it, inside a strip of cuts with
  // everybody in them. And re-shooting the *whole* strip is worse, not better: it wipes
  // four good cuts for everyone still here, on the strength of an absence that is often
  // just a reconnect. Both wait for whoever left; the room stays open on the same code
  // for them to walk back into.
  const castBelow = mode !== 'solo' && peerIds.length + 1 < captureMembers
  // ...and the other direction: someone arrived after the strip was shot. A single cut
  // re-taken now would hold a different set of faces from the three beside it. Without
  // this the host pressed retake and watched nothing happen — the run started and the
  // cast check aborted it in the same breath.
  const castAbove = mode !== 'solo' && peerIds.length + 1 > captureMembers
  // A fourth hold, and the only one that isn't about the connection: the friend has
  // already committed their strip. Their copy is finished and can't be re-shot — they
  // ignore a retake now rather than being pulled out of it — so retaking here would
  // only walk the two strips out of step. It lifts when a fresh capture starts.
  //
  // Copy written for two people reads wrong in a room of four ("both cameras", "both
  // screens"). Rather than a ternary at each use, the group booth reaches for a parallel
  // key — so a string with no group variant simply keeps the one it has.
  // Memoised: the offline-stop effect below depends on it, and a fresh function each
  // render would restart that effect's grace timer on every tick.
  const line = useCallback(
    (key: string) => (mode === 'group' ? t([`${key}Group`, key]) : t(key)),
    [mode, t]
  )

  // Why the cameras are on hold, worded for the retake controls, or null when they
  // aren't. The start button says the same thing in its own words (`waitingNote`).
  const retakeBlockedReason = peerAway
    ? t(mode === 'group' ? 'select.retakeWaitingGroup' : 'select.retakeWaiting')
    : offline
      ? t('select.retakeOffline')
      : peerCreated
        ? line('select.retakeCreated')
        : castBelow
          ? t('select.retakeShortHanded')
          : null

  /**
   * Re-shooting one slot has a hold that "Retake all" doesn't: someone has *joined*
   * since the strip was shot.
   *
   * The two directions aren't symmetric. Fewer people than the strip holds both, because
   * discarding four good cuts over an absence that is usually a reconnect costs more
   * than waiting. More people holds only the single-slot retake — starting over is
   * exactly how you get the newcomer into the strip, so taking that away would strand
   * them out of it for the rest of the session.
   */
  const retakeShotBlockedReason =
    retakeBlockedReason ?? (castAbove ? t('select.retakeCastGrew') : null)

  // Shape the live tiles like the cut they will produce: the chosen template's slot,
  // split between however many cameras are in the room. Without this the tiles are
  // portrait while every slot is landscape, so the strip crops the framing away —
  // worst in solo, where nothing shares the slot. Changing template reshapes them.
  const template = STRIP_TEMPLATE_MAP[templateId] ?? STRIP_TEMPLATES[0]
  // Everyone whose picture we actually have, in room order. Only these get a tile — and
  // only these become cells in the cut — so the stage stays a preview of the strip
  // rather than of the guest list.
  const livePeerIds = peerIds.filter((id) => peers[id]?.stream)
  /**
   * Someone is in the room but their picture hasn't arrived — a call still being set up,
   * or one leg of the mesh that hasn't come back from a blip. A fifth hold on starting,
   * and the only one that isn't visible in the membership count.
   *
   * The grid a run is shot into is pinned per device from the cameras *that device* can
   * see (`tileCount`), and the strip's design is shared. Start while a camera is missing
   * here and the cuts stop agreeing: whoever is short a picture lays out a smaller grid
   * than everybody else, and the host's stickers — broadcast as fractions of the strip —
   * land on the wrong cell in their copy. A pair barely meets this (one leg, and the
   * booth is unusable without it), but a group of four is a mesh of six legs, any one of
   * which can lag behind the join it belongs to.
   *
   * Held rather than worked around: the cameras are usually seconds away, and everyone
   * in the room is the point of the strip.
   */
  const camerasConnecting = mode !== 'solo' && livePeerIds.length < peerIds.length
  /**
   * Someone's picture *has* arrived and they have switched it off. A stream is still
   * flowing — a disabled track is black frames, not an absent camera — so the hold above
   * can't see this one, and the host was starting a run that shoots somebody's cell as a
   * black square four times over.
   *
   * Read as an explicit `false`: a peer is assumed live until their first media-state
   * relay lands (`emptyPeer`), and treating "not heard from yet" as a camera off would
   * hold the button on every join.
   *
   * Not a correctness hold like `camerasConnecting` — a disabled track is black on
   * everybody's device, so the strips still agree. It is the same rule the local camera
   * has always had (`startCapture` refuses with our own camera off), applied to the rest
   * of the room: nobody wants to find out at the arrange step that a quarter of every
   * cut is blank.
   */
  const peerCamOff = mode !== 'solo' && livePeerIds.some((id) => peers[id]?.camEnabled === false)
  /**
   * The tiles on screen, and the grid they sit in.
   *
   * **While a run is in flight both come from the pinned count, not from who is on
   * camera right now.** The cuts are being shot into a grid fixed when the run started,
   * and the stage is supposed to be a preview of them — so someone who joins mid-run
   * must not appear in a reshaped stage they are not actually in. They were: the tiles
   * grew to a 2x2 while the compositor kept a 3x1 and dropped the extra source, which
   * put a fourth person on screen, framed and counting down, and not on the strip.
   *
   * Someone whose stream drops mid-run leaves an empty cell instead, which is right —
   * that is exactly the black cell their cut will have.
   */
  const stageTiles = isCapturing ? captureTiles : 1 + livePeerIds.length
  const stagePeerIds = isCapturing
    ? livePeerIds.slice(0, Math.max(0, captureTiles - 1))
    : livePeerIds
  const grid = compositeGrid(stageTiles, slotAspect(template))
  const tileAspect = grid.cellAspect
  // A tile takes the width it is given and derives its height from that aspect. That
  // is right while the cut is landscape — height comes out below the width and the
  // stage stays in frame. A portrait cut inverts it: the 2x2 template's slot is ~0.80
  // (~0.40 once two cameras split one), so a full-width tile came out 740x924 on a
  // 1280 desktop, burying the strip and the controls below the fold. Cap the height
  // there and let the width follow instead.
  const capTileHeight = (maxHeight: string, cols: number, rows: number) =>
    tileAspect < 1 ? `calc(${maxHeight} * ${(tileAspect * cols) / rows})` : undefined

  // Fewer people are here than this run's cuts were laid out for. Read from *room
  // membership* rather than from live streams on purpose: a stream that blinks costs one
  // cut a black cell and comes back, while a person leaving is not coming back inside
  // this run — and treating a blip as a departure would tear down a capture over a
  // second of packet loss.
  /**
   * The room's cast changed while a run was in flight — someone left, or someone new
   * arrived. Either way this strip is no longer the strip everyone in the room is in.
   *
   * A departure was always stopped; an arrival used to be silently excluded, which left
   * the newcomer waiting out a countdown they were framed for and then absent from. They
   * are treated alike now: the run stops, and the host starts again with everybody.
   *
   * Measured against the **membership** pinned at the start, not the camera count: a run
   * can begin with three people and two live streams, and comparing to cameras would
   * read that gap as a change and stop the run on the spot. A reconnect is safe too —
   * the server hands a returning member their own seat back in place, so the count never
   * moves.
   */
  const castChanged = mode !== 'solo' && isCapturing && peerIds.length + 1 !== captureMembers

  const localVideoRef = useRef<HTMLVideoElement>(null)
  /**
   * One <video> ref per peer, keyed by socket id — `PeerVideo` wants a ref of its own
   * and the capture wants all of them, so they share these objects. A single ref per
   * peer won't do: the tiles come and go with membership.
   */
  const peerVideoRefs = useRef(new Map<string, RefObject<HTMLVideoElement>>())
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useCaptureSequence(localVideoRef, peerVideoRefs, canvasRef)

  /**
   * This peer's video ref, created once and reused — handing a child a fresh ref on
   * every render would detach and reattach its stream. An entry for someone who has
   * left is harmless: React nulls its `current` on unmount, and the capture only walks
   * the people currently in the room.
   */
  const peerRefFor = (socketId: string): RefObject<HTMLVideoElement> => {
    const existing = peerVideoRefs.current.get(socketId)
    if (existing) return existing
    const ref: RefObject<HTMLVideoElement> = { current: null }
    peerVideoRefs.current.set(socketId, ref)
    return ref
  }
  useCountdownAudio()
  usePeerConnection()
  const { startSession, starting, retakeAll, retakeShot, retakingSlot } = useCountdownSync()

  // The room changed under a running sequence. Someone leaving means every remaining
  // shot comes back with an empty cell where they were; someone arriving means the rest
  // of the strip has a person in it that the first cuts don't. Either way the cuts stop
  // matching each other, and a countdown synced off the server clock can't be picked up
  // where it left off. Stop the run: a single-shot retake falls back to the strip as it
  // was (the other cuts are still good), while a whole sequence is cleared so Start
  // begins from a clean slate with whoever is actually here.
  //
  // `castChanged` is the general case and `peerAway` the floor beneath it: a run can be
  // the right size and still not be shootable, in a room that has dropped below the
  // people its mode needs.
  useEffect(() => {
    if (!isCapturing) return
    if (!peerAway && !castChanged) return
    stopCapture()
  }, [peerAway, castChanged, isCapturing])

  // Our own connection went instead. Same ending, but not straight away: a blip of a
  // second or two costs the cuts nothing — the countdown was scheduled locally the
  // moment it started, and the peer's video runs directly between the two devices, not
  // through the server — so tearing down a twenty-second capture over one would take
  // more than it saves. Give it a moment to come back; if it hasn't, the shots stop
  // before they can drift out of step with the other person's.
  useEffect(() => {
    if (!offline || !isCapturing) return
    const timer = window.setTimeout(() => {
      stopCapture()
      // Same split as the waiting note: only a host has a Start button to come back to.
      notifyWarning(line(isHost ? 'capture.stoppedOffline' : 'capture.stoppedOfflineGuest'))
    }, OFFLINE_CAPTURE_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [offline, isCapturing, isHost, line])

  const startCapture = () => {
    // A session is shot together: one count, both cameras. Without the other person —
    // or without the connection that keeps the two of you in step — there is no
    // session to start, only a half-empty strip in a room built for two. And without
    // every camera through, the strips this run produces wouldn't match each other.
    if (peerAway || offline || camerasConnecting || peerCamOff) return
    // A start already asked for and not yet answered. The button is held while that is
    // true, so this is the backstop for the press that lands in the same tick — and it
    // matters more than a normal double-click guard: a second `session:start` doesn't
    // start anything twice, it re-broadcasts the count and pushes the run further away
    // for everyone in the room.
    if (starting) return
    if (!camEnabled) {
      notifyMessage(t('photobooth.cameraDisabled'))
      return
    }
    startSession()
  }

  // The primary action doubles as the capture indicator rather than being swapped
  // out for one: the picker stays on screen (locked) through the sequence, so the
  // rail shouldn't rearrange itself the moment the countdown starts.
  const startButton = (
    <Button
      className={styles.startButton}
      onClick={startCapture}
      disabled={isCapturing || starting || peerAway || offline || camerasConnecting || peerCamOff}
    >
      {starting && <Loader2 className={styles.startSpinner} aria-hidden />}
      {isCapturing
        ? t('capture.capturing')
        : starting
          ? t('capture.starting')
          : t('capture.startSession')}
    </Button>
  )

  // What this person is waiting on, when nothing is being shot.
  function waitingNote(): string {
    // "You can start once…" is the host's line, and only the host's. In a two-person
    // room that distinction didn't exist — whoever was left when the other went became
    // the host (`onPeerLeft` promotes them), so it was always true. A group room holds
    // its floor at three, so it can sit under-strength with the host still very much
    // present, and every guest was being told they could start something they have no
    // button for.
    if (peerAway) {
      const key = mode === 'group' ? 'capture.waitingForGroup' : 'capture.waitingForFriend'
      return isHost ? t(key) : t([`${key}Guest`, key])
    }
    if (offline) return t(isHost ? 'capture.waitingReconnect' : 'capture.waitingReconnectGuest')
    // Everyone is here; one of their pictures isn't. Named as the wait it is — the host
    // pressing a dead button and guessing why was the alternative.
    if (camerasConnecting) {
      const key = mode === 'group' ? 'capture.waitingCamerasGroup' : 'capture.waitingCameras'
      return isHost ? t(key) : t([`${key}Guest`, key])
    }
    // We are the one holding it up. Said plainly and to both roles: a guest who muted
    // their camera and then waited on a host who cannot start is the whole failure.
    if (!camEnabled) return t('capture.waitingCamOffSelf')
    if (peerCamOff) {
      const key = mode === 'group' ? 'capture.waitingCamOffGroup' : 'capture.waitingCamOff'
      return isHost ? t(key) : t([`${key}Guest`, key])
    }
    if (isHost) return line('capture.startNote')
    // Nothing of our own, while everyone else holds a full set. Two ways to arrive here
    // and the copy has to serve both: a round ran without us (arrived late, or came back
    // to find the recovery draft gone), and either way this booth is not something to
    // operate — it is a wait. "Waiting for your host to start" would be a quiet lie,
    // since the host is arranging a finished strip and has no reason to start again on
    // their own. Name the one thing that puts us in a strip: their retake.
    if (frames.length === 0 && peerHasShots) return line('capture.friendAlreadyShot')
    return t('capture.waitingForHost')
  }

  // One line under the button: shot progress while the sequence runs, otherwise
  // whatever this person is waiting on.
  const startNote = isCapturing ? (
    <p className={styles.startNote} role="status" aria-live="polite">
      {retakeSlot !== null
        ? t('capture.retakingPhoto', { index: retakeSlot + 1 })
        : t('capture.takingPhotos', { taken: frames.length, total: SHOT_COUNT })}
    </p>
  ) : (
    <p
      className={styles.startNote}
      role={peerAway || offline || camerasConnecting || peerCamOff ? 'status' : undefined}
      aria-live="polite"
    >
      {waitingNote()}
    </p>
  )

  // Warn if the user returns after leaving mid-session (hidden tabs are throttled).
  useEffect(() => {
    let leftDuringCapture = false
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (usePhotosStore.getState().isCapturing) leftDuringCapture = true
      } else if (leftDuringCapture) {
        leftDuringCapture = false
        toast.warning(t('capture.leftBooth'))
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [t])

  // Which of this shell's three bodies is on show. Named here rather than inline in
  // the returns below so the booth's tips can be told which screen a person is
  // actually looking at, without a second copy of these conditions going stale.
  const showResult = !isCapturing && selection.length > 0
  const showArrange = !isCapturing && reviewing && frames.length >= SHOT_COUNT
  // Nothing to advise on while the camera is still being asked for, or refused —
  // those screens are their own instruction.
  const cameraLive = status !== 'idle' && status !== 'requesting' && status !== 'error'
  useBoothStage(cameraLive ? (showResult ? 'result' : showArrange ? 'arrange' : 'booth') : null)

  /**
   * The cameras once the strip has taken over the page. Nothing has been torn
   * down — the room's window is still open, `useUserMedia` and the peer call are
   * mounted on this shell, and the streams keep running — so both the arrange step
   * and the finished result keep the faces on screen instead of dropping them the
   * moment the work moves off the camera. Shrunk to a rail on desktop; a single
   * line of chrome above the strip on a phone.
   */
  const cameraRail = (note: string) => (
    <div className={styles.arrangeCamera}>
      <span className={styles.railLabel}>{t('select.stillLive')}</span>
      {/* The rail is a 13.25rem column on desktop, so four stacked tiles would run off
       * the bottom — from three cameras up it wraps into two columns instead. */}
      <div
        className={cn(styles.arrangeVideos, stagePeerIds.length >= 2 && styles.arrangeVideosWrap)}
      >
        <div
          className={styles.tileSmall}
          style={{
            aspectRatio: String(tileAspect),
            maxWidth: capTileHeight(RAIL_TILE_MAX_HEIGHT, 1, 1),
          }}
        >
          <VideoPreview videoRef={localVideoRef} compact />
          <CountdownOverlay />
        </div>
        {stagePeerIds.map((socketId) => (
          <div
            key={socketId}
            className={styles.tileSmall}
            style={{
              aspectRatio: String(tileAspect),
              maxWidth: capTileHeight(RAIL_TILE_MAX_HEIGHT, 1, 1),
            }}
          >
            <PeerVideo socketId={socketId} videoRef={peerRefFor(socketId)} compact />
            <CountdownOverlay />
          </div>
        ))}
      </div>
      {/* Phone-only gloss: on the narrow layout the rail collapses into a
       * single strip of chrome, and the label above is hidden. */}
      <span className={styles.arrangeInlineNote}>{t('select.camerasLive')}</span>
      <MediaControls mode={mode} compact />
      <p className={styles.arrangeNote}>{note}</p>
    </div>
  )

  if (status === 'idle' || status === 'requesting') {
    return (
      <div className={styles.status}>
        <Loader2 className={styles.spinner} />
        <p className={styles.statusMessage}>{t('camera.requesting')}</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className={styles.status}>
        <CameraOff className={styles.statusIcon} />
        <h2 className={styles.statusTitle}>
          {error ? t(`mediaError.${error}.title`) : t('camera.unavailable')}
        </h2>
        <p className={styles.statusMessage}>{error && t(`mediaError.${error}.message`)}</p>
        <Button onClick={retry}>{t('common.tryAgain')}</Button>
      </div>
    )
  }

  // Result screen once the user has confirmed which shots go on the strip. Same
  // shell as the arrange step: the cameras hold their place on the left while the
  // finished strip takes the page, so the room doesn't go dark on the one screen
  // people linger on.
  if (showResult) {
    return (
      <div className={styles.stage}>
        <div className={styles.arrange}>
          {cameraRail(t('result.stillLiveNote'))}
          <div className={styles.arrangePanel}>
            <StripResult onRetake={retakeAll} />
          </div>
        </div>
      </div>
    )
  }

  // Arrange step: shown once the full sequence is captured. The camera shrinks to a
  // rail on the left so participants can keep talking while the strip takes over the
  // page. A single-shot retake leaves this view and returns to the booth body below
  // (isCapturing + retakeSlot), then comes back here when it finishes.
  if (showArrange) {
    return (
      <div className={styles.stage}>
        <div className={styles.arrange}>
          {cameraRail(t('select.stillLiveNote'))}

          <div className={styles.arrangePanel}>
            <StripSelector
              onRetake={retakeAll}
              onRetakeShot={retakeShot}
              retakingSlot={retakingSlot}
              blockedReason={retakeBlockedReason}
              shotBlockedReason={retakeShotBlockedReason}
            />
          </div>
        </div>

        <canvas ref={canvasRef} className={styles.hiddenCanvas} />
      </div>
    )
  }

  // Booth body: cameras are live and own the page; everything that isn't a face
  // reads as a margin note. The host starts the session; the guest waits.
  return (
    <div className={styles.stage}>
      <div className={styles.booth}>
        <header className={styles.stageHead}>
          <h1 className={styles.headline}>
            {t('capture.headlineTop')}
            <br />
            {t('capture.headlineBottom')}
          </h1>
          <p className={styles.headlineNote}>{line('capture.headlineNote')}</p>
        </header>

        <div className={styles.stageBody}>
          {/* Laid out as the cut's own grid — same columns, same rows, same cell
           * aspect — so the stage is a full-size preview of the frame about to be
           * taken, not just a row of cameras that happen to be on. */}
          <div
            className={cn(styles.videos, stagePeerIds.length > 0 && styles.videosMulti)}
            style={{
              gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
              maxWidth: capTileHeight(STAGE_TILE_MAX_HEIGHT, grid.cols, grid.rows),
            }}
          >
            <div className={styles.tile} style={{ aspectRatio: String(tileAspect) }}>
              <VideoPreview videoRef={localVideoRef} showMic={mode !== 'solo'} />
              <CountdownOverlay />
            </div>
            {stagePeerIds.map((socketId, index) => (
              <div
                key={socketId}
                className={styles.tile}
                style={{ aspectRatio: String(tileAspect) }}
              >
                <PeerVideo
                  socketId={socketId}
                  videoRef={peerRefFor(socketId)}
                  index={index + 1}
                  total={stagePeerIds.length}
                />
                <CountdownOverlay />
              </div>
            ))}
          </div>

          {/* Desktop-only: the toggles sit under the stage. On a phone they ride in
           * the action bar at the bottom of the screen instead. */}
          <div className={styles.stageControls}>
            <MediaControls mode={mode} />
            <span className={styles.liveNote}>{line('capture.liveNote')}</span>
          </div>
        </div>

        {/* The picker stays put through capture — it locks itself while shots are in
         * flight, so what you chose is still legible without the rail emptying out
         * mid-sequence.
         *
         * It comes *before* the strip in the markup because that's the order a phone
         * reads it in: the stack runs top to bottom, and a full-height preview of an
         * empty strip between the cameras and the template chooser pushed the first
         * decision below the fold — you scrolled past the result to reach its cause.
         * Choices first, then what they produce. The wide layout is unaffected: it
         * places both by grid area, so markup order doesn't move them. */}
        <aside className={styles.rail}>
          <TemplatePicker />
          <div className={styles.startBlock}>
            {isHost && startButton}
            {startNote}
          </div>
        </aside>

        {/* The strip being built, in the chosen template, with the live camera in
         * the slot that's up next — so the crop the strip will take is visible
         * while there's still time to move. Stays on screen during capture. */}
        <div className={styles.stripColumn}>
          <StripPreview />
        </div>

        {/* Phone action bar: pinned to the bottom of the viewport so the two things
         * you actually press are always in reach. Stays through capture, where the
         * button becomes the progress readout. */}
        <div className={styles.actionBar} data-booth-actions>
          <MediaControls mode={mode} fluid />
          {isHost && startButton}
          {(isCapturing || !isHost) && startNote}
        </div>
      </div>

      <canvas ref={canvasRef} className={styles.hiddenCanvas} />
    </div>
  )
}
