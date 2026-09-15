import { toast } from 'sonner'

import { resolveAuthError } from '@/components/auth/authError'
import i18n from '@/lib/i18n'

/**
 * Centralized user feedback via the app toaster (mounted once in `main.tsx`).
 * Prefer these over per-component error state so server / API-call errors surface
 * consistently instead of as bespoke inline banners.
 */

/** Resolve an API (or unknown) error to a localized message, then toast it. */
export function notifyError(err?: unknown): void {
  toast.error(resolveAuthError(err, i18n.t))
}

/** Toast an already-localized message. */
export function notifyMessage(message: string): void {
  toast.error(message)
}

/** Toast an already-localized success. */
export function notifySuccess(message: string): void {
  toast.success(message)
}

/** Toast an already-localized, non-fatal warning (the action still partly succeeded). */
export function notifyWarning(message: string): void {
  toast.warning(message)
}
