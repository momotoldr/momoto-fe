import { useCallback, useEffect, useState } from 'react'

import { unlockAudio } from '@/utils/countdownAudio'
import { usePeerStore } from '@/store/usePeerStore'
import { usePhotosStore } from '@/store/usePhotosStore'
import { useRoomStore } from '@/store/useRoomStore'

import { SocketEvents, type CountdownStartPayload, type RetakeStartPayload } from '@/types/events'
import { getSocket } from '@/utils/socket'

/**
 * Listens for the server's synchronized `countdown-start` and begins the local
 * capture sequence at the shared instant (adjusted by the clock offset). Also
 * exposes `startSession`, which asks the server to broadcast the start — or, if
 * no server is connected, runs the sequence locally (solo mode).
 */
/**
 * How many cameras the run about to start will be laid out for: ourselves plus every
 * peer whose stream has actually arrived.
 *
 * Counted from live streams rather than from room membership, so the grid matches the
 * tiles on screen — someone who is in the room but whose call hasn't connected has no
 * picture to put in a cell. Solo has no peers and comes out as one.
 */
function tileCount(): number {
  const { peerIds } = useRoomStore.getState()
  const { peers } = usePeerStore.getState()
  return 1 + peerIds.filter((id) => peers[id]?.stream).length
}

/** Everyone in the room as the run begins — the cast the strip belongs to. */
function memberCount(): number {
  return 1 + useRoomStore.getState().peerIds.length
}

/**
 * How long a start or a retake can sit unanswered before its button comes back.
 *
 * Both are round trips — the server answers the room with `countdown-start` /
 * `session:retake-start` and the shots only begin `START_DELAY_MS` after that — so a
 * press is over a second away from anything visible, longer on a bad connection. That
 * gap is what gets pressed again, and every extra press is another broadcast that
 * *reschedules* the count for the whole room: spamming it doesn't start the shots
 * sooner, it keeps pushing them away. A repeated retake is worse still, because the
 * broadcasts can name different slots — press 1 then 2 and only slot 2 is re-shot, the
 * first press dropped without a word.
 *
 * So a press is held pending until the shots actually begin. This is the release valve
 * for the case where they never do — a dropped emit, a peer whose strip is already
 * finalized — because a button held on a reply that isn't coming is worse than one that
 * can be pressed twice. Well past a real round trip: the fallback should look like a
 * failure, not like an impatient network.
 */
const ACK_TIMEOUT_MS = 8000

