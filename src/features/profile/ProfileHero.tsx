import { Heart, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { env } from '@/env'
import { cn } from '@/lib/utils'
import type { PublicPartner, User } from '@/types/authType'
import { avatarSrc } from '@/utils/common'

import styles from './ProfileHero.module.scss'

interface ProfileHeroProps {
  user: User
  /** Jump to the Partner tab — what both unlinked calls-to-action do. */
  onOpenPartner: () => void
}

/** One round portrait: the uploaded picture, or the initial on a tinted disc. */
function Portrait({
  person,
  className,
}: {
  person: Pick<User, 'displayName' | 'avatarUrl'> | PublicPartner
  className: string
}) {
  const src = avatarSrc(person.avatarUrl, env.apiUrl)
  if (src) return <img className={className} src={src} alt="" />
  return (
    <span className={className} aria-hidden="true">
      {person.displayName.charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * The identity panel at the top of the profile.
 *
 * Momoto is a two-person product, so the page leads with the pair rather than with a
 * form: both portraits in the landing page's gradient, the name under them, and the
 * link state as the single badge. Unlinked, the partner's place is held by a dashed
 * disc and the two ways to fill it — which is the whole reason the empty state is
 * loud rather than tidy.
 */
export function ProfileHero({ user, onOpenPartner }: ProfileHeroProps) {
  const { t } = useTranslation()
  const partner = user.partner

  return (
    <section className={styles.hero}>
      <div className={styles.pair}>
        <Portrait person={user} className={styles.portrait} />

        <span className={cn(styles.link, !partner && styles.linkDashed)} aria-hidden="true">
          {partner ? <Heart className={styles.linkIcon} /> : <Plus className={styles.linkIcon} />}
        </span>

        {partner ? (
          <Portrait person={partner} className={styles.portrait} />
        ) : (
          <span className={styles.portraitEmpty}>{t('auth.profile.hero.noPartner')}</span>
        )}
      </div>

      <div className={styles.identity}>
        <h1 className={styles.name}>{user.displayName}</h1>
        <span className={styles.handle}>@{user.username}</span>
      </div>

      {partner ? (
        <span className={styles.badge}>
          {t('auth.partner.linkedWith', { name: partner.displayName })}
        </span>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.primaryAction} onClick={onOpenPartner}>
            {t('auth.partner.inviteTitle')}
          </button>
          <button type="button" className={styles.secondaryAction} onClick={onOpenPartner}>
            {t('auth.profile.hero.haveCode')}
          </button>
        </div>
      )}
    </section>
  )
}
