import { useEffect } from 'react'

import { SESSION_SECONDS, useSessionStore } from '@/store/useSessionStore'
import { useRoomStore } from '@/store/useRoomStore'
import { SocketEvents, type SessionWindowPayload } from '@/types/events'
import { getSocket } from '@/utils/socket'
import type { SessionMode } from '@/types/roomsType'

/**
 * Drives the booth session countdown, mounted at the room level so the clock keeps
 * ticking across every step (lobby included).
 *
 * The session window is **server-authoritative** for a live (date) room: the backend
 * decides `endsAt` when both people are present and broadcasts `session:window`
 * (re-sent on rejoin, so returning before expiry resumes the remaining time), and it
 * retires the room's code when the window elapses. The client just renders the
 * countdown from that timestamp (converted from server time via the clock offset).
 *
 * Solo mode never connects to a server, so it runs a purely local window.
 */
export function useSessionTimer(mode: SessionMode) {
  // Tick every second for the lifetime of the room (a no-op until a window exists).
  useEffect(() => {
    const interval = window.setInterval(() => useSessionStore.getState().tick(), 1000)
    return () => window.clearInterval(interval)
  }, [])

  // Solo: start a local window on mount (offline — no server involved).
  useEffect(() => {
    if (mode !== 'solo') return
    if (useSessionStore.getState().endsAt !== null) return
    useSessionStore.getState().start(Date.now() + SESSION_SECONDS * 1000)
  }, [mode])

  // Date: apply the server's window. `endsAt` is a server timestamp, so convert it to
  // local time with the clock offset (serverClock − clientClock), matching the synced
  // countdown. Sent on start and again on rejoin, so it also resumes remaining time.
  useEffect(() => {
    if (mode === 'solo') return
    const socket = getSocket()
    const onWindow = ({ endsAt }: SessionWindowPayload) => {
      const { clockOffset } = useRoomStore.getState()
      useSessionStore.getState().start(endsAt - clockOffset)
    }
    // Server-pushed expiry: end immediately rather than waiting for the local tick to
    // notice `endsAt` passed (which lags, and stalls in a backgrounded tab). The local
    // countdown stays as a fallback if this event is ever missed.
    const onExpired = () => useSessionStore.getState().end()
    socket.on(SocketEvents.sessionWindow, onWindow)
    socket.on(SocketEvents.sessionExpired, onExpired)
    return () => {
      socket.off(SocketEvents.sessionWindow, onWindow)
      socket.off(SocketEvents.sessionExpired, onExpired)
    }
  }, [mode])
}
