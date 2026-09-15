import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { notifySessionExpired, refreshAccessToken } from '@/api/client/axiosClient'
import i18n from '@/lib/i18n'
import { useNetworkStore } from '@/store/useNetworkStore'
import { usePhotosStore } from '@/store/usePhotosStore'
import { useRoomStore } from '@/store/useRoomStore'
import { useServerStore } from '@/store/useServerStore'
import { useSessionStore } from '@/store/useSessionStore'

import {
  SocketEvents,
  type RoomJoinedPayload,
  type RoomMembersPayload,
  type TimeSyncResPayload,
} from '@/types/events'
import { getSocket } from '@/utils/socket'

/**
 * How long to keep retrying a date-room connection before surfacing the terminal
 * "can't reach the server" screen. Socket.io reconnects on its own within this window,
 * so a slow network or a brief outage recovers into the room instead of erroring out.
 * Long enough that reaching the end of it is evidence of *something*, but not of what:
 * see the grace timer below for why that lands on `unknown` rather than `down`.
 */
const CONNECT_GRACE_MS = 15_000

/**
 * A room toast, worded for the size of the room.
 *
 * "Your friend dropped out" is exactly right for two people and wrong for four, where
 * the person who left is one of several. The room's own capacity decides it — no need to
 * thread the mode down here — and a key with no group variant falls back to the one it
 * has.
 */
function roomLine(key: string): string {
  const { capacity } = useRoomStore.getState()
  return capacity !== null && capacity > 2 ? i18n.t([`${key}Group`, key]) : i18n.t(key)
}

/**
 * Connects to the socket server and joins `roomId` for the lifetime of the
 * component, tracking presence + a clock offset in the room store. Disconnects
 * on unmount.
 *
 * Only date mode connects (`connect: true`); solo runs fully offline. A date room is
 * meaningless without the server (no peer can join, nothing syncs), so a connection
 * failure surfaces as status 'error' — it does **not** silently drop the user into a
 * dead room as a local host. Socket.io keeps retrying, so a transient outage recovers
 * on its own once the server is back.
 */
