import { Check, Copy, Heart, Loader2, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { acceptInvite, createInvite, unlinkPartner } from '@/api/services/partnerService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { env } from '@/env'
import { notifyError } from '@/lib/notify'
import { useAuthStore } from '@/store/useAuthStore'
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
 * The Partner tab: link with someone, or manage the link you have.
 *
 * Unlinked, it's two boxes side by side — mint a code, or redeem one — because those are
 * genuinely the two halves of the same job and stacking them makes the second look like
 * a fallback for the first. Linked, all of that collapses to the pair and one way out.
 */
export function PartnerPanel({ user }: PartnerPanelProps) {
  const { t } = useTranslation()
  const setUser = useAuthStore((s) => s.setUser)

  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [enteredCode, setEnteredCode] = useState('')
  const [copied, setCopied] = useState(false)
  // Which action is in flight, so only its own control shows the spinner.
  const [busy, setBusy] = useState<'generate' | 'accept' | 'unlink' | null>(null)

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
      setUser(await acceptInvite(enteredCode.trim().toUpperCase()))
      setEnteredCode('')
      toast.success(t('auth.partner.linked'))
    })

  const onUnlink = () =>
    run('unlink', async () => {
      setUser(await unlinkPartner())
      setInviteCode(null)
      toast.success(t('auth.partner.unlinked'))
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
  const partnerAvatar = partner ? avatarSrc(partner.avatarUrl, env.socketUrl) : null

  if (partner) {
    return (
      <ProfileCard title={t('auth.partner.title')} subtitle={t('auth.partner.linkedHint')}>
        <div className={styles.linked}>
          {partnerAvatar ? (
            <img className={styles.partnerAvatar} src={partnerAvatar} alt="" />
          ) : (
            <span className={styles.partnerAvatarFallback} aria-hidden="true">
              {partner.displayName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className={styles.linkedText}>
            <span className={styles.linkedLabel}>
              <Heart className={styles.linkedIcon} />
              {t('auth.partner.linkedWith', { name: partner.displayName })}
            </span>
            <span className={styles.hint}>{t('auth.partner.unlinkHint')}</span>
          </div>
          <Button variant="outline" disabled={busy !== null} onClick={() => void onUnlink()}>
            {busy === 'unlink' && <Loader2 className={styles.spinner} />}
            {t('auth.partner.unlink')}
          </Button>
        </div>
      </ProfileCard>
    )
  }

  return (
    <ProfileCard title={t('auth.partner.title')} subtitle={t('auth.partner.none')}>
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
