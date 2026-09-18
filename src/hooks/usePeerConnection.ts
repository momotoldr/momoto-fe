import { useEffect, useRef } from 'react'
import Peer from 'peerjs'
import type { MediaConnection } from 'peerjs'

import { fetchIceServers } from '@/api/services/turnService'
import { env } from '@/env'
import { SocketEvents, type PeerAnnouncePayload, type PeerMediaStatePayload } from '@/types/events'
import { getSocket } from '@/utils/socket'
import { useMediaStore } from '@/store/useMediaStore'
import { usePeerStore } from '@/store/usePeerStore'
import { useRoomStore } from '@/store/useRoomStore'

/**
 * PeerJS options. `config.iceServers` (STUN/TURN) always applies so peers can
 * traverse NAT — even on the public PeerJS cloud broker (used when no `host` is
 * set). A self-hosted broker additionally sets host/port/path/secure.
 */
function peerOptions(iceServers: RTCIceServer[]) {
  const { host, port, path, secure } = env.peer
  const config = { iceServers }
  if (!host) return { config }
  return { host, port, path, secure, config }
}

/**
 * ICE servers for the connection: prefer the backend's freshly-minted, short-lived
 * TURN credentials (`GET /turn-credentials`); fall back to the build-time
 * `env.iceServers` (at minimum STUN) if the backend is unreachable so a P2P-friendly
 * network still connects. Solo mode has no backend — the fallback covers it too.
 */
async function resolveIceServers(): Promise<RTCIceServer[]> {
  try {
    const { iceServers } = await fetchIceServers()
    return iceServers.length > 0 ? iceServers : env.iceServers
  } catch {
    return env.iceServers
  }
}

/**
 * Outbound video ceiling per connection once the room holds more than two people.
 *
 * A mesh sends one copy of your camera to every other member: two people is one upload,
 * four is three. At the ~1.5 Mbps a 720p stream wants that is 4.5 Mbps up, which a lot
 * of home connections — and most phones on mobile data — simply do not have, and every
 * relayed byte is metered TURN besides. Halving the resolution and capping the rate
 * costs a four-person cut nothing it can see: each face lands in a quarter of a strip
 * slot, well under what 640x360 carries.
 *
 * A room of two is left alone. It has one upload, it has always had one upload, and its
 * cut gives each person half a slot.
 */
const MESH_MAX_BITRATE = 400_000
const MESH_SCALE_DOWN = 2

/**
 * How long a placed call may go without producing media before it is written off.
 *
 * It has to outlast a slow-but-real connection — ICE gathering plus a TURN relay
 * handshake on a bad mobile network is comfortably several seconds — while still being
 * short enough that a dead pair recovers inside the time someone will sit staring at a
 * missing tile.
 */
const DIAL_TIMEOUT_MS = 10_000

/** How often the mesh is compared against the room and repaired. */
const RECONCILE_MS = 5_000

/**
 * How long an unattributable incoming call is held before it is dropped.
 *
 * A call whose PeerJS id we can't place is *usually* a race, not an intruder: the
 * caller's announce and their SDP offer leave at the same instant but travel through
 * different servers (the socket relay and the PeerJS broker), so the offer can land
 * first. Parking covers that gap. It stays short because the other reading — someone
 * calling an id they were never given — should not be able to hold a slot open.
 */
const PARK_TIMEOUT_MS = 3_000

/**
 * One entry per person we are attempting or holding a call with.
 *
 * `live` is the whole point of this record. Membership of the map used to be the test
 * for "we have a connection to them", but the map is written the moment a call is
 * *placed*, so it really meant "we once tried" — and PeerJS never corrects that
 * impression. `MediaConnection.close()` sends nothing to the other side, and a call
 * that never received an ANSWER has `open === false`, so its own `close()` returns
 * before emitting anything. A call that was rejected, or that failed ICE before
 * connecting, therefore sat in the map forever and blocked every later attempt at that
 * person — permanently, because the per-pair tie-break means only one side ever dials.
 */
