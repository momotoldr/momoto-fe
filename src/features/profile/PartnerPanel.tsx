import { Check, Copy, Gift, Heart, Loader2, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ANALYTICS_EVENTS, trackEvents } from '@/analytics'
import { acceptInvite, createInvite } from '@/api/services/partnerService'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { env } from '@/env'
import { partnerCard } from '@/features/promos/promoState'
import { notifyError } from '@/lib/notify'
import { useAuthStore } from '@/store/useAuthStore'
import { usePromoStore } from '@/store/usePromoStore'
import type { User } from '@/types/authType'
import { avatarSrc } from '@/utils/common'

import { ProfileCard } from './ProfileCard'
import styles from './PartnerPanel.module.scss'

/** How long the "Copied" acknowledgement stays beside the code (ms). */
const COPIED_TIMEOUT = 2500

/** Invite codes are minted uppercase; typing one shouldn't require the shift key. */
const CODE_MAX_LENGTH = 12

interface PartnerPanelProps {
  user: User
}

/**
 * The Partner tab: link with someone, or see who you're linked with.
 *
 * Unlinked, it's two boxes side by side — mint a code, or redeem one — because those are
 * genuinely the two halves of the same job and stacking them makes the second look like
 * a fallback for the first. Linked, all of that collapses to the pair — a link is permanent,
 * so there is no way out of it here (user, 2026-10-29).
 */
export function PartnerPanel({ user }: PartnerPanelProps) {
  const { t } = useTranslation()
  const setUser = useAuthStore((s) => s.setUser)
  const promos = usePromoStore((s) => s.promos)
  const loadPromos = usePromoStore((s) => s.load)
  // The partner promo's line (docs/PLAN-promos.md §5b), only while a link could earn it.
  const showPromo =
    partnerCard(promos, { isAuthenticated: true, linked: Boolean(user.partner) }) ===
    'partnerInvite'

  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [enteredCode, setEnteredCode] = useState('')
  const [copied, setCopied] = useState(false)
  // Which action is in flight, so only its own control shows the spinner.
  const [busy, setBusy] = useState<'generate' | 'accept' | null>(null)

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), COPIED_TIMEOUT)
    return () => window.clearTimeout(id)
  }, [copied])

  const run = async (action: NonNullable<typeof busy>, work: () => Promise<void>) => {
    setBusy(action)
    try {
      await work()
    } catch (err) {
      notifyError(err)
    } finally {
      setBusy(null)
    }
  }

  const onGenerate = () =>
    run('generate', async () => {
      const { code } = await createInvite()
      setInviteCode(code)
      setCopied(false)
    })

  const onAccept = () =>
    run('accept', async () => {
      const { user: linkedUser, promo } = await acceptInvite(enteredCode.trim().toUpperCase())
      setUser(linkedUser)
      setEnteredCode('')
      if (promo?.partnerBogo === 'earned') {
        trackEvents(ANALYTICS_EVENTS.PARTNER_PROMO_EARNED, {})
        toast.success(t('promos.earned'))
      } else {
        toast.success(t('auth.partner.linked'))
      }
      void loadPromos()
    })

  const onCopy = async () => {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
    } catch {
      // Clipboard access is refused in plenty of ordinary situations (an insecure
      // origin, a permission prompt declined). The code is on screen and selectable,
      // so say so rather than failing silently.
      toast.info(t('auth.partner.copyFailed'))
    }
  }

  const partner = user.partner
  const partnerAvatar = partner ? avatarSrc(partner.avatarUrl, env.apiUrl) : null

  if (partner) {
    return (
      <ProfileCard title={t('auth.partner.title')} subtitle={t('auth.partner.linkedHint')}>
        <div className={styles.linked}>
          <UserAvatar
            src={partnerAvatar}
            name={partner.displayName}
            imageClassName={styles.partnerAvatar}
            fallbackClassName={styles.partnerAvatarFallback}
          />
          <div className={styles.linkedText}>
            <span className={styles.linkedLabel}>
              <Heart className={styles.linkedIcon} />
              {t('auth.partner.linkedWith', { name: partner.displayName })}
            </span>
          </div>
        </div>
      </ProfileCard>
    )
  }

  return (
    <ProfileCard title={t('auth.partner.title')} subtitle={t('auth.partner.none')}>
      {showPromo && (
        <p className={styles.promoLine}>
          <Gift className={styles.promoIcon} aria-hidden="true" />
          <span>
            <strong className={styles.promoLead}>{t('promos.partner.lead')}</strong>{' '}
            {t('promos.partnerLine')}
          </span>
        </p>
      )}
      <div className={styles.split}>
        <div className={styles.boxAccent}>
          <span className={styles.boxLabel}>{t('auth.partner.inviteTitle')}</span>

          {inviteCode ? (
            <>
              <div className={styles.codeRow}>
                <output className={styles.code}>{inviteCode}</output>
                <Button
                  variant="outline"
                  className={styles.codeButton}
                  onClick={() => void onCopy()}
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? t('auth.partner.copied') : t('auth.partner.copy')}
                </Button>
              </div>
              <p className={styles.hint}>{t('auth.partner.codeHint')}</p>
            </>
          ) : (
            <>
              <Button
                className={styles.generateButton}
                disabled={busy !== null}
                onClick={() => void onGenerate()}
              >
                {busy === 'generate' ? <Loader2 className={styles.spinner} /> : <Plus />}
                {busy === 'generate' ? t('auth.partner.generating') : t('auth.partner.generate')}
              </Button>
              <p className={styles.hint}>{t('auth.partner.generateHint')}</p>
            </>
          )}
        </div>

        <div className={styles.box}>
          <span className={styles.boxLabel}>{t('auth.partner.acceptTitle')}</span>
          <div className={styles.acceptRow}>
            <Input
              className={styles.codeInput}
              value={enteredCode}
              onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
              placeholder={t('auth.partner.codePlaceholder')}
              aria-label={t('auth.partner.codePlaceholder')}
              maxLength={CODE_MAX_LENGTH}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              disabled={busy !== null}
            />
            <Button
              className={styles.acceptButton}
              disabled={busy !== null || enteredCode.trim().length === 0}
              onClick={() => void onAccept()}
            >
              {busy === 'accept' && <Loader2 className={styles.spinner} />}
              {t('auth.partner.accept')}
            </Button>
          </div>
          <p className={styles.hint}>{t('auth.partner.acceptHint')}</p>
        </div>
      </div>
    </ProfileCard>
  )
}
