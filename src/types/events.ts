/** Socket.io event names — the client/server contract. */
export const SocketEvents = {
  timeSync: 'time:sync',
  timeSyncRes: 'time:sync:res',
  roomJoin: 'room:join',
  roomJoined: 'room:joined',
  roomFull: 'room:full',
  /** Server → client: the room's session already ended; joining is refused. */
  roomEnded: 'room:ended',
  /** Server → client: no such room (unknown/typo'd code, e.g. a hand-typed URL). */
  roomNotFound: 'room:not-found',
  peerJoined: 'room:peer-joined',
  peerLeft: 'room:peer-left',
  /**
   * Server → everyone: the room's full membership, in join order, after any change.
   *
   * The authoritative presence signal. `peer-joined` / `peer-left` are deltas, which
   * are safe to fold when there is exactly one other person and drift the moment there
   * are three — and they can't answer "who is the host now", since that is `members[0]`
   * and only a list knows the order.
   */
  roomMembers: 'room:members',
  /**
   * Host → server: open the session window now (rooms that seat more than two, where
   * there is no "everyone has arrived" moment to start on). Refused for anyone but
   * `members[0]`, below two members, or once a window is already running.
   */
  sessionOpen: 'session:open',
  sessionStart: 'session:start',
  /** Client → server: this room's timed session has ended (close it to new joins). */
  sessionEnd: 'session:end',
  /** Host → guest: discard the strip and go back to the pre-capture booth ("Retake all"). */
  sessionReset: 'session:reset',
  countdownStart: 'session:countdown-start',
  /** Server → both: the room's session window; clients drive their countdown from `endsAt`. */
  sessionWindow: 'session:window',
  /** Server → both present members: the window elapsed — end the session now (immediate,
   * server-authoritative kick that doesn't wait on the local countdown tick). */
  sessionExpired: 'session:expired',
  /** Host → server: re-shoot a single slot; server broadcasts `retake-start` to both. */
  sessionRetake: 'session:retake',
  /** Server → both: begin a synced single-shot retake of `slot` at `startAt`. */
  sessionRetakeStart: 'session:retake-start',
  peerAnnounce: 'peer:announce',
  peerMediaState: 'peer:media-state',
  /**
   * Host → room: whether a capture round has already produced shots here. Not a
   * design broadcast — every member designs their own strip (see `StripShotsPayload`).
   */
  stripShots: 'strip:shots',
  /** A member finalized their strip ("Create strip") — the peer notes it so the
   * host can't "Retake all" and wipe a strip the guest already committed. */
  stripCreated: 'strip:created',
} as const

export interface RoomJoinedPayload {
  roomId: string
  selfId: string
  members: string[]
  /**
   * Seats this room was minted with. Sent because the client cannot infer it: the
   * creator only gets a code back from `POST /rooms`, and "3 of 4 here" — and the rule
   * for when the host may start — both need the total.
   */
  capacity: number
}

export interface RoomMembersPayload {
  /** Socket ids in join order; `[0]` is the host. */
  members: string[]
}

export interface PeerPayload {
  peerId: string
}

export interface CountdownStartPayload {
  /** Server timestamp (ms) at which the countdown should begin. */
  startAt: number
}

export interface RetakePayload {
  /** Strip slot to re-shoot. */
  slot: number
}

export interface RetakeStartPayload {
  /** Strip slot to re-shoot. */
  slot: number
  /** Server timestamp (ms) at which the retake countdown should begin. */
  startAt: number
}

export interface TimeSyncResPayload {
  t0: number
  t1: number
}

export interface SessionWindowPayload {
  /** Server timestamp (ms) at which the session ends. */
  endsAt: number
}

export interface PeerAnnouncePayload {
  /** The sender's PeerJS id (for placing/answering the WebRTC call). */
  peerJsId: string
  /**
   * Sender's socket id, **stamped by the server** — never sent by a client, never
   * trusted from one. It is the only link between a PeerJS id and a person in the room:
   * the stream, camera and mic state that follow are all filed under it.
   */
  from?: string
  /**
   * Target socket id — deliver to that one member instead of the whole room. Used for
   * the reply to a newcomer's announce, so a join costs one message per member rather
   * than one from every member to every member.
   */
  to?: string
  /**
   * Stamped by the server when the announce carried `to` — i.e. it was aimed at us
   * rather than at the room. A directed announce is a *request* for our id and has to
   * be answered; a broadcast must not be, or every pair would answer each other forever.
   */
  directed?: boolean
  /**
   * Set by the sender when this announce is itself an answer to a directed one. It is
   * what terminates the exchange: a reply is directed too, so without it "always answer
   * a directed announce" would ping-pong indefinitely.
   */
  reply?: boolean
}

export interface PeerMediaStatePayload {
  cam: boolean
  mic: boolean
  /** Sender's socket id, stamped by the server — which tile this cam/mic state is for. */
  from?: string
}

export interface StripCreatedPayload {
  /** Sender's socket id, stamped by the server — whose strip was finalized. */
  from?: string
}

/**
 * Host → room: has a capture round already run in this booth?
 *
 * All that is left of what used to be a full design broadcast. Design (template,
 * filter, stickers, slot order) is now per-member and never leaves the browser that
 * made it: every client composites its cameras in its own order — itself first, and
 * only itself mirrored — so no two members' frames hold the same faces in the same
 * cells, and a coordinate that lands on your friend's cheek here lands somewhere else
 * entirely on theirs. The one thing a peer genuinely can't observe for itself is that
 * a round it missed has already happened, so that is the one thing still sent.
 *
 * Host-only, because `peerHasShots` is a single flag: with three people in the room,
 * letting a late-joining member broadcast `false` would clear it for everyone else.
 */
export interface StripShotsPayload {
  hasShots: boolean
}
