import { io, type Socket } from 'socket.io-client'

import { getStoredToken } from '@/constants/auth'
import { env } from '@/env'

let socket: Socket | null = null

/**
 * This page load's connection id, minted once and never stored.
 *
 * It exists for exactly one situation: the transport dies **without** a clean close —
 * a dropped network, a laptop going to sleep — where the server keeps holding the
 * dead socket until its ping times out (~20s) while socket.io reconnects the same
 * live page in about a second. Without an id to recognise it by, that return is
 * refused as a third person in a two-person room and costs a session nobody left.
 *
 * Deliberately **not** persisted. sessionStorage looks like the right home — it is
 * per-tab and survives a reload — but a browser copies it into a duplicated tab, so
 * two live tabs would carry one id and could take each other's seat. And it would buy
 * nothing: a reload, a navigation and a tab close all close the socket cleanly, so the
 * server frees that seat immediately and the next page joins as a newcomer with
 * nothing to reclaim. Living only as long as the page it belongs to makes the id mean
 * precisely what the server reads it as — *this connection, still here*.
 *
 * It is an opaque random value, not an identity: it grants nothing on its own.
 */
let clientId: string | null = null

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function getClientId(): string {
  clientId ??= randomId()
  return clientId
}

/**
 * Lazily-created shared socket. Connection lifecycle (connect/disconnect) is
 * owned by `useRoom`; other hooks attach listeners to the same instance.
 *
 * The handshake is authenticated: `auth` is a callback so the **current** access
 * token (and this page's connection id) is read on every (re)connect — the server's
 * `io.use()` guard verifies it, tying a date room to a signed-in user.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(env.realtimeUrl, {
      autoConnect: false,
      // WebSocket only, matching the server. The polling fallback needs every request in
      // the handshake to reach the same backend process, which stops being true the
      // moment a realtime deploy runs two of them behind one hostname (no sticky
      // sessions) — it would fail there rather than help. A network that blocks
      // WebSockets can't carry the WebRTC call either, so nothing is really lost.
      transports: ['websocket'],
      auth: (cb) => cb({ token: getStoredToken() ?? '', clientId: getClientId() }),
    })
  }
  return socket
}
