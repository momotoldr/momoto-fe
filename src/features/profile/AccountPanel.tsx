import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Loader2, LogOut, ShieldCheck, TriangleAlert, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { updateProfile } from '@/api/services/authService'
import { AvatarUploadField } from '@/components/auth/AvatarUploadField'
import { LocationField } from '@/components/formFields/LocationField'
import { RhfInputField } from '@/components/formFields/reactHookFormFields'
import { Button } from '@/components/ui/button'
import { notifyError } from '@/lib/notify'
import { useAuthStore } from '@/store/useAuthStore'
import type { User } from '@/types/authType'
import { toLocationInput, toLocationValues } from '@/utils/location'
import { profileSchema, type ProfileValues } from '@/validations'

import { EmailRow } from './EmailRow'
import { PasswordRow } from './PasswordRow'
import { ProfileCard } from './ProfileCard'
import styles from './AccountPanel.module.scss'

/** How long the inline "saved" note stays up before clearing itself (ms). */
const SAVED_NOTE_TIMEOUT = 4000

interface AccountPanelProps {
  user: User
  onSignOut: () => void
  onDelete: () => void
}

/**
 * The Account tab: who you are, how you get in, and the way out.
 *
 * The destructive action is parked at the bottom in its own tinted card rather than
 * sharing the neutral stack — it's the one control on the page that can't be undone,
 * and the design keeps it visually quarantined.
 */
export function AccountPanel({ user, onSignOut, onDelete }: AccountPanelProps) {
  const { t } = useTranslation()
  const setUser = useAuthStore((s) => s.setUser)
  /**
   * The confirmation sits beside the button rather than in a toast: it's the only
   * feedback for a change whose result is already on screen (the name in the hero
   * updates as the store does), so a corner popup would be reporting what the reader
   * just watched happen.
   */
  const [saved, setSaved] = useState(false)

  const methods = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user.displayName,
      location: toLocationValues(user.location),
    },
  })
  const {
    control,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = methods

  useEffect(() => {
    if (!saved) return
    const id = window.setTimeout(() => setSaved(false), SAVED_NOTE_TIMEOUT)
    return () => window.clearTimeout(id)
  }, [saved])

  const onSave = async (values: ProfileValues) => {
    setSaved(false)
    try {
      setUser(
        await updateProfile({
          displayName: values.displayName,
          location: toLocationInput(values.location),
        })
      )
      setSaved(true)
    } catch (err) {
      notifyError(err)
    }
  }

  return (
    <div className={styles.panel}>
      <ProfileCard title={t('auth.profile.detailsTitle')} subtitle={t('auth.profile.detailsHint')}>
        <div className={styles.avatarRow}>
          <AvatarUploadField />
        </div>

        <FormProvider {...methods}>
          <form className={styles.form} noValidate onSubmit={(e) => void handleSubmit(onSave)(e)}>
            <div className={styles.detailsRow}>
              <RhfInputField
                name="displayName"
                label="auth.fields.displayName"
                wrapperClassName={styles.nameField}
              />
              <Controller
                name="location"
                control={control}
                render={({ field }) => (
                  <LocationField
                    value={field.value}
                    onChange={field.onChange}
                    saved={user.location}
                    errors={{
                      regionCode: errors.location?.regionCode?.message,
                      countryCode: errors.location?.countryCode?.message,
                      cityName: errors.location?.cityName?.message,
                    }}
                    wrapperClassName={styles.locationField}
                  />
                )}
              />
            </div>
            <div className={styles.formActions}>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className={styles.spinner} />}
                {isSubmitting ? t('auth.profile.saving') : t('auth.profile.save')}
              </Button>
              {saved && !isSubmitting && (
                <span className={styles.savedNote} role="status">
                  <Check className={styles.savedIcon} />
                  {t('auth.profile.saved')}
                </span>
              )}
            </div>
          </form>
        </FormProvider>
      </ProfileCard>

      <ProfileCard title={t('auth.profile.securityTitle')}>
        <ul className={styles.rows}>
          <EmailRow user={user} />

          <PasswordRow user={user} />

          <li className={styles.row}>
            <span className={styles.rowIcon} aria-hidden="true">
              <ShieldCheck className={styles.rowGlyph} />
            </span>
            <div className={styles.rowText}>
              <span className={styles.rowLabel}>{t('auth.profile.security.signInLabel')}</span>
              <span className={styles.rowValue}>{signInSummary(user, t)}</span>
            </div>
          </li>

          <li className={styles.row}>
            <span className={styles.rowIcon} aria-hidden="true">
              <LogOut className={styles.rowGlyph} />
            </span>
            <div className={styles.rowText}>
              <span className={styles.rowLabel}>{t('auth.profile.security.deviceLabel')}</span>
              <span className={styles.rowValue}>
                {t('auth.profile.signedInAs', { username: user.username })}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              {t('auth.logout')}
            </Button>
          </li>
        </ul>
      </ProfileCard>

      <section className={styles.danger}>
        <span className={styles.dangerIcon} aria-hidden="true">
          <TriangleAlert className={styles.dangerGlyph} />
        </span>
        <div className={styles.dangerText}>
          <h2 className={styles.dangerTitle}>{t('auth.profile.deleteAccount')}</h2>
          <p className={styles.dangerHint}>{t('auth.profile.deleteHint')}</p>
        </div>
        <Button variant="destructive" onClick={onDelete}>
          <Trash2 />
          {t('auth.profile.deleteAccount')}
        </Button>
      </section>
    </div>
  )
}

/** How this account signs in, in one line: password, Google, or both. */
function signInSummary(user: User, t: (key: string) => string): string {
  if (user.hasPassword && user.googleLinked) return t('auth.profile.security.signInBoth')
  if (user.googleLinked) return t('auth.profile.security.signInGoogle')
  if (user.hasPassword) return t('auth.profile.security.signInPassword')
  return t('auth.profile.security.signInNone')
}
