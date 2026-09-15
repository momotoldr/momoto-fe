import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { galleryItems } from '@/features/gallery/selectors'
import { AccountPanel } from '@/features/profile/AccountPanel'
import {
  countDateStrips,
  monthsSince,
  toProfileTab,
  type ProfileTab,
} from '@/features/profile/profileData'
import { ProfileHero } from '@/features/profile/ProfileHero'
import { ProfileStats } from '@/features/profile/ProfileStats'
import { ProfileTabs } from '@/features/profile/ProfileTabs'
import { PartnerPanel } from '@/features/profile/PartnerPanel'
import { PurchasesPanel } from '@/features/profile/PurchasesPanel'
import { useDeleteAccount } from '@/hooks/useDeleteAccount'
import { useLogout } from '@/hooks/useLogout'
import { useAuthStore } from '@/store/useAuthStore'
import { useCartStore } from '@/store/useCartStore'

import styles from './ProfilePage.module.scss'

/**
 * The account page: who the pair are, then everything else behind three tabs.
 *
 * The old page was one column of four equal cards, which put the partner link — the
 * thing Momoto is actually about — third, under a form. This leads with the pair in the
 * landing page's gradient and turns the account into a record of use: three counters
 * before any control. Splitting the rest into Account / Partner / Purchases is what
 * stops the page growing a fifth card every time a feature lands.
 *
 * The active tab lives in `?tab=` so a link can point at one — the invite flow sends
 * people straight to Partner, and a reload keeps them where they were.
 */
export function ProfilePage() {
  const { i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const items = useCartStore((s) => s.items)
  const status = useCartStore((s) => s.status)
  const load = useCartStore((s) => s.load)
  const { requestLogout, dialog: logoutDialog } = useLogout()
  const { requestDelete, dialog: deleteDialog } = useDeleteAccount()

  const [searchParams, setSearchParams] = useSearchParams()
  const tab = toProfileTab(searchParams.get('tab'))

  // The counters read the same list the cart and gallery do, so a direct visit to
  // /profile has to fill it — nothing else on this page would.
  useEffect(() => {
    if (status === 'idle') void load()
  }, [status, load])

  const setTab = useCallback(
    (next: ProfileTab) => {
      // `replace` so tabbing doesn't stack history entries between the profile and
      // wherever the reader came from.
      setSearchParams(next === 'account' ? {} : { tab: next }, { replace: true })
    },
    [setSearchParams]
  )

  const openPartner = useCallback(() => setTab('partner'), [setTab])

  const unlocked = useMemo(() => galleryItems(items), [items])
  const dateCount = useMemo(() => countDateStrips(unlocked), [unlocked])
  const months = useMemo(() => (user ? monthsSince(user.createdAt) : 0), [user])
  const since = useMemo(() => {
    if (!user) return ''
    const opened = new Date(user.createdAt)
    if (Number.isNaN(opened.getTime())) return ''
    return new Intl.DateTimeFormat(i18n.language, { month: 'short', year: 'numeric' }).format(
      opened
    )
  }, [user, i18n.language])

  // ProtectedRoute guarantees a user, but guard for type-safety.
  if (!user) return null

  return (
    <main className={styles.page}>
      <ProfileHero user={user} onOpenPartner={openPartner} />

      <ProfileStats
        galleryCount={unlocked.length}
        dateCount={dateCount}
        months={months}
        since={since}
      />

      <ProfileTabs active={tab} onChange={setTab} />

      <div
        id={`profile-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`profile-tab-${tab}`}
        tabIndex={-1}
        className={styles.panel}
      >
        {tab === 'account' && (
          <AccountPanel user={user} onSignOut={requestLogout} onDelete={requestDelete} />
        )}
        {tab === 'partner' && <PartnerPanel user={user} />}
        {tab === 'purchases' && <PurchasesPanel galleryCount={unlocked.length} />}
      </div>

      {logoutDialog}
      {deleteDialog}
    </main>
  )
}
