import { useState } from 'react'

interface UserAvatarProps {
  /** Already resolved for `<img>` — `avatarSrc()` output, or a local preview URL. */
  src: string | null
  /** Whose picture; its first letter is the fallback. */
  name: string
  imageClassName: string
  fallbackClassName: string
}

/**
 * A person's picture, or their initial on a tinted disc when there's none — *or when
 * the picture fails to load*. That last case is mostly Google: an account that never
 * uploaded one shows its Google-hosted picture, and lh3.googleusercontent.com now and
 * then refuses a load (seen right after a first Google sign-in, when several of these
 * mount at once). An `<img>` never retries, so without this it stayed a broken-image
 * icon until a reload.
 *
 * `no-referrer` removes what Google's rate limit keys on, and also stops telling Google
 * which Momoto page the viewer is on. Our own CDN and API avatars don't care.
 */
export function UserAvatar({ src, name, imageClassName, fallbackClassName }: UserAvatarProps) {
  // The URL that failed, not a flag: a new picture (a new URL) gets its own attempt
  // instead of inheriting the old one's failure.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (src && src !== failedSrc) {
    return (
      <img
        className={imageClassName}
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
      />
    )
  }
  return (
    <span className={fallbackClassName} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
