import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { PROFILE_TABS, type ProfileTab } from './profileData'
import styles from './ProfileTabs.module.scss'

interface ProfileTabsProps {
  active: ProfileTab
  onChange: (tab: ProfileTab) => void
}

/**
 * The pill row that splits the profile's body.
 *
 * A real tablist rather than three buttons: arrow keys move between the pills and the
 * panel below is wired to the selected one, which is what lets the page keep growing
 * (security, purchases, whatever lands next) without becoming a scroll.
 */
export function ProfileTabs({ active, onChange }: ProfileTabsProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const index = PROFILE_TABS.indexOf(active)
    const next = PROFILE_TABS[(index + step + PROFILE_TABS.length) % PROFILE_TABS.length]
    onChange(next)
    // Follow the selection with focus, or the next arrow press comes from the old pill.
    listRef.current?.querySelector<HTMLButtonElement>(`#profile-tab-${next}`)?.focus()
  }

  return (
    <div
      ref={listRef}
      className={styles.tabs}
      role="tablist"
      aria-label={t('auth.profile.tabsLabel')}
      onKeyDown={onKeyDown}
    >
      {PROFILE_TABS.map((tab) => (
        <button
          key={tab}
          id={`profile-tab-${tab}`}
          type="button"
          role="tab"
          aria-selected={tab === active}
          aria-controls={`profile-panel-${tab}`}
          tabIndex={tab === active ? 0 : -1}
          className={cn(styles.tab, tab === active && styles.tabActive)}
          onClick={() => onChange(tab)}
        >
          {t(`auth.profile.tabs.${tab}`)}
        </button>
      ))}
    </div>
  )
}
