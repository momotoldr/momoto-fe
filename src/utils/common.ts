export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Resolve a user's `avatarUrl` into something an `<img src>` can load.
 *
 * The backend may return an API-relative path (`/avatars/<id>?v=…`), which would
 * otherwise resolve against *this* origin rather than the API's. Anything absolute —
 * the CDN copy of an uploaded avatar, or a Google-hosted picture — passes through
 * untouched, so the caller never has to know which of the three it got.
 */
export function avatarSrc(avatarUrl: string | null | undefined, apiBaseUrl: string): string | null {
  if (!avatarUrl) return null
  if (!avatarUrl.startsWith('/')) return avatarUrl
  return `${apiBaseUrl.replace(/\/$/, '')}${avatarUrl}`
}

/**
 * Narrow a `?redirect=` value to a path inside this app, falling back to `fallback`.
 *
 * The login and register pages send the user wherever this query parameter points
 * after a successful sign-in, and anyone can put a link in front of a user. Without
 * this, `?redirect=//evil.example` sends a freshly-authenticated person to someone
 * else's site — the classic phishing hand-off, and more convincing precisely because
 * the journey started on the real login page.
 *
 * Accept only a single leading slash. `//host` and `/\host` are both read as
 * protocol-relative URLs by browsers, and a backslash is *not* interchangeable with a
 * slash for parsers, which is how these filters are usually slipped past.
 */
export function safeRedirectPath(value: string | null, fallback: string): string {
  if (!value) return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
