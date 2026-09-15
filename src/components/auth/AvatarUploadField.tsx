import { Loader2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { removeAvatar, uploadAvatar } from '@/api/services/authService'
import { Button } from '@/components/ui/button'
import { env } from '@/env'
import { notifyError } from '@/lib/notify'
import { useAuthStore } from '@/store/useAuthStore'
import {
  type AvatarCrop,
  AvatarImageError,
  decodeAvatarSource,
  renderAvatarBlob,
} from '@/utils/avatarImage'
import { avatarSrc } from '@/utils/common'

import { AvatarCropper } from './AvatarCropper'
import styles from './AvatarUploadField.module.scss'

/** File types offered in the picker. Anything decodable is accepted on submit. */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif'

/**
 * Profile picture upload.
 *
 * Saves on selection rather than with the surrounding form: an image is its own
 * resource on the server (`/auth/me/avatar`), and pairing "choose a file" with a
 * separate "save" step is a reliable way to lose the picture people just picked.
 */
export function AvatarUploadField() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shown while the upload is in flight so the new picture appears immediately.
  const [preview, setPreview] = useState<string | null>(null)
  // The decoded picture being cropped. Non-null exactly while the editor is open.
  const [source, setSource] = useState<ImageBitmap | null>(null)

  // An object URL is a document-lifetime reference; revoke it or the blob it points
  // at is pinned in memory for as long as the page lives.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  // Same deal for the bitmap, which is off-heap and not something the GC will hurry
  // to reclaim — a few abandoned 12-megapixel decodes add up.
  useEffect(() => () => source?.close(), [source])

  if (!user) return null

  const showPreview = (blob: Blob) => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(blob)
    })
  }

  const clearPreview = () => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }

  /** Decode the chosen file and hand it to the editor — nothing uploads yet. */
  const onPick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      setSource(await decodeAvatarSource(file))
    } catch (err) {
      if (err instanceof AvatarImageError) setError(t(`auth.errors.avatar.${err.reason}`))
      else notifyError(err)
    } finally {
      // Reset the input so re-picking the same file still fires a change event.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // Dropping the source unmounts the editor; the effect above closes the bitmap.
  const closeCropper = () => setSource(null)

  /** Encode the crop the user settled on and upload it. */
  const onCrop = async (crop: AvatarCrop) => {
    if (!source) return
    setError(null)
    setBusy(true)
    try {
      const blob = await renderAvatarBlob(source, crop)
      showPreview(blob)
      // Close the editor only once the bytes are safely encoded — leaving it up until
      // then means a failed encode returns the user to their crop, not to square one.
      closeCropper()
      setUser(await uploadAvatar(blob))
      clearPreview()
      toast.success(t('auth.profile.avatarUpdated'))
    } catch (err) {
      clearPreview()
      closeCropper()
      if (err instanceof AvatarImageError) setError(t(`auth.errors.avatar.${err.reason}`))
      else notifyError(err)
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async () => {
    setError(null)
    setBusy(true)
    try {
      setUser(await removeAvatar())
      toast.success(t('auth.profile.avatarRemoved'))
    } catch (err) {
      notifyError(err)
    } finally {
      setBusy(false)
    }
  }

  const src = preview ?? avatarSrc(user.avatarUrl, env.socketUrl)

  return (
    <div className={styles.field}>
      {source && (
        <AvatarCropper
          source={source}
          busy={busy}
          onCancel={closeCropper}
          onConfirm={(crop) => void onCrop(crop)}
        />
      )}

      {/* No visible label: the card this sits in is titled "Your details" and the button
       * says what it does, so a third "Profile picture" heading is only noise. The file
       * input keeps its `aria-label` below, which is what the a11y tree reads. */}
      <div className={styles.row}>
        {src ? (
          <img className={styles.preview} src={src} alt="" />
        ) : (
          <span className={styles.previewFallback} aria-hidden="true">
            {user.displayName.charAt(0).toUpperCase()}
          </span>
        )}

        <div className={styles.controls}>
          <div className={styles.buttons}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className={styles.spinner} /> : <Upload />}
              {busy ? t('auth.profile.avatarUploading') : t('auth.profile.avatarChoose')}
            </Button>
            {user.avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void onRemove()}
              >
                {t('auth.profile.avatarRemove')}
              </Button>
            )}
          </div>
          <span className={styles.hint}>{t('auth.profile.avatarHint')}</span>
        </div>
      </div>

      <input
        ref={inputRef}
        className={styles.input}
        type="file"
        accept={ACCEPT}
        aria-label={t('auth.fields.avatar')}
        onChange={(e) => void onPick(e.target.files?.[0])}
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
