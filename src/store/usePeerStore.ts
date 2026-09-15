import { create } from 'zustand'

export type PeerStatus = 'idle' | 'connected' | 'error'

/** Everything this client knows about one other person in the room. */
export interface PeerRecord {
  /** Their PeerJS id, once announced — the address the media call is placed to. */
  peerJsId: string | null
  /** Their incoming media stream, once the call is up. */
  stream: MediaStream | null
  camEnabled: boolean
  micEnabled: boolean
  status: PeerStatus
}

const emptyPeer: PeerRecord = {
  peerJsId: null,
  stream: null,
  // Optimistic: a peer is assumed live until they say otherwise, so a tile doesn't
  // flash "camera off" in the gap between joining and their first media-state relay.
  camEnabled: true,
  micEnabled: true,
  status: 'idle',
}

interface PeerState {
  /**
   * One record per peer, **keyed by socket id** — the room's own identifier for a
   * person, the one `room:members` speaks and the one that survives a peer dropping
   * and coming back on a fresh PeerJS id.
   */
  peers: Record<string, PeerRecord>

  /** Create or update one peer's record, leaving the rest of it untouched. */
  upsertPeer: (socketId: string, patch: Partial<PeerRecord>) => void
  removePeer: (socketId: string) => void
  /**
   * Drop every peer that isn't in `socketIds` — how a membership change prunes the
   * people who left, in one pass, without the caller diffing anything.
   */
  retainPeers: (socketIds: string[]) => void
  clear: () => void
}

export const usePeerStore = create<PeerState>((set) => ({
  peers: {},

  upsertPeer: (socketId, patch) =>
    set((state) => ({
      peers: { ...state.peers, [socketId]: { ...emptyPeer, ...state.peers[socketId], ...patch } },
    })),

  removePeer: (socketId) =>
    set((state) => {
      if (!(socketId in state.peers)) return state
      const rest = { ...state.peers }
      delete rest[socketId]
      return { peers: rest }
    }),

  retainPeers: (socketIds) =>
    set((state) => {
      const keep = new Set(socketIds)
      const entries = Object.entries(state.peers).filter(([id]) => keep.has(id))
      // Same set as before — return the existing object so subscribers don't re-render
      // on every membership broadcast that changed nothing.
      if (entries.length === Object.keys(state.peers).length) return state
      return { peers: Object.fromEntries(entries) }
    }),

  clear: () => set({ peers: {} }),
}))
