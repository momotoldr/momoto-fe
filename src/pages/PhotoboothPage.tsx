import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import ApiError from '@/api/apiError'
import { RhfInputField } from '@/components/formFields/reactHookFormFields'
import { Button } from '@/components/ui/button'
import { notifyMessage } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { env } from '@/env'
import {
  GROUP_CAPACITY,
  localRoomCode,
  lookupRoom,
  modeForCapacity,
  requestRoomCode,
} from '@/utils/rooms'
import { joinRoomSchema, type JoinRoomValues } from '@/validations'

import styles from './PhotoboothPage.module.scss'

/** Photobooth entry: pick Solo / Date, or join a friend's room by code. */
export function PhotoboothPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const methods = useForm<JoinRoomValues>({
    resolver: zodResolver(joinRoomSchema),
    defaultValues: { code: '' },
  })
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods

  const busy = creating || isSubmitting

  // Solo never connects, so it keeps a local throwaway code. Date requires the backend
  // to mint the code: a successful mint also proves the server is reachable, which the
  // room needs for the guest to join and sync. If it fails, we surface an error and
  // stay put rather than navigating into a room nobody could join.
  const createRoom = async (mode: 'solo' | 'date' | 'group') => {
    if (mode === 'solo') {
      navigate(`/room/${localRoomCode()}?mode=solo`)
      return
    }
    setCreating(true)
    try {
      // A group room asks the server for its extra seats. If the backend hasn't raised
      // ROOM_CAPACITY_MAX to match this build, the mint is refused and we land in the
      // catch — which is the point: better a message here than a room whose third
      // person is turned away after they've been sent the code.
      const roomId = await requestRoomCode(mode === 'group' ? GROUP_CAPACITY : undefined)
      navigate(`/room/${roomId}?mode=${mode}`)
    } catch (err) {
      console.warn(`[photobooth] could not create a ${mode} room`, err)
      // `booth_busy` is the server's room ceiling, not a fault: everyone already
      // shooting carries on, and a code frees up as sessions end. Worth its own message
      // so the answer is "try again shortly" rather than "something went wrong".
      const busy = err instanceof ApiError && err.code === 'booth_busy'
      notifyMessage(
        busy
          ? t('photobooth.boothBusy')
          : t(mode === 'group' ? 'photobooth.createGroupFailed' : 'photobooth.createFailed')
      )
      setCreating(false)
    }
  }

  // The code's format is validated by the zod resolver (inline field error); here we
  // only handle the reachable-server outcomes.
  const onJoin = async ({ code }: JoinRoomValues) => {
    const clean = code.toUpperCase()
    try {
      // Check the code exists before entering the room, so a typo doesn't drop the
      // user into a lonely room they'd wait in forever.
      const { status, capacity } = await lookupRoom(clean)
      if (status === 'open') {
        // The room's own seat count decides the mode. Guessing "date" would put a
        // joiner in a four-seat room shooting two-camera cuts while everyone else
        // shot four — and `null` means this build can't run what it found at all.
        const mode = modeForCapacity(capacity)
        if (!mode) {
          notifyMessage(t('photobooth.joinGroupUnavailable'))
          return
        }
        navigate(`/room/${encodeURIComponent(clean)}?mode=${mode}`)
        return // navigating away — the page unmounts
      }
      // not_found / full / ended → a specific, actionable message.
      notifyMessage(t(`photobooth.join_${status}`))
    } catch {
      // Server unreachable — can't verify or join a date room without it.
      notifyMessage(t('photobooth.joinCheckFailed'))
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.masthead}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{t('photobooth.title')}</p>
          <h1 className={styles.title}>{t('photobooth.heading')}</h1>
          <p className={styles.subtitle}>{t('photobooth.subtitle')}</p>
        </div>

        {/* A shape-only sample of the finished strip. The thumbnail is decorative, so
            it stays out of the reading order and the caption beside it says what it is. */}
        <div className={styles.sample}>
          <span className={styles.sampleLabel}>{t('photobooth.sampleLabel')}</span>
          <div className={styles.sampleBody}>
            <div className={styles.sampleStrip} aria-hidden="true">
              <div className={styles.sampleCut} />
              <div className={cn(styles.sampleCut, styles.sampleCutWarm)} />
              <div className={styles.sampleCut} />
              <div className={cn(styles.sampleCut, styles.sampleCutCool)} />
              <div className={styles.sampleFooter} />
            </div>
            <span className={styles.sampleHint}>{t('photobooth.sampleHint')}</span>
          </div>
        </div>
      </div>

      <div className={styles.modes}>
        <button
          type="button"
          className={styles.mode}
          disabled={busy}
          onClick={() => void createRoom('solo')}
        >
          <span className={styles.modeArt} aria-hidden="true">
            <span className={cn(styles.frame, styles.frameSolo)}>
              <span className={styles.framePill}>{t('photobooth.frameYou')}</span>
            </span>
          </span>
          <span className={styles.modeBody}>
            <span className={styles.modeText}>
              <span className={styles.modeTitle}>{t('photobooth.solo')}</span>
              <span className={styles.modeHint}>{t('photobooth.soloHint')}</span>
            </span>
            {/* The card itself is the control — these only render the affordance. */}
            <span className={styles.modeCta} aria-hidden="true">
              {t('photobooth.soloCta')}
              <ArrowRight />
            </span>
            <ChevronRight className={styles.modeChevron} aria-hidden="true" />
          </span>
        </button>

        <button
          type="button"
          className={styles.mode}
          disabled={busy}
          onClick={() => void createRoom('date')}
        >
          <span className={cn(styles.modeArt, styles.modeArtDate)} aria-hidden="true">
            <span className={cn(styles.frame, styles.frameDate)}>
              <span className={styles.framePill}>{t('photobooth.frameYou')}</span>
            </span>
            <span className={cn(styles.frame, styles.frameDate, styles.frameFriend)}>
              <span className={styles.framePill}>{t('photobooth.frameFriend')}</span>
            </span>
          </span>
          <span className={styles.modeBody}>
            <span className={styles.modeText}>
              <span className={styles.modeTitle}>{t('photobooth.date')}</span>
              <span className={styles.modeHint}>{t('photobooth.dateHint')}</span>
            </span>
            <span className={styles.modeCta} aria-hidden="true">
              {t('photobooth.dateCta')}
              <ArrowRight />
            </span>
            <ChevronRight className={styles.modeChevron} aria-hidden="true" />
          </span>
        </button>

        {/* Group is the one mode behind a flag: the booth can run it only if the
         * backend's ROOM_CAPACITY_MAX has been raised to match (see env.ts). */}
        {env.groupModeEnabled && (
          <button
            type="button"
            className={styles.mode}
            disabled={busy}
            onClick={() => void createRoom('group')}
          >
            <span className={cn(styles.modeArt, styles.modeArtGroup)} aria-hidden="true">
              <span className={cn(styles.frame, styles.frameGroup)}>
                <span className={styles.framePill}>{t('photobooth.frameYou')}</span>
              </span>
              <span className={cn(styles.frame, styles.frameGroup)} />
              <span className={cn(styles.frame, styles.frameGroup)} />
              <span className={cn(styles.frame, styles.frameGroup)}>
                <span className={styles.framePill}>{t('photobooth.frameFriends')}</span>
              </span>
            </span>
            <span className={styles.modeBody}>
              <span className={styles.modeText}>
                <span className={styles.modeTitle}>{t('photobooth.group')}</span>
                <span className={styles.modeHint}>
                  {t('photobooth.groupHint', { count: GROUP_CAPACITY })}
                </span>
              </span>
              <span className={styles.modeCta} aria-hidden="true">
                {t('photobooth.groupCta')}
                <ArrowRight />
              </span>
              <ChevronRight className={styles.modeChevron} aria-hidden="true" />
            </span>
          </button>
        )}
      </div>

      <div className={styles.join}>
        <div className={styles.joinIntro}>
          <span className={styles.joinTitle}>{t('photobooth.joinTitle')}</span>
          <span className={styles.joinHint}>{t('photobooth.joinHint')}</span>
        </div>

        <FormProvider {...methods}>
          <form
            className={styles.joinForm}
            noValidate
            onSubmit={(e) => void handleSubmit(onJoin)(e)}
          >
            <RhfInputField
              name="code"
              wrapperClassName={styles.joinField}
              className={styles.joinInput}
              placeholder={t('photobooth.roomCodePlaceholder')}
              aria-label={t('photobooth.roomCodeLabel')}
              maxLength={12}
              disabled={busy}
            />
            <Button type="submit" variant="outline" className={styles.joinButton} disabled={busy}>
              {isSubmitting ? t('photobooth.joining') : t('photobooth.join')}
            </Button>
          </form>
        </FormProvider>
      </div>
    </main>
  )
}
