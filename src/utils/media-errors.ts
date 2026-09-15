export type MediaErrorKind = 'denied' | 'not-found' | 'in-use' | 'insecure' | 'unknown'

/**
 * Translate a getUserMedia rejection into a stable error kind. The user-facing
 * title/message live in the i18n resources under `mediaError.<kind>`.
 */
export function mapMediaError(err: unknown): MediaErrorKind {
  const name = err instanceof Error ? err.name : undefined

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'not-found'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'in-use'
    case 'SecurityError':
      return 'insecure'
    default:
      return 'unknown'
  }
}
