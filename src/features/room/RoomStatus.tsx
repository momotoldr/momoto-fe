import { Loader2, Users, Wifi, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { usePeerStore } from '@/store/usePeerStore'
import { useRoomStore } from '@/store/useRoomStore'
import { useSessionStore } from '@/store/useSessionStore'

import styles from './RoomStatus.module.scss'

/**
 * Connection + peer-presence pill. Lives in the room top bar, so it reads as a
 * status light next to the room code rather than a line of body copy: a green dot
 * once the friend is in, a muted pill (with the relevant icon) while we wait.
 */
export function RoomStatus() {
  const { t } = useTranslation()
  const status = useRoomStore((state) => state.status)
  const peerIds = useRoomStore((state) => state.peerIds)
  const capacity = useRoomStore((state) => state.capacity)
  const refused = useRoomStore((state) => state.roomFull || state.roomEnded || state.roomMissing)
  const sessionStarted = useSessionStore((state) => state.endsAt !== null)
  const peers = usePeerStore((state) => state.peers)

  /**
   * Someone is in the room but none of their cameras have arrived.
   *
   * Presence and picture come from two different places — the socket's member list and
   * the P2P media calls — and this pill only ever read the first. So it went green on
   * "the server says they joined" while the stage, which needs an actual stream, could
   * still be empty. That gap is real and unavoidable for a second or two on every join;
   * it is also exactly what a failed WebRTC handshake looks like, and reporting the two
   * identically is what let a broken connection sit there looking fine.
   */
  const anyLive = peerIds.some((id) => peers[id]?.stream)

  const content = (() => {
    // A refused join leaves us outside the room, so there is no presence to report —
    // and the screen beside this pill is already saying what happened. Reporting
    // "waiting for a friend" there is worse than saying nothing: it is the one moment
    // we know for certain nobody is waiting for us.
    if (refused) return null
    if (status === 'connecting')
      return { Icon: Loader2, label: t('status.connecting'), active: false }
    // Losing the server mid-session isn't "solo mode" — the booth is still live and
    // the socket is still retrying, so say what's actually happening.
    if (status === 'error')
      return {
        Icon: WifiOff,
        label: t(sessionStarted ? 'status.reconnecting' : 'status.offline'),
        active: false,
      }
    if (status === 'connected') {
      const present = peerIds.length + 1
      // Past two seats the interesting fact is not "is anyone here" but "how many of us
      // are", since the room can be usably full at three of four.
      if (capacity !== null && capacity > 2) {
        return {
          Icon: peerIds.length > 0 && !anyLive ? Loader2 : Users,
          label: t(
            anyLive || peerIds.length === 0 ? 'status.membersHere' : 'status.membersConnecting',
            {
              present,
              capacity,
            }
          ),
          active: anyLive,
        }
      }
      if (peerIds.length === 0)
        return { Icon: Wifi, label: t('status.waitingFriend'), active: false }
      return anyLive
        ? { Icon: Users, label: t('status.friendConnected'), active: true }
        : { Icon: Loader2, label: t('status.friendJoining'), active: false }
    }
    return null
  })()

  if (!content) return null
  const { Icon, label, active } = content

  return (
    <p className={cn(styles.pill, active && styles.pillActive)} role="status" aria-live="polite">
      {active ? (
        <span className={styles.dot} aria-hidden="true" />
      ) : (
        <Icon className={Icon === Loader2 ? styles.spinner : styles.icon} />
      )}
      {label}
    </p>
  )
}