export function useRoom(roomId: string, options: { connect?: boolean } = {}) {
  const connect = options.connect ?? true

  // Guards for re-authenticating the socket handshake: refresh the access token at
  // most once per connection streak (reset on a successful connect) so an expired
  // token can't spin an endless refresh → reconnect loop.
  const refreshingRef = useRef(false)
  const authRetriedRef = useRef(false)
  // Grace window before a slow/flaky connection is treated as a hard failure — Socket.io
  // keeps retrying underneath, so we let the join loader ride out a transient outage
  // instead of bailing to the terminal "can't reach the server" screen on the first miss.
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Solo mode: no server needed — act as host locally.
    if (!connect) {
      useRoomStore.getState().reset()
      useRoomStore.getState().setHost(true)
      return () => useRoomStore.getState().reset()
    }

    const socket = getSocket()
    useRoomStore.getState().reset()
    useRoomStore.getState().setStatus('connecting')

    // Arm the grace window: if we haven't connected by the time it elapses, give up and
    // flag it. A successful connect clears it (below). Note this is only terminal
    // *before* the booth is live — once a session is running, RoomPage keeps the booth
    // on screen so a dropped connection can't cost someone their photos.
    const armErrorTimer = () => {
      if (errorTimerRef.current) return
      errorTimerRef.current = setTimeout(() => {
        errorTimerRef.current = null
        // Fifteen seconds without a socket is a timeout in all but name, and a timeout
        // is the one signal we've agreed not to read as an outage: a link too slow to
        // finish a handshake produces exactly this. So say `unknown` — still enough for
        // `ServerGate` to bounce the routes that genuinely need a backend — and report
        // it to the quality probe, which is the only thing here that can tell a dead
        // server from a dying connection.
        useServerStore.getState().setStatus('unknown')
        useNetworkStore.getState().reportTrouble()
        useRoomStore.getState().setStatus('error')
        if (useSessionStore.getState().endsAt !== null) {
          toast.warning(i18n.t('status.reconnectingToast'))
        }
      }, CONNECT_GRACE_MS)
    }
    const clearErrorTimer = () => {
      if (!errorTimerRef.current) return
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
    armErrorTimer()

    const onConnect = () => {
      refreshingRef.current = false
      authRetriedRef.current = false
      clearErrorTimer()
      useRoomStore.getState().setStatus('connected')
      socket.emit(SocketEvents.timeSync, Date.now())
      socket.emit(SocketEvents.roomJoin, roomId)
    }
    const onTimeSyncRes = ({ t0, t1 }: TimeSyncResPayload) => {
      const t2 = Date.now()
      // NTP-style offset estimate: serverClock - clientClock.
      useRoomStore.getState().setClockOffset(t1 - (t0 + t2) / 2)
    }
    const onRoomJoined = ({ selfId, members, capacity }: RoomJoinedPayload) => {
      // A retried join landed — clear any refusal left over from an earlier attempt
      // (a rejoin can be refused mid-session and then succeed on the next reconnect).
      useRoomStore.getState().setRoomFull(false)
      useRoomStore.getState().setRoomMissing(false)
      // The list carries presence *and* the host: `members[0]` is whoever joined first.
      useRoomStore.getState().setRoom(roomId, selfId, members, capacity)
    }
    // Membership changed for someone in the room (a join, a reconnect taking its seat
    // back, a leave). The server re-sends the whole list rather than a delta, so this
    // is simply the truth, and who is host follows from it.
    const onRoomMembers = ({ members }: RoomMembersPayload) => {
      useRoomStore.getState().setMembers(members)
    }
    // A refused join leaves us outside the room, so any presence we were showing is
    // stale. Mid-session this is a *rejoin* being refused (the server restarted, say):
    // the booth stays on screen so nobody loses their photos, which makes it all the
    // more important that the status pill stops claiming the friend is still there.
    const onJoinRefused = () => useRoomStore.getState().clearMembers()
    const onRoomFull = () => {
      onJoinRefused()
      useRoomStore.getState().setRoomFull(true)
    }
    const onRoomEnded = () => {
      onJoinRefused()
      useRoomStore.getState().setRoomEnded(true)
    }
    const onRoomNotFound = () => {
      onJoinRefused()
      useRoomStore.getState().setRoomMissing(true)
    }
    // Presence itself comes from `room:members`, which the server sends alongside this.
    // This event is now only the announcement — one arrival, one toast.
    //
    // Arriving mid-sequence stops the run (see `CameraStage`), the same way leaving
    // does, so that the newcomer is in the strip rather than framed on screen and
    // missing from the photo. Say so, or the capture looks like it broke.
    const onPeerJoined = () => {
      const capturing = usePhotosStore.getState().isCapturing
      if (capturing) toast(roomLine('status.friendJoinedCapturing'))
      else toast.success(roomLine('status.friendJoined'))
    }
    const onPeerLeft = () => {
      // Presence and the host both come from `room:members`, which the server sends
      // with this. Nothing is latched here any more: whoever remained used to promote
      // *themselves* to host, which is right in a room of two and wrong in a room of
      // four, where it would hand the title to everyone who stayed.
      //
      // Their finalized strip left with them, so their hold on the host's retake goes
      // too — pruned from `createdPeers` by the membership list that arrives with this.
      // The session deliberately keeps running: the room stays open for the rest of
      // its window, so whoever is left can finish their strip and the other person can
      // come back on the same code if they only dropped out. Mid-capture is the one
      // exception — the booth stops the sequence (see CameraStage), so say that
      // instead of telling someone their photos are safe while they watch them go.
      const capturing = usePhotosStore.getState().isCapturing
      toast(roomLine(capturing ? 'status.friendLeftCapturing' : 'status.friendLeft'))
    }
    // Lost the connection mid-session (flaky network, sleeping laptop). Socket.io
    // reconnects underneath and `onConnect` rejoins the room — the server hands this
    // client its own seat back (handshake `clientId`), so the session picks up where it
    // was. Reflect it as "connecting" so the room's status pill is honest meanwhile.
    const onDisconnect = (reason: string) => {
      // A socket that died on its own, mid-session, is the clearest evidence of a bad
      // link this app ever gets — and during a session it's often the *only* traffic,
      // so without this a connection could rot through a whole shoot unremarked. Our
      // own teardown (`io client disconnect`) and a server-side kick are not that.
      if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
        useNetworkStore.getState().reportTrouble()
      }
      if (useRoomStore.getState().status === 'connected')
        useRoomStore.getState().setStatus('connecting')
      armErrorTimer()
    }
    const onConnectError = (err: Error) => {
      // Handshake rejected for auth (expired/missing access token): refresh once and
      // reconnect with the fresh token — the same recovery HTTP 401s get. Give up
      // (session-expired → toast + sign-out) only if the refresh itself fails.
      if (err.message === 'unauthorized') {
        if (refreshingRef.current) return
        if (authRetriedRef.current) {
          // Already refreshed once and still rejected → the session is truly gone.
          notifySessionExpired()
          return
        }
        refreshingRef.current = true
        authRetriedRef.current = true
        void refreshAccessToken().then((token) => {
          refreshingRef.current = false
          if (token) socket.connect()
          else notifySessionExpired()
        })
        return
      }
      // No server (yet). Date mode needs it, but Socket.io keeps retrying, so don't
      // bail on the first miss — keep showing the join loader and let the grace timer
      // decide. If the window elapses still disconnected it flags the server status as
      // `unknown` (ServerGate → server-down page) and marks the room errored; a
      // reconnect before then recovers silently. We never fake a local host in a dead
      // room.
      armErrorTimer()
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on(SocketEvents.timeSyncRes, onTimeSyncRes)
    socket.on(SocketEvents.roomJoined, onRoomJoined)
    socket.on(SocketEvents.roomMembers, onRoomMembers)
    socket.on(SocketEvents.roomFull, onRoomFull)
    socket.on(SocketEvents.roomEnded, onRoomEnded)
    socket.on(SocketEvents.roomNotFound, onRoomNotFound)
    socket.on(SocketEvents.peerJoined, onPeerJoined)
    socket.on(SocketEvents.peerLeft, onPeerLeft)
    socket.on('connect_error', onConnectError)

    socket.connect()

    return () => {
      clearErrorTimer()
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off(SocketEvents.timeSyncRes, onTimeSyncRes)
      socket.off(SocketEvents.roomJoined, onRoomJoined)
      socket.off(SocketEvents.roomMembers, onRoomMembers)
      socket.off(SocketEvents.roomFull, onRoomFull)
      socket.off(SocketEvents.roomEnded, onRoomEnded)
      socket.off(SocketEvents.roomNotFound, onRoomNotFound)
      socket.off(SocketEvents.peerJoined, onPeerJoined)
      socket.off(SocketEvents.peerLeft, onPeerLeft)
      socket.off('connect_error', onConnectError)
      socket.disconnect()
      useRoomStore.getState().reset()
    }
  }, [roomId, connect])
}