interface PeerCall {
  conn: MediaConnection
  /** When the attempt was placed, for `DIAL_TIMEOUT_MS`. */
  since: number
  /** True once media actually arrived — the only real proof the call is up. */
  live: boolean
}

/**
 * Hold this connection's outbound video to the mesh ceiling. Best-effort: encoding
 * parameters are optional in the spec and browsers differ on what they honour, so a
 * failure here degrades to sending full quality rather than to no call at all.
 */
function capOutboundVideo(conn: MediaConnection): void {
  const sender = conn.peerConnection?.getSenders?.().find((s) => s.track?.kind === 'video')
  if (!sender) return
  const params = sender.getParameters()
  // Chrome throws if `encodings` is replaced wholesale before the first negotiation has
  // populated it, so patch what is there and leave it alone when there is nothing yet.
  if (!params.encodings || params.encodings.length === 0) return
  params.encodings[0].maxBitrate = MESH_MAX_BITRATE
  params.encodings[0].scaleResolutionDownBy = MESH_SCALE_DOWN
  void sender.setParameters(params).catch(() => undefined)
}

/**
 * Holds a **mesh** of P2P media calls — one `MediaConnection` to every other member of
 * the room, all from a single PeerJS peer. Two people is one call, four is three each.
 *
 * PeerJS ids are exchanged over the socket room (`peer:announce`), and everything is
 * filed under the sender's **socket id**, which the server stamps on each relay. That
 * indirection is the point: a socket id is who a person *is* in this room (it is what
 * `room:members` speaks), while a PeerJS id is only where their media currently lives
 * and changes every time they reload.
 */
