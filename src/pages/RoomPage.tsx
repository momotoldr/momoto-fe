import { HelpCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { CameraStage } from '@/features/media/CameraStage'
import { BoothTips } from '@/features/room/BoothTips'
import { RoomLobby } from '@/features/room/RoomLobby'
import { RoomStatus } from '@/features/room/RoomStatus'
import { useBoothDraft } from '@/hooks/useBoothDraft'
import { useRoom } from '@/hooks/useRoom'
import { useSessionTimer } from '@/hooks/useSessionTimer'
import { useStripSync } from '@/hooks/useStripSync'
import { cn } from '@/lib/utils'
import { usePhotosStore } from '@/store/usePhotosStore'
import { useRoomStore } from '@/store/useRoomStore'
import { useSessionStore } from '@/store/useSessionStore'
import { useStripStore } from '@/store/useStripStore'
import { useTipsStore } from '@/store/useTipsStore'
import { SocketEvents } from '@/types/events'

import { boothDraftId, deleteBoothDraft } from '@/utils/boothDraftDb'
import { formatTime } from '@/utils/common'
import { resolveSessionMode } from '@/utils/rooms'
import { getSocket } from '@/utils/socket'
import styles from './RoomPage.module.scss'

function Notice({ message }: { message: string }) {
  return (
    <div className={styles.notice}>
      <Loader2 className={styles.noticeSpinner} />
      <p>{message}</p>
    </div>
  )
}

export function RoomPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { roomId } = useParams<{ roomId: string }>()
  const [searchParams] = useSearchParams()
  const mode = resolveSessionMode(searchParams.get('mode'))
  // Set once the user confirms leaving, so the blocker lets the replace-navigation
  // through instead of re-prompting.
  const bypassBlockRef = useRef(false)
  const [finishOpen, setFinishOpen] = useState(false)

  // Everything but solo runs through the server — a group room needs the socket for
  // exactly the same reasons a date room does.
  useRoom(roomId ?? '', { connect: mode !== 'solo' })
  useStripSync()
  // Keeps a recovery copy of the shots taken here, and puts them back if this person
  // was interrupted mid-session and has come back to the same room.
  useBoothDraft(mode, roomId ?? '')
  const status = useRoomStore((state) => state.status)
  const roomFull = useRoomStore((state) => state.roomFull)
  const roomEnded = useRoomStore((state) => state.roomEnded)
  const roomMissing = useRoomStore((state) => state.roomMissing)
  const isHost = useRoomStore((state) => state.isHost)
  const peerIds = useRoomStore((state) => state.peerIds)
  const capacity = useRoomStore((state) => state.capacity)
  const secondsLeft = useSessionStore((state) => state.secondsLeft)
  const ended = useSessionStore((state) => state.ended)
  const selection = usePhotosStore((state) => state.selection)
  // Set by whichever booth screen is up (`useBoothStage`); null on the terminal
  // screens, where there is nothing to coach anyone through.
  const tipsStage = useTipsStore((state) => state.stage)
  const openTips = useTipsStore((state) => state.openTips)

  // Run the session clock at the room level so it keeps ticking through the lobby.
  // The window itself is server-authoritative for date rooms (the backend decides
  // and broadcasts `endsAt`, and retires the code at expiry); solo runs locally.
  useSessionTimer(mode)

  // A finished strip (created via "Create strip") is on screen. In SOLO mode
  // (offline/personal) we don't cut it off when time runs out — the strip stays
  // viewable/downloadable past 0:00. In a DATE room the session window is a shared,
  // server-authoritative timer, so when it ends everyone is closed out immediately
  // regardless (download before time's up) — otherwise a peer viewing a result would
  // sit in a dead room until they reloaded.
  const resultShowing = selection.length > 0
  const keepResult = mode === 'solo' && resultShowing

  // True once the booth's session window is running — i.e. both people arrived and the
  // clock started. From that moment this tab may hold captured frames that exist
  // nowhere else, so nothing below is allowed to tear the booth down over a connection
  // problem: whoever is here finishes their strip.
  const sessionStarted = useSessionStore((state) => state.endsAt !== null)

  // Can't reach the server for a date room — nothing to join or sync (only fires in
  // date mode; solo never connects). `useRoom` only flips to 'error' after a grace
  // window of retries, so a slow network shows the join loader below first.
  //
  // All three refusals below are *join* failures, so they only stand before the
  // session starts. Once it's running they mean a **rejoin** was refused — a blip, a
  // server restart, a room that filled up again — and the booth stays put (degraded to
  // offline) rather than discarding the photos already taken.
  const connectionError = mode !== 'solo' && status === 'error' && !sessionStarted
  const joinRefusedFull = roomFull && !sessionStarted
  const joinRefusedMissing = roomMissing && !sessionStarted

  // A slow network can keep us in the "connecting / joining" state (isHost === null)
  // for a while. After a short delay we soften the copy to reassure the user we're still
  // trying, rather than leaving them on a bare spinner or bailing to the error screen.
  const [slowJoin, setSlowJoin] = useState(false)
  useEffect(() => {
    if (isHost !== null) {
      setSlowJoin(false)
      return
    }
    const id = window.setTimeout(() => setSlowJoin(true), 5000)
    return () => window.clearTimeout(id)
  }, [isHost])

  // Confirm before leaving while a session is live (booth / lobby / result on
  // screen) — nothing to lose on the terminal "can't connect" / "not found" /
  // "time's up" / "room full" / "closed" screens. A finished strip stays viewable
  // once ended. Applies to guests too (the booth is public), not just signed-in users.
  const shouldConfirmLeave =
    !connectionError &&
    !joinRefusedMissing &&
    !joinRefusedFull &&
    !((ended || roomEnded) && !keepResult)

  // Closing the booth is the host's call alone: they end it for everyone with
  // "Finish" (the room is retired server-side, so the guest is closed out too).
  // A guest is deliberately given no way out of a shared session — that's why the
  // room bar carries no Leave button.
  const canFinish = isHost === true && shouldConfirmLeave

  // Intercept every in-app navigation away from the room ("Back home", the AppBar
  // logo, browser back) so we can confirm first.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      shouldConfirmLeave &&
      !bypassBlockRef.current &&
      currentLocation.pathname !== nextLocation.pathname
  )

  // The session is over (its window elapsed, or the host closed the room): there is
  // nothing left to come back to, so the recovery copy is retired with it.
  useEffect(() => {
    if (!ended && !roomEnded) return
    void deleteBoothDraft(boothDraftId(mode, roomId ?? '')).catch(() => undefined)
  }, [ended, roomEnded, mode, roomId])

  // Reset in-memory session/setup on leave. The captured frames belong to the *room*,
  // not to the booth view, so they are cleared here with everything else rather than
  // by `CameraStage` unmounting. That distinction matters: CameraStage comes and goes
  // within a live session (a terminal screen taking over, StrictMode's remount in
  // dev), and when it did the clearing, a remount landing after the draft had been
  // restored wiped the recovered shots — and the "frames were discarded" rule then
  // deleted the draft behind them, leaving someone who rejoined stuck at 0 of 4.
  useEffect(
    () => () => {
      usePhotosStore.getState().reset()
      useStripStore.getState().reset()
      useSessionStore.getState().reset()
      // Which tips have been read is session state too: the next booth run is walked
      // through from the top rather than picking up where this one's reading left off.
      useTipsStore.getState().reset()
    },
    []
  )

  // Warn on tab close / refresh mid-session (the browser shows its native prompt;
  // a custom dialog can't render during unload).
  useEffect(() => {
    if (!shouldConfirmLeave) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [shouldConfirmLeave])

  // Replace the room's history entry so the browser Back button can't return to
  // (and silently re-create) the room the user just left. We deliberately keep the
  // persisted session (endsAt) so rejoining the same code before it expires resumes
  // the remaining time instead of restarting the 3 minutes. (An expired room is
  // refused server-side, so there's nothing to clear.)
  const confirmLeave = () => {
    // The recovery copy deliberately survives this. Leaving doesn't end the session —
    // the room stays open for the rest of its window and the code still works — so the
    // shots are kept for a return, exactly as they are when someone's tab dies. Wiping
    // them here would make the two ways out behave differently for no reason a person
    // could see: close the tab and your strip comes back, press Back and it's gone.
    // The draft dies with the *session* (the effect above), not with the exit.
    bypassBlockRef.current = true
    blocker.reset?.()
    navigate(ROUTES.photobooth, { replace: true })
  }

  // Host-only "Finish": retire the room on the server first, so the guest is dropped
  // onto the "room closed" screen instead of being stranded in a room nobody is
  // running any more. Solo has no server-side room to retire. Emitting before the
  // navigation unmounts us (and `useRoom` disconnects) keeps the packet on the wire.
  // Host opens the session window in a group room. The server checks it is really the
  // host and that at least two people are present, so this is only the affordance.
  const openSession = () => {
    const socket = getSocket()
    if (socket.connected) socket.emit(SocketEvents.sessionOpen)
  }

  const confirmFinish = () => {
    setFinishOpen(false)
    if (mode !== 'solo' && roomId) {
      const socket = getSocket()
      if (socket.connected) socket.emit(SocketEvents.sessionEnd, roomId)
    }
    confirmLeave()
  }

  const renderBody = () => {
    if (isHost === null)
      return <Notice message={t(slowJoin ? 'room.connectingSlow' : 'room.connecting')} />
    // Time's up wins over the lobby: once the session has ended, never fall back
    // to "waiting for a friend" (e.g. after a peer leaves at expiry).
    if (ended && !keepResult) {
      return (
        <div className={styles.roomFull}>
          <h2 className={styles.roomFullTitle}>{t('room.timesUp')}</h2>
          <p className={styles.roomFullMessage}>{t('room.sessionEnded')}</p>
          <Button asChild>
            <Link to={ROUTES.photobooth} replace>
              {t('common.backHome')}
            </Link>
          </Button>
        </div>
      )
    }
    // The host waits in the lobby; the booth (with the cameras and the session timer)
    // opens when the session does. What ends the wait differs by mode: a date room
    // starts itself the moment the second person arrives, so the lobby ends when the
    // guest shows up, while a group room waits for the host to press Start — there is
    // no arrival that means "everyone is here" when the room seats four.
    //
    // Only *before* the session starts, either way. If someone drops out mid-session —
    // closed the tab, lost their connection — falling back to the lobby would unmount
    // the booth and take the frames already captured with it. The session keeps running
    // instead: whoever is left carries on, finishes their strip, and the room stays open
    // on the same code for the other person to return.
    //
    // Guests never see it. They land straight in the booth and wait there, which is
    // where the cameras are — the wait is more useful spent framing yourself.
    const waitingToStart = mode === 'group' ? !sessionStarted : peerIds.length === 0
    if (isHost && mode !== 'solo' && waitingToStart && !sessionStarted) {
      return (
        <RoomLobby
          roomId={roomId ?? ''}
          mode={mode}
          present={peerIds.length + 1}
          capacity={capacity}
          onStart={openSession}
        />
      )
    }
    return <CameraStage mode={mode} />
  }

  return (
    <main className={styles.page}>
      {/* Room bar: identity (code + who's here) on the left, the clock and the way
       * out on the right. The Momoto mark is deliberately absent — the global
       * AppBar above already carries it. */}
      <header className={styles.header}>
        <div className={styles.identity}>
          <h1 className={styles.title}>{t('room.booth')}</h1>
          {mode === 'solo' ? (
            <p className={styles.roomCode}>{t('room.soloSession')}</p>
          ) : (
            <>
              <p className={styles.roomCode}>
                <span className={styles.roomCodeLabel}>{t('room.roomCodeLabel')}</span>
                <span className={styles.code}>{roomId}</span>
              </p>
              <RoomStatus />
            </>
          )}
        </div>
        <div className={styles.headerActions}>
          {secondsLeft !== null && (
            <span className={styles.timer}>
              <span className={styles.timerLabel}>{t('room.timerLabel')}</span>
              <span className={cn(styles.timerValue, secondsLeft <= 30 && styles.timerLow)}>
                {formatTime(secondsLeft)}
              </span>
            </span>
          )}
          {/* Way back to the tips for the screen you're on. They introduce themselves
           * once per screen and then get out of the way, so this is how anyone who
           * dismissed them — or has been here before — asks again. */}
          {tipsStage && (
            <Button
              variant="ghost"
              size="sm"
              className={styles.tipsButton}
              data-booth-tips-trigger
              onClick={openTips}
              aria-label={t('tips.open')}
            >
              <HelpCircle className={styles.tipsIcon} />
              <span className={styles.tipsLabel}>{t('tips.button')}</span>
            </Button>
          )}
          {canFinish && (
            <Button variant="outline" onClick={() => setFinishOpen(true)}>
              {t('room.finish')}
            </Button>
          )}
        </div>
      </header>

      <div className={styles.body}>
        {connectionError ? (
          <div className={styles.roomFull}>
            <h2 className={styles.roomFullTitle}>{t('room.connectFailedTitle')}</h2>
            <p className={styles.roomFullMessage}>
              {mode === 'group'
                ? t(['room.connectFailedMessageGroup', 'room.connectFailedMessage'])
                : t('room.connectFailedMessage')}
            </p>
            <Button asChild>
              <Link to={ROUTES.photobooth} replace>
                {t('common.backHome')}
              </Link>
            </Button>
          </div>
        ) : joinRefusedMissing ? (
          <div className={styles.roomFull}>
            <h2 className={styles.roomFullTitle}>{t('room.notFoundTitle')}</h2>
            <p className={styles.roomFullMessage}>{t('room.notFoundMessage')}</p>
            <Button asChild>
              <Link to={ROUTES.photobooth} replace>
                {t('common.backHome')}
              </Link>
            </Button>
          </div>
        ) : joinRefusedFull ? (
          <div className={styles.roomFull}>
            <h2 className={styles.roomFullTitle}>{t('room.roomFullTitle')}</h2>
            <p className={styles.roomFullMessage}>{t('room.roomFullMessage')}</p>
            <Button asChild>
              <Link to={ROUTES.photobooth} replace>
                {t('common.backHome')}
              </Link>
            </Button>
          </div>
        ) : roomEnded && !keepResult ? (
          <div className={styles.roomFull}>
            <h2 className={styles.roomFullTitle}>{t('room.roomClosedTitle')}</h2>
            <p className={styles.roomFullMessage}>{t('room.roomClosedMessage')}</p>
            <Button asChild>
              <Link to={ROUTES.photobooth} replace>
                {t('common.backHome')}
              </Link>
            </Button>
          </div>
        ) : (
          renderBody()
        )}
      </div>

      <BoothTips mode={mode} />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('room.leaveDialog.title')}
        description={t('room.leaveDialog.description')}
        confirmLabel={t('room.leaveDialog.confirm')}
        cancelLabel={t('room.leaveDialog.cancel')}
        destructive
        onConfirm={confirmLeave}
        onCancel={() => blocker.reset?.()}
      />

      <ConfirmDialog
        open={finishOpen}
        title={t('room.finishDialog.title')}
        description={t(
          mode === 'solo'
            ? 'room.finishDialog.descriptionSolo'
            : mode === 'group'
              ? ['room.finishDialog.descriptionGroup', 'room.finishDialog.description']
              : 'room.finishDialog.description'
        )}
        confirmLabel={t('room.finishDialog.confirm')}
        cancelLabel={t('room.finishDialog.cancel')}
        destructive
        onConfirm={confirmFinish}
        onCancel={() => setFinishOpen(false)}
      />
    </main>
  )
}
