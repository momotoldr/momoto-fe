import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useBoothStage } from '@/hooks/useBoothStage'
import { cn } from '@/lib/utils'
import type { SessionMode } from '@/types/roomsType'
import { minSessionMembers } from '@/utils/rooms'

import styles from './RoomLobby.module.scss'

interface RoomLobbyProps {
  roomId: string
  mode: SessionMode
  /** How many people are in the room, including us. */
  present: number
  /** Seats the room was minted with; `null` until the join lands. */
  capacity: number | null
  /** Open the session window (group only — a date room starts on its own). */
  onStart: () => void
}

/**
 * The waiting room: the code to share, who has arrived, and — in a group room — the
 * host's Start button.
 *
 * A date room has no button because it has no decision to make: two seats means the
 * room filling up *is* the moment everyone is here, and the server starts the clock on
 * it. A room of four has no such moment. Waiting for the last seat would strand a group
 * of three whose fourth never turns up, and starting at the second arrival would burn
 * the window while people are still finding the link — so the host says when.
 */
export function RoomLobby({ roomId, mode, present, capacity, onStart }: RoomLobbyProps) {
  const { t } = useTranslation()
  // This screen is the lobby, as far as the booth's tips are concerned.
  useBoothStage('lobby')

  const isGroup = mode === 'group'
  const required = minSessionMembers(capacity)
  const canStart = present >= required

  const copyCode = () => {
    if (!roomId) return
    void navigator.clipboard?.writeText(roomId)
    toast.success(t('lobby.codeCopied'))
  }

  return (
    <div className={styles.lobby}>
      <p className={styles.label}>{t(isGroup ? 'lobby.shareGroup' : 'lobby.share')}</p>
      <button type="button" className={styles.code} onClick={copyCode} title={t('lobby.copyTitle')}>
        {roomId}
      </button>

      {isGroup ? (
        <>
          {/* One dot per seat, filled as people arrive — the room's own progress bar,
           * so nobody has to count names to know who is still missing. */}
          <div
            className={styles.seats}
            role="status"
            aria-live="polite"
            aria-label={t('lobby.seats', { present, capacity: capacity ?? present })}
          >
            {Array.from({ length: capacity ?? present }, (_, index) => (
              <span
                key={index}
                className={cn(styles.seat, index < present && styles.seatTaken)}
                aria-hidden="true"
              />
            ))}
            <span className={styles.seatsLabel}>
              {t('lobby.seats', { present, capacity: capacity ?? present })}
            </span>
          </div>

          <Button className={styles.start} onClick={onStart} disabled={!canStart}>
            {t('lobby.start')}
          </Button>
          <p className={styles.startNote}>
            {canStart
              ? t('lobby.startNote')
              : t('lobby.startNeedsMore', { count: required - present, required })}
          </p>
        </>
      ) : (
        <p className={styles.waiting}>
          <Loader2 className={styles.spinner} /> {t('lobby.waiting')}
        </p>
      )}
    </div>
  )
}
