import { Loader2, MailWarning, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

import { setEmail } from '@/api/services/authService'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { EMAIL_COOLDOWN_KEY } from '@/features/profile/EmailRow'
import { useSendCooldown } from '@/hooks/useSendCooldown'
import { notifyError, notifySuccess } from '@/lib/notify'
import { useAuthStore } from '@/store/useAuthStore'

import styles from './UnverifiedEmailBanner.module.scss'

/** Per-tab dismissal. Cleared when the browser session ends, on purpose. */
const DISMISS_KEY = 'momoto.emailBannerDismissed'

/**
 * Tells a signed-in user with no confirmed address that they have no way back into
 * their own account.
 *
 * **Why this exists at all.** Confirming an email is the one thing that switches on
 * password reset, and it lives in a Profile row nobody has a reason to visit. Without
 * a prompt, a user only discovers the gap on the day they're locked out — the single
 * moment it can no longer be fixed by them. Every seeded beta tester starts in exactly
 * this state, with an address an operator typed and nobody has proven.
 *
 * **Why it's a banner and not a wall.** An unconfirmed address gates recovery, not
 * access: the account works completely. Blocking the app over it would turn a
 * deliverability problem into a lockout, which is the failure this whole design avoids.
 *
 * **Why dismissal is per-session.** `sessionStorage`, so closing the tab forgets it.
 * A permanent dismissal would let someone bury the warning on day one and lose the
 * account in month three; coming back next visit is the entire point.
 */
export function UnverifiedEmailBanner() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [dismissed, setDismissed] = useState(() => {
    // Private windows and locked-down browsers throw on access rather than returning
    // null, and a storage quirk must not take the whole layout down with it.
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [resending, setResending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Same key the Profile row uses: sending from either place silences both, because
  // they trigger the identical message.
  const cooldown = useSendCooldown(EMAIL_COOLDOWN_KEY)

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Dismissal just won't persist. Harmless.
    }
  }

  /**
   * Sends a fresh confirmation link.
   *
   * Deliberately `setEmail(address)` rather than the resend endpoint. Resend needs a
   * *live claim* to re-send, and the most common account here has none: a seeded
   * tester has an address an operator typed straight onto the row, with no token
   * behind it. Re-claiming the same address works in both cases and supersedes any
   * older link, so there is one code path instead of two and no `nothing_pending`.
   */
  const onResend = async () => {
    if (!address) return
    setResending(true)
    try {
      setSentTo(await setEmail(address))
      cooldown.start()
      notifySuccess(t('auth.email.banner.sent'))
    } catch (err) {
      notifyError(err)
    } finally {
      setResending(false)
    }
  }

  // Hidden on Profile: the email row there says the same thing with more detail and
  // the controls to act on it, so the banner would be repeating itself an inch above.
  if (!isAuthenticated || !user || dismissed || pathname === ROUTES.profile) return null

  // A Google-only account has a proven address by definition, and nothing to recover
  // *to* — its way back in is Google. `hasPassword` is what makes this relevant.
  if (!user.hasPassword || user.emailVerified) return null

  /**
   * The address we would confirm, from either place it can live.
   *
   * `pendingEmail` is a claim the user made; `user.email` with `emailVerified` false
   * is an address an operator attached (seeded from the signup form, or created in
   * the admin console). Both are "we have an address, nobody has proven it" — and the
   * second is every beta tester's starting state, so treating it as "no email" would
   * put the wrong prompt in front of almost everyone.
   */
  const address = sentTo ?? user.pendingEmail ?? user.email

  return (
    <div className={styles.banner} role="status">
      <span className={styles.icon} aria-hidden="true">
        <MailWarning className={styles.glyph} />
      </span>

      <p className={styles.text}>
        {address ? (
          <>
            <span className={styles.title}>{t('auth.email.banner.pendingTitle')}</span>{' '}
            <span className={styles.body}>
              {t('auth.email.banner.pendingBody', { email: address })}
            </span>
          </>
        ) : (
          <>
            <span className={styles.title}>{t('auth.email.banner.noneTitle')}</span>{' '}
            <span className={styles.body}>{t('auth.email.banner.noneBody')}</span>
          </>
        )}
      </p>

      <div className={styles.actions}>
        {address && (
          <Button
            variant="ghost"
            size="sm"
            disabled={resending || cooldown.active}
            onClick={() => void onResend()}
            className={styles.action}
          >
            {resending && <Loader2 className={styles.spinner} />}
            {cooldown.active
              ? t('auth.email.resendIn', { seconds: cooldown.remaining })
              : t('auth.email.banner.send')}
          </Button>
        )}
        <Button asChild size="sm" className={styles.action}>
          <Link to={ROUTES.profile}>
            {address ? t('auth.email.banner.openProfile') : t('auth.email.banner.addEmail')}
          </Link>
        </Button>
        <button type="button" className={styles.close} onClick={dismiss} aria-label={t('common.close')}>
          <X className={styles.closeGlyph} />
        </button>
      </div>
    </div>
  )
}