export function usePeerConnection() {
  const localStream = useMediaStore((state) => state.localStream)
  const peerIds = useRoomStore((state) => state.peerIds)
  const selfId = useRoomStore((state) => state.selfId)
  const camEnabled = useMediaStore((state) => state.camEnabled)
  const micEnabled = useMediaStore((state) => state.micEnabled)

  const peerRef = useRef<Peer | null>(null)
  const myIdRef = useRef<string | null>(null)
  /** Media calls placed or held, one per peer, keyed by socket id. */
  const callsRef = useRef(new Map<string, PeerCall>())
  /** Incoming calls we can't attribute yet, keyed by the caller's PeerJS id. */
  const parkedRef = useRef(new Map<string, { conn: MediaConnection; timer: number }>())
  /** socket id → their current PeerJS id, and the reverse (an incoming call only
   *  carries the PeerJS id, and it has to be attributed to a person). */
  const peerJsBySocketRef = useRef(new Map<string, string>())
  const socketByPeerJsRef = useRef(new Map<string, string>())
  /** The socket id we last held, to notice when a reconnect hands us a new one. */
  const lastSelfIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!localStream) return
    const socket = getSocket()
    let cancelled = false
    // The maps themselves never change identity (only their contents), so binding them
    // once here is the same three objects the cleanup below closes over.
    const calls = callsRef.current
    const parked = parkedRef.current
    const peerJsBySocket = peerJsBySocketRef.current
    const socketByPeerJs = socketByPeerJsRef.current

    /** Tear down whatever call we hold for one person, without touching their id. */
    const dropCall = (socketId: string) => {
      calls.get(socketId)?.conn.close()
      calls.delete(socketId)
    }

    /** Forget one peer's call and mapping — they left, or came back on a new id. */
    const dropPeer = (socketId: string) => {
      dropCall(socketId)
      const staleId = peerJsBySocket.get(socketId)
      if (staleId) socketByPeerJs.delete(staleId)
      peerJsBySocket.delete(socketId)
    }

    /**
     * Do we have a call with this person worth keeping?
     *
     * True for one that is carrying media, and for one placed recently enough to still
     * be negotiating. Deliberately **not** "is there an entry in the map": that is the
     * test that made a rejected or failed call permanent.
     */
    const holds = (socketId: string, now = Date.now()) => {
      const call = calls.get(socketId)
      if (!call) return false
      return call.live || now - call.since < DIAL_TIMEOUT_MS
    }

    const attach = (socketId: string, conn: MediaConnection) => {
      calls.set(socketId, { conn, since: Date.now(), live: false })
      // Only worth doing beyond a pair, and only once the transport exists — PeerJS
      // creates the RTCPeerConnection with the call, but its senders have no encoding
      // parameters until negotiation has run.
      if (useRoomStore.getState().peerIds.length > 1) {
        conn.on('stream', () => capOutboundVideo(conn))
      }
      conn.on('stream', (stream) => {
        // Guarded against a superseded attempt: a late 'stream' from a call this peer
        // has already been re-dialled past must not mark the *new* one live.
        const call = calls.get(socketId)
        if (call?.conn === conn) call.live = true
        usePeerStore.getState().upsertPeer(socketId, { stream, status: 'connected' })
      })
      /** Forget this call, but only if it is still the current one for that person. */
      const forget = () => {
        if (calls.get(socketId)?.conn !== conn) return
        calls.delete(socketId)
        // Only this one person's tile goes dark — the rest of the mesh is untouched.
        usePeerStore.getState().upsertPeer(socketId, { stream: null, status: 'idle' })
      }
      conn.on('close', forget)
      conn.on('error', forget)
      // `close` alone is not enough to notice a death: PeerJS only emits it on a
      // connection that reached `open`, which a call that was never answered never does.
      // The ICE state is the one signal that arrives either way. `disconnected` is left
      // alone deliberately — it is routinely transient and recovers on its own.
      conn.on('iceStateChanged', (state) => {
        if (state === 'failed' || state === 'closed') forget()
      })
    }

    /**
     * Place the call to one peer, if it is ours to place.
     *
     * The tie-break is per *pair* — the higher PeerJS id calls — so across any set of
     * members exactly one side of each pair dials and nobody glares. It generalises from
     * two people to four for free, because it never asks anything about the room.
     */
    const maybeCall = (socketId: string) => {
      const peer = peerRef.current
      const myId = myIdRef.current
      const remoteId = peerJsBySocket.get(socketId)
      if (!peer || !myId || !remoteId || holds(socketId)) return
      // Clear a written-off attempt first, so the new call isn't shadowed by the corpse
      // of the old one in the map.
      dropCall(socketId)
      if (myId <= remoteId) return

      // `peer.call` is *typed* as always returning a MediaConnection, but PeerJS returns
      // `undefined` twice over: when this peer is disconnected from the broker, and when
      // the stream has ended. Attaching that stored `{ conn: undefined }` in `calls`, and
      // every later `conn.close()` — teardown, membership change, re-dial — then threw
      // `Cannot read properties of undefined (reading 'close')`, which the router caught
      // as its generic error card and took the whole booth (cameras included) with it.
      //
      // Storing nothing is what makes it recoverable: with no entry, `holds` is false and
      // the next `reconcile` dials again. The `reconnect` is the other half — a peer that
      // lost the broker never comes back on its own, which is what left a returning member
      // stuck on "connecting…" while everyone else waited for a tile that never arrived.
      const conn = peer.call(remoteId, localStream)
      if (!conn) {
        if (peer.disconnected && !peer.destroyed) peer.reconnect()
        return
      }
      attach(socketId, conn)
    }

    /**
     * Our id to one member, as a question ("who are you?") or as the answer to theirs.
     *
     * Split from the broadcast below because a directed announce is sent per *peer*,
     * and the mic/cam state that rides along with the broadcast goes to the whole room
     * regardless of addressing — sending it once per member would be three copies of
     * the same fact in a room of four.
     */
    const announceTo = (to: string, reply = false) => {
      const myId = myIdRef.current
      if (!myId) return
      socket.emit(SocketEvents.peerAnnounce, { peerJsId: myId, to, reply })
    }

    /** Our id + current mic/cam state, to the whole room. */
    const announceSelf = () => {
      const myId = myIdRef.current
      if (!myId) return
      socket.emit(SocketEvents.peerAnnounce, { peerJsId: myId })
      const media = useMediaStore.getState()
      socket.emit(SocketEvents.peerMediaState, { cam: media.camEnabled, mic: media.micEnabled })
    }

    /**
     * Introduce ourselves to anyone in the room we have no PeerJS id for yet.
     *
     * Belt and braces for a race the two-person room mostly got away with: the peer
     * opens as soon as the camera does, which can be *before* `room:join` lands, and an
     * announce sent then reaches nobody. With one other person the two sides were
     * symmetric so whoever arrived second recovered it. In a mesh a lost announce means
     * that one person stays invisible to the rest, so discovery is re-driven from the
     * membership list instead of from a single moment in time.
     */
    const announceToUnknown = () => {
      if (!myIdRef.current) return
      for (const socketId of useRoomStore.getState().peerIds) {
        if (!peerJsBySocket.has(socketId)) announceTo(socketId)
      }
    }

    /** Answer a parked call from this PeerJS id, now that we can say who it is. */
    const adoptParked = (peerJsId: string, socketId: string) => {
      const held = parked.get(peerJsId)
      if (!held) return
      clearTimeout(held.timer)
      parked.delete(peerJsId)
      if (holds(socketId)) {
        held.conn.close()
        return
      }
      dropCall(socketId)
      held.conn.answer(localStream)
      attach(socketId, held.conn)
    }

    const onAnnounce = ({ peerJsId, from, directed, reply }: PeerAnnouncePayload) => {
      // The server stamps `from` on every announce, so one without it is malformed.
      // And only members are peers: a relay is room-scoped, but this is the client-side
      // half of that guarantee, and it is what stops a stray id becoming a tile.
      if (!from || !useRoomStore.getState().peerIds.includes(from)) return

      const known = peerJsBySocket.get(from)
      // A *different* PeerJS id from the same person means they reloaded or reconnected.
      // Their old MediaConnection is dead, but PeerJS won't always say so promptly, and
      // while it lingers it blocks the new call — `maybeCall` sees a connection and
      // stops, and an incoming one is rejected as a duplicate. Drop it first.
      if (known && known !== peerJsId) {
        dropPeer(from)
        usePeerStore.getState().upsertPeer(from, { stream: null, status: 'idle' })
      }

      peerJsBySocket.set(from, peerJsId)
      socketByPeerJs.set(peerJsId, from)
      usePeerStore.getState().upsertPeer(from, { peerJsId })

      // Their call may already be sitting here, held because we couldn't name them.
      adoptParked(peerJsId, from)

      // Answer anything aimed at us, and only that. A directed announce is a request
      // for our id, so it is answered even when their id is one we already had — that
      // case is not redundant, it is the reconnect: a peer whose socket id changed
      // re-announces with the *same* PeerJS id, and everyone else has just dropped
      // their mapping for the old socket id and is waiting to be told who this is.
      // Gating on "their id is new to me" is what left that person invisible.
      //
      // A reply is directed too, so `reply` is what stops the exchange from bouncing
      // between us forever. Broadcasts are never answered: everyone answering everyone
      // is the cost this addressing exists to avoid.
      if (directed && !reply) announceTo(from, true)
      maybeCall(from)
    }

    const onMediaState = ({ cam, mic, from }: PeerMediaStatePayload) => {
      if (!from) return
      usePeerStore.getState().upsertPeer(from, { camEnabled: cam, micEnabled: mic })
    }

    socket.on(SocketEvents.peerAnnounce, onAnnounce)
    socket.on(SocketEvents.peerMediaState, onMediaState)

    // ICE servers are fetched (ephemeral TURN creds) before creating the peer, so
    // Peer construction is deferred to this async step.
    void resolveIceServers().then((iceServers) => {
      if (cancelled) return
      const peer = new Peer(undefined as unknown as string, peerOptions(iceServers))
      peerRef.current = peer

      peer.on('open', (id) => {
        myIdRef.current = id
        announceSelf()
        // Both of these need an id, so this is the earliest they can do anything. They
        // used to sit at the bottom of this callback's enclosing `.then()`, which runs
        // *before* the broker hands one over — so they returned on their first line
        // every time and the discovery they were meant to drive never happened.
        announceToUnknown()
        for (const socketId of useRoomStore.getState().peerIds) maybeCall(socketId)
      })

      peer.on('call', (call) => {
        // Only answer someone this room announced. Answering unconditionally would hand
        // our camera and microphone to anyone who learns our PeerJS id — the broker is
        // public, and an id can leak or be passed on by whoever we last spoke to. The
        // handshake guarantees we know theirs: they can only have our id because we
        // announced it in reply to their own.
        const from = socketByPeerJs.get(call.peer)
        if (!from) {
          // Not "who are you" but "not *yet*". The caller's announce and their SDP offer
          // leave together and race through two different servers, so the offer landing
          // first is ordinary. Closing it on the spot made that race unrecoverable: the
          // caller is never told (PeerJS sends nothing on close, and an unanswered call
          // never opens, so it emits no local `close` either), it keeps the dead call in
          // its own map, and the tie-break means we are the side that never dials back.
          // Hold it for a moment instead; `adoptParked` answers it if the announce lands.
          if (parked.has(call.peer)) {
            call.close()
            return
          }
          const timer = window.setTimeout(() => {
            parked.delete(call.peer)
            call.close()
          }, PARK_TIMEOUT_MS)
          parked.set(call.peer, { conn: call, timer })
          return
        }
        // Already talking to that person — reject the duplicate rather than overwriting
        // (and leaking) the live MediaConnection and its listeners. A written-off
        // attempt is not "already talking": that is the case this call is here to fix.
        if (holds(from)) {
          call.close()
          return
        }
        dropCall(from)
        call.answer(localStream)
        attach(from, call)
      })

      // A peer-level failure isn't attributable to one call, so it is reported against
      // everyone we haven't reached yet rather than against a single tile.
      // The broker dropped us (its restart, a network blip). PeerJS keeps the peer object
      // usable but will refuse every `call` until it is reconnected, so ask for that the
      // moment it happens rather than waiting for a dial to fail.
      peer.on('disconnected', () => {
        if (cancelled) return
        if (!peer.destroyed) peer.reconnect()
      })

      peer.on('error', () => {
        for (const socketId of useRoomStore.getState().peerIds) {
          if (!holds(socketId)) {
            usePeerStore.getState().upsertPeer(socketId, { status: 'error' })
          }
        }
      })
    })

    /**
     * Compare the mesh against the room, and repair whatever doesn't match.
     *
     * Every other path here is driven by an event — an announce arriving, membership
     * changing, a call closing — which is exactly why they can all be missed. A lost
     * announce, an offer that raced ahead of one, a call that died before it ever
     * opened: each leaves a pair with nothing left to fire, and the tie-break means
     * only one of the two would ever dial anyway. This asks the standing question
     * instead of listening for a moment, so no single dropped message is final.
     *
     * In a healthy room every peer is `live` and this does nothing at all.
     */
    const reconcile = () => {
      const myId = myIdRef.current
      if (!myId) return
      const now = Date.now()
      for (const socketId of useRoomStore.getState().peerIds) {
        if (holds(socketId, now)) continue
        // Written off: clear it so it can't shadow the retry.
        dropCall(socketId)
        const remoteId = peerJsBySocket.get(socketId)
        // No id for them at all — the announce that carried it never arrived. Ask again.
        if (!remoteId) {
          announceTo(socketId)
          continue
        }
        maybeCall(socketId)
        // We hold the lower id, so we are never the one who dials. Prompt them to: our
        // announce is answered, and the answer is what re-drives their own `maybeCall`.
        if (myId <= remoteId) announceTo(socketId)
      }
    }
    const repairTimer = window.setInterval(reconcile, RECONCILE_MS)

    return () => {
      cancelled = true
      window.clearInterval(repairTimer)
      socket.off(SocketEvents.peerAnnounce, onAnnounce)
      socket.off(SocketEvents.peerMediaState, onMediaState)
      for (const { conn } of calls.values()) conn.close()
      calls.clear()
      for (const { conn, timer } of parked.values()) {
        clearTimeout(timer)
        conn.close()
      }
      parked.clear()
      peerJsBySocket.clear()
      socketByPeerJs.clear()
      myIdRef.current = null
      peerRef.current?.destroy()
      peerRef.current = null
      usePeerStore.getState().clear()
    }
  }, [localStream])

  // Broadcast local mic/cam changes so every tile of us reflects them. Guarded by
  // `connected` so solo mode (no socket) doesn't buffer these into sendBuffer.
  useEffect(() => {
    const socket = getSocket()
    if (socket.connected)
      socket.emit(SocketEvents.peerMediaState, { cam: camEnabled, mic: micEnabled })
  }, [camEnabled, micEnabled])

  /**
   * Our *own* socket id changed — an abrupt drop reconnected and the server handed our
   * seat back under a new id (`roomStore.join` rewrites it in place).
   *
   * The media calls survive that, because they run peer-to-peer and never touched the
   * socket. What does not survive is everyone else's name for us: they key the mesh by
   * socket id, so they have all just pruned their call to the person we used to be. Our
   * side of those calls is the mirror image — still in the map, still marked live, and
   * pointing at connections the other end has already torn down.
   *
   * Left alone they are only noticed when ICE gives up, which is ten seconds or more of
   * black tiles. Dropping them here and re-introducing ourselves rebuilds the mesh in a
   * round trip instead.
   */
  useEffect(() => {
    const previous = lastSelfIdRef.current
    lastSelfIdRef.current = selfId
    // First id of the session is an arrival, not a change — there is nothing stale yet.
    if (!previous || !selfId || previous === selfId) return

    for (const [socketId, call] of callsRef.current) {
      call.conn.close()
      usePeerStore.getState().upsertPeer(socketId, { stream: null, status: 'idle' })
    }
    callsRef.current.clear()

    const myId = myIdRef.current
    if (!myId) return
    for (const socketId of useRoomStore.getState().peerIds) {
      getSocket().emit(SocketEvents.peerAnnounce, { peerJsId: myId, to: socketId, reply: false })
    }
  }, [selfId])

  // Membership changed. Two things follow from the new list, and both are driven from
  // it rather than from an arrival or departure event: everyone who left is forgotten,
  // and everyone new is introduced to.
  useEffect(() => {
    const present = new Set(peerIds)
    for (const socketId of [...callsRef.current.keys()]) {
      if (present.has(socketId)) continue
      callsRef.current.get(socketId)?.conn.close()
      callsRef.current.delete(socketId)
    }
    for (const [socketId, peerJsId] of [...peerJsBySocketRef.current]) {
      if (present.has(socketId)) continue
      peerJsBySocketRef.current.delete(socketId)
      socketByPeerJsRef.current.delete(peerJsId)
    }
    usePeerStore.getState().retainPeers(peerIds)

    const myId = myIdRef.current
    if (!myId) return
    for (const socketId of peerIds) {
      if (!peerJsBySocketRef.current.has(socketId)) {
        getSocket().emit(SocketEvents.peerAnnounce, { peerJsId: myId, to: socketId, reply: false })
      }
    }
  }, [peerIds])
}
