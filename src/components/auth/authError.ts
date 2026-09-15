import type { TFunction } from 'i18next'

import ApiError from '@/api/apiError'

/** Backend error codes we have localized copy for (`auth.errors.<code>`). */
const KNOWN_CODES = new Set([
  'invalid_credentials',
  'registration_closed',
  'username_taken',
  'email_taken',
  'invalid_input',
  'unsupported_image',
  'image_not_square',
  'image_too_large',
  'storage_unavailable',
  'google_not_configured',
  'invalid_google_token',
  'too_many_requests',
  'invalid_password',
  'email_unverified',
  'invalid_token',
  'nothing_pending',
  'invite_invalid',
  'invite_self',
  'already_linked',
  'partner_linked',
])

/**
 * Resolves an API error to a friendly, localized message: a known backend code →
 * `auth.errors.<code>`; otherwise the endpoint's `userMessage` (an i18n key set by
 * the axios layer); otherwise a generic. Every branch is translated.
 */
export function resolveAuthError(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    if (err.code && KNOWN_CODES.has(err.code)) return t(`auth.errors.${err.code}`)
    if (err.userMessage) return t(err.userMessage)
  }
  return t('auth.errors.generic')
}