export function useCountdownSync() {
  /**
   * A start has been asked for and the room hasn't begun shooting yet — the window
   * between the emit and `isCapturing`, which is the only time the Start button is
   * both live and useless to press.
   */
  const [starting, setStarting] = useState(false)
  /**
   * The same window for a single-slot retake, carrying *which* slot was asked for: the
   * strip shows a control per slot, and only the one that was pressed should read as
   * busy.
   */
  const [retakingSlot, setRetakingSlot] = useState<number | null>(null)
  const isCapturing = usePhotosStore((state) => state.isCapturing)
  const retakeSlot = usePhotosStore((state) => state.retakeSlot)

  // The run began — whichever press got there first, this one is answered.
  useEffect(() => {
    if (isCapturing) setStarting(false)
  }, [isCapturing])

  // Same for the retake: the slot is being re-shot, so the wait is over. Not compared
  // against the slot we asked for — the run that arrives is the room's, and if the host
  // somehow landed on a different one it is still the one being shot.
  useEffect(() => {
    if (retakeSlot !== null) setRetakingSlot(null)
  }, [retakeSlot])

  // Nothing came back. Give the buttons up rather than leaving someone with a spinner
  // and no way to try again; a socket that went down on the way is the common case, and
  // the booth's own offline hold takes over from here.
  useEffect(() => {
    if (!starting && retakingSlot === null) return
    const socket = getSocket()
    const release = () => {
      setStarting(false)
      setRetakingSlot(null)
    }
    const timer = window.setTimeout(release, ACK_TIMEOUT_MS)
    socket.on('disconnect', release)
    return () => {
      window.clearTimeout(timer)
      socket.off('disconnect', release)
    }
  }, [starting, retakingSlot])

  useEffect(() => {
    const socket = getSocket()
    let timer: number | undefined

    /**
     * True once this client has finalized its own strip. From that moment the room's
     * shared capture broadcasts stop applying to it: whoever is looking at a finished
     * strip keeps it, whatever the other person does next.
     *
     * The host is given no way to trigger any of these while the peer has created (the
     * controls are hidden / held — see StripSelector and StripResult), so this is the
     * backstop for the case where that knowledge has gone stale: a dropped connection
     * drops that peer's entry from `createdPeers` on the other side, and it is only put
     * back when they re-announce on rejoin. Without this, a blip is enough for a host to reset
     * someone out of a strip they had already committed.
     */
    const hasFinalizedStrip = () => usePhotosStore.getState().selection.length > 0

    /**
     * Fewer people are in the room than this strip's cuts were laid out for.
     *
     * The host's Retake button is already held in this case, so this is the backstop for
     * the case where their knowledge has gone stale — they are a moment behind on who
     * left, or their own view of the room differs from ours. Re-shooting one slot with
     * the pinned grid would put a black cell where the missing person was, and a strip
     * where one cut has a hole in it is worse than the cut it was meant to replace.
     *
     * It holds the whole-strip retake as well as a single slot: that one discards four
     * good cuts for everyone still here, which is a lot to lose over an absence that is
     * often just a reconnect. A *fresh* capture the host starts deliberately isn't
     * guarded — that re-pins the grid to whoever is present, and it is a deliberate act
     * rather than something arriving from someone else's stale view of the room.
     */
    const present = () => {
      const { peerIds, selfId } = useRoomStore.getState()
      // Solo has no room and no pinned cast.
      return selfId === null ? null : peerIds.length + 1
    }
    /** Fewer people here than this strip was shot with. */
    const castBelow = () => {
      const here = present()
      return here !== null && here < usePhotosStore.getState().captureMembers
    }
    /** The room's cast differs from the strip's, in either direction. */
    const castDiffers = () => {
      const here = present()
      return here !== null && here !== usePhotosStore.getState().captureMembers
    }

    const onCountdownStart = ({ startAt }: CountdownStartPayload) => {
      // A fresh capture is starting — nobody's old finalized strip holds any more.
      useRoomStore.getState().clearCreatedPeers()
      if (hasFinalizedStrip()) return
      const { clockOffset } = useRoomStore.getState()
      const startAtLocal = startAt - clockOffset
      const delay = Math.max(0, startAtLocal - Date.now())
      window.clearTimeout(timer)
      const tiles = tileCount()
      const members = memberCount()
      timer = window.setTimeout(() => usePhotosStore.getState().startCapture(tiles, members), delay)
    }

    // Host pressed "Retake all" — drop back to the pre-capture booth in sync. Their
    // own strip is gone either way; ours only follows if we hadn't finished one.
    const onSessionReset = () => {
      useRoomStore.getState().clearCreatedPeers()
      if (hasFinalizedStrip()) return
      // Same backstop as a single-slot retake, and it matters more here: this one throws
      // away every cut we have. A host a moment behind on who left doesn't get to spend
      // our strip on it.
      // Only the *fewer* direction. A room that has gained someone should absolutely be
      // able to start over — that is how the newcomer gets into the strip.
      if (castBelow()) return
      usePhotosStore.getState().reset()
    }

    // Host re-shot a single slot — both peers drop to the camera session page and
    // re-capture their own frame for that slot at the shared instant.
    const onRetakeStart = ({ slot, startAt }: RetakeStartPayload) => {
      if (hasFinalizedStrip()) return
      // Either direction: a slot re-shot now wouldn't match the cuts beside it.
      if (castDiffers()) return
      const { clockOffset } = useRoomStore.getState()
      const delay = Math.max(0, startAt - clockOffset - Date.now())
      window.clearTimeout(timer)
      timer = window.setTimeout(() => usePhotosStore.getState().startRetake(slot), delay)
    }

    socket.on(SocketEvents.countdownStart, onCountdownStart)
    socket.on(SocketEvents.sessionReset, onSessionReset)
    socket.on(SocketEvents.sessionRetakeStart, onRetakeStart)
    return () => {
      socket.off(SocketEvents.countdownStart, onCountdownStart)
      socket.off(SocketEvents.sessionReset, onSessionReset)
      socket.off(SocketEvents.sessionRetakeStart, onRetakeStart)
      window.clearTimeout(timer)
    }
  }, [])

  const startSession = useCallback(() => {
    unlockAudio()
    const socket = getSocket()
    if (socket.connected) {
      // Pending from here until the count actually starts. A second press in that
      // window would re-broadcast the start and move everyone's countdown further
      // away, so the button is held rather than merely ignored — see
      // START_ACK_TIMEOUT_MS.
      setStarting(true)
      socket.emit(SocketEvents.sessionStart)
    } else {
      // No server reachable — run the sequence locally (solo mode). Nothing to wait
      // on: this flips `isCapturing` on the spot.
      usePhotosStore.getState().startCapture(tileCount(), memberCount())
    }
  }, [])

  // "Retake all": discard the strip locally and, in a live room, tell the guest
  // to drop back to the booth too so both re-shoot together.
  const retakeAll = useCallback(() => {
    usePhotosStore.getState().reset()
    const socket = getSocket()
    if (socket.connected) socket.emit(SocketEvents.sessionReset)
  }, [])

  // Single-shot retake: in a live room ask the server to broadcast a synced start
  // (so the guest re-shoots the same slot with the host); solo mode runs locally.
  const retakeShot = useCallback((slot: number) => {
    unlockAudio()
    const socket = getSocket()
    if (socket.connected) {
      // Pending until the slot is actually being re-shot — see ACK_TIMEOUT_MS. The
      // strip's other retake controls are held on this too: two presses in the window
      // are two broadcasts, and the room only ever re-shoots the last slot named.
      setRetakingSlot(slot)
      socket.emit(SocketEvents.sessionRetake, { slot })
    } else {
      // Solo: nothing to wait on, `startRetake` lands on the spot.
      usePhotosStore.getState().startRetake(slot)
    }
  }, [])

  return { startSession, starting, retakeAll, retakeShot, retakingSlot }
}
