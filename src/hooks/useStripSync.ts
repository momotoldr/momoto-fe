import { useEffect } from 'react'

import { usePhotosStore } from '@/store/usePhotosStore'
import { useRoomStore } from '@/store/useRoomStore'

import { SocketEvents, type StripShotsPayload, type StripCreatedPayload } from '@/types/events'
import { getSocket } from '@/utils/socket'

/**
 * Keeps the *room-level* strip state in sync. Not the design: template, filter,
 * stickers and slot order are each member's own and never leave their browser.
 *
 * They used to be the host's, broadcast over `strip:arrange` so both people went home
 * with "the same" strip. They never did. Every client composites the room's cameras
 * itself first and only itself mirrored (`useCaptureSequence`), so the host's cut is
 * `[host | guest]` where the guest's is `[guest | host]` — a sticker the host dropped
 * on their friend's face landed on their own on the friend's copy. Sharing coordinates
 * across frames that hold different faces in different cells cannot be made to work;
 * letting each person decorate what they can actually see can.
 *
 * What is left is the two facts a member cannot observe locally:
 *  - `strip:shots` — the host has shots, so a round has already run here (a late
 *    arrival is waiting on a retake, not on a start).
 *  - `strip:created` — that member finalized a strip, so "Retake all" must not reset
 *    them. Filed per sender: one person leaving clears only their own claim.
 */
export function useStripSync() {
  const isHost = useRoomStore((state) => state.isHost)
  const peerIds = useRoomStore((state) => state.peerIds)
  const created = usePhotosStore((state) => state.selection.length > 0)
  const hasShots = usePhotosStore((state) => state.order.length > 0)

  // Guest: note whether the round already ran without us.
  useEffect(() => {
    const socket = getSocket()
    const onShots = (payload: StripShotsPayload) => {
      if (useRoomStore.getState().isHost) return
      // Read fresh from every broadcast rather than latched: this goes back down when
      // the host drops to the pre-capture booth ("Retake all"), and so should we.
      useRoomStore.getState().setPeerHasShots(payload.hasShots === true)
    }
    const onCreated = ({ from }: StripCreatedPayload) => {
      if (from) useRoomStore.getState().addCreatedPeer(from)
    }
    socket.on(SocketEvents.stripShots, onShots)
    socket.on(SocketEvents.stripCreated, onCreated)
    return () => {
      socket.off(SocketEvents.stripShots, onShots)
      socket.off(SocketEvents.stripCreated, onCreated)
    }
  }, [])

  // Tell the room we've finalized our own strip — and tell it again whenever membership
  // changes. Our claim is dropped on the other side when we drop out (our strip left
  // with us), so a reconnect that isn't followed by a fresh announce would leave a host
  // believing our strip is still theirs to reset. This mirrors the host's own
  // re-broadcast below.
  useEffect(() => {
    if (!created) return
    const socket = getSocket()
    if (socket.connected) socket.emit(SocketEvents.stripCreated)
  }, [created, peerIds])

  // Host: announce whether this booth has shots, and re-announce on membership change
  // so a late arrival catches up. Deliberately keyed on the *boolean*, not on `order`
  // itself — `order` changes on every drag of the host's own slots, which is now
  // nobody else's business. `connected`-guarded because solo mode is a host with no
  // socket (an unguarded emit would pile up in socket.io's sendBuffer).
  useEffect(() => {
    if (!isHost) return
    const socket = getSocket()
    if (socket.connected) socket.emit(SocketEvents.stripShots, { hasShots })
  }, [isHost, hasShots, peerIds])
}
