import { create } from 'zustand'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface RoomState {
  status: ConnectionStatus
  roomId: string | null
  selfId: string | null
  /**
   * Everyone in the room, in join order — `[0]` is the host. Authoritative, and
   * replaced wholesale from the server's `room:members`.
   *
   * Presence used to be a single `peerId` folded from `peer-joined` / `peer-left`.
   * Those are deltas: safe to fold when there is exactly one other person, and wrong
   * the moment there are three (a missed or reordered one is never recovered from).
   * They also cannot answer *who the host is now*, because that is a position in a
   * list and a delta carries no order.
   */
  members: string[]
  /** `members` minus ourselves — materialized so the array identity stays stable. */
  peerIds: string[]
  /**
   * Seats this room was minted with, from the join. `null` until known, and in solo
   * mode, where there is no room. Two things need the total rather than the count:
   * the presence pill ("3 of 4 here") and knowing when the room is full.
   */
  capacity: number | null
  roomFull: boolean
  /** True when the joined room's timed session already ended (join refused). */
  roomEnded: boolean
  /** True when the code names no room (typo / hand-typed URL; join refused). */
  roomMissing: boolean
  /**
   * Socket ids of everyone who has finalized ("created") their strip. While this is
   * non-empty the host can't "Retake all", which would reset those people out of a
   * strip they already committed.
   *
   * A set rather than a flag because one person leaving must only take *their* claim
   * with them: a boolean cleared on any departure would hand the host a retake over the
   * two people still holding finished strips.
   */
  createdPeers: string[]
  /** True while the peer holds a full set of shots (their broadcast carries an
   * arrangement). Lets someone with nothing of their own explain the idle booth. */
  peerHasShots: boolean
  /** Whether this client sets the strip config (host) vs inherits it (guest).
   * null until known (still connecting / joining). */
  isHost: boolean | null
  /** Estimated (serverClock - clientClock) in ms, for countdown sync. */
  clockOffset: number

  setStatus: (status: ConnectionStatus) => void
  setRoom: (roomId: string, selfId: string, members: string[], capacity: number) => void
  setMembers: (members: string[]) => void
  /** A join was refused: we are outside the room, so drop the presence we were showing. */
  clearMembers: () => void
  setRoomFull: (roomFull: boolean) => void
  setRoomEnded: (roomEnded: boolean) => void
  setRoomMissing: (roomMissing: boolean) => void
  /** Note that this peer has finalized their strip (`strip:created`'s stamped sender). */
  addCreatedPeer: (socketId: string) => void
  /** A fresh capture is starting — nobody's strip is final any more. */
  clearCreatedPeers: () => void
  setPeerHasShots: (peerHasShots: boolean) => void
  setHost: (isHost: boolean) => void
  setClockOffset: (clockOffset: number) => void
  reset: () => void
}

const initialState = {
  status: 'idle' as ConnectionStatus,
  roomId: null,
  selfId: null,
  members: [] as string[],
  peerIds: [] as string[],
  capacity: null,
  roomFull: false,
  roomEnded: false,
  roomMissing: false,
  createdPeers: [] as string[],
  peerHasShots: false,
  isHost: null,
  clockOffset: 0,
}

/**
 * The three things a membership list decides, derived in one place so they can never
 * disagree: who else is here, and whether we are the host.
 *
 * Host is `members[0]` — the first to join — for **everyone**, computed from the same
 * list the server sent. It used to be latched locally, and whoever was left when a peer
 * dropped promoted themselves; in a room of four that hands the title to two people at
 * once, neither of whom is necessarily the one who owns it.
 */
function derive(members: string[], selfId: string | null) {
  return {
    members,
    peerIds: members.filter((id) => id !== selfId),
    isHost: members.length > 0 ? members[0] === selfId : null,
  }
}

export const useRoomStore = create<RoomState>((set) => ({
  ...initialState,

  setStatus: (status) => set({ status }),
  setRoom: (roomId, selfId, members, capacity) =>
    set({ roomId, selfId, capacity, ...derive(members, selfId) }),
  setMembers: (members) =>
    set((state) => ({
      ...derive(members, state.selfId),
      // Someone who left takes their finished strip with them, so their claim on the
      // host's retake goes too. Pruning here rather than on `peer-left` keeps the one
      // authoritative list in charge of it.
      createdPeers: state.createdPeers.filter((id) => members.includes(id)),
    })),
  // Deliberately leaves `isHost` alone. A refusal mid-session is a *rejoin* being
  // refused (the server restarted, the room filled up again) and the booth stays on
  // screen so nobody loses their photos — demoting the host here would take away the
  // Finish button of the one person who can close the room.
  clearMembers: () => set({ members: [], peerIds: [] }),
  setRoomFull: (roomFull) => set({ roomFull }),
  setRoomEnded: (roomEnded) => set({ roomEnded }),
  setRoomMissing: (roomMissing) => set({ roomMissing }),
  addCreatedPeer: (socketId) =>
    set((state) =>
      state.createdPeers.includes(socketId)
        ? state
        : { createdPeers: [...state.createdPeers, socketId] }
    ),
  clearCreatedPeers: () =>
    set((state) => (state.createdPeers.length ? { createdPeers: [] } : state)),
  setPeerHasShots: (peerHasShots) => set({ peerHasShots }),
  // Solo mode only: there is no room and no list, so the host flag is stated outright.
  setHost: (isHost) => set({ isHost }),
  setClockOffset: (clockOffset) => set({ clockOffset }),
  reset: () => set({ ...initialState }),
}))
