import { Check, Loader2, Send, Star } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { submitFeedback } from '@/api/services/feedbackService'
import { Button } from '@/components/ui/button'
import { FEEDBACK_NOTE_MAX, FEEDBACK_RATINGS } from '@/constants/feedback'
import { cn } from '@/lib/utils'
import type { SessionMode } from '@/types/roomsType'

import styles from './StripRating.module.scss'

interface StripRatingProps {
  /** The session the rated strip came from, sent along as context for the rating. */
  sessionMode: SessionMode
}

/**
 * The star rating, asked where it belongs: beside the strip the person just made,
 * while the session is still fresh. This is the only place the app asks for an opinion
 * at all — the floating button is the support channel, for when something is broken,
 * which is a different thing entirely.
 *
 * One tap is a complete submission (the server accepts a rating with no message); the
 * comment box that opens underneath is there for anyone who wants to say more.
 * Offered on every finished strip, in every mode: each rating is its own row, tagged with
 * that strip's session mode.
 */
export function StripRating({ sessionMode }: StripRatingProps) {
  const { t, i18n } = useTranslation()
  const location = useLocation()

  const [rating, setRating] = useState(0)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    if (rating === 0 || sending) return
    setSending(true)
    try {
      await submitFeedback({
        category: 'feedback',
        rating,
        // Nothing typed is fine — the stars are the submission.
        message: note.trim() || undefined,
        context: location.pathname,
        // Which language it was written in, so an admin featuring it knows which side
        // the translation goes on.
        lang: i18n.language.toLowerCase().startsWith('id') ? 'id' : 'en',
        sessionMode,
      })
      setSent(true)
    } catch {
      toast.error(t('result.ratingError'))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className={styles.card} role="status">
        <span className={cn(styles.icon, styles.iconDone)}>
          <Check aria-hidden="true" />
        </span>
        <div className={styles.body}>
          <p className={styles.title}>{t('result.ratingThanksTitle')}</p>
          <p className={styles.text}>{t('result.ratingThanksText')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.card}>
      <span className={styles.icon}>
        <Star aria-hidden="true" />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{t('result.ratingTitle')}</p>
        <p className={styles.text}>{t('result.ratingText')}</p>

        <div className={styles.stars} role="group" aria-label={t('result.ratingTitle')}>
          {FEEDBACK_RATINGS.map((value) => (
            <button
              key={value}
              type="button"
              className={cn(styles.star, value <= rating && styles.starActive)}
              // Tapping the current rating again clears it — nothing is committed
              // until Send, so a mis-tap is undoable.
              onClick={() => setRating(rating === value ? 0 : value)}
              disabled={sending}
              aria-label={t('result.ratingStar', { count: value })}
              aria-pressed={value <= rating}
            >
              <Star />
            </button>
          ))}
        </div>

        {/* The comment and Send only appear once a star is picked: an untouched card is
         * five stars and a line of text, not a form to fill in. */}
        {rating > 0 && (
          <div className={styles.form}>
            <textarea
              className={styles.note}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('result.ratingNotePlaceholder')}
              rows={2}
              maxLength={FEEDBACK_NOTE_MAX}
              disabled={sending}
            />
            <Button
              type="button"
              size="sm"
              className={styles.send}
              onClick={() => void submit()}
              disabled={sending}
            >
              {sending ? <Loader2 className={styles.spinner} /> : <Send />}
              {t(sending ? 'result.ratingSending' : 'result.ratingSubmit')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
