/**
 * How a booth session is being run — the `?mode=` on `/room/:roomId`.
 *
 * - `solo`  — one person, no server at all (a local code, no socket).
 * - `date`  — two people in a server-minted room.
 * - `group` — 2 to 4 people in the same kind of room, with a larger capacity.
 *
 * Resolve it from the URL with `resolveSessionMode` rather than comparing the raw
 * query string: `group` is only a real mode when the build offers it.
 */
export type SessionMode = 'solo' | 'date' | 'group'

/**
 * Joinability of a room code, as returned by `GET /rooms/:id`.
 * - `open`      — exists and has room for another peer.
 * - `full`      — exists but already has two members.
 * - `ended`     — the session expired / was closed; not rejoinable.
 * - `not_found` — never minted (a typo, or an expired-and-reclaimed code).
 */
export type RoomStatus = 'open' | 'full' | 'ended' | 'not_found'

/** `POST /rooms` response — a freshly minted, unique room code. */
export interface MintRoomResponse {
  roomId: string
}

/** `GET /rooms/:id` response — the code's joinability, and how big the room is. */
export interface RoomStatusResponse {
  status: RoomStatus
  /** Seats the room was minted with; `null` when no live room stands behind the code. */
  capacity: number | null
  /** How many people are in it right now. */
  members: number
}

/** What a pre-join lookup tells the joiner: whether to go in, and into which mode. */
export interface RoomLookup {
  status: RoomStatus
  capacity: number | null
  members: number
}
