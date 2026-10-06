import type { SupportTopic } from '@/types/feedbackType'

/**
 * The one-way channel into the support dialog.
 *
 * A window event rather than a shared store: there is exactly one `SupportFab`,
 * mounted in `RootLayout`, and exactly one thing to say to it. A store would be state
 * nobody reads. It lives in its own module so the FAB file stays components-only
 * (Fast Refresh gives up on a file that exports both).
 */
export const OPEN_SUPPORT_EVENT = 'momoto:support-open'

/** The event's payload: a topic to skip straight to, if the caller already knows it. */
export type OpenSupportDetail = { topic?: SupportTopic }

/**
 * Open the support dialog from anywhere (a no-op if the FAB isn't mounted). With a
 * `topic`, it opens on the message step for that topic instead of the topic picker —
 * for a caller that already knows what the trouble is about (a failed checkout).
 */
export function openSupportDialog(topic?: SupportTopic): void {
  window.dispatchEvent(
    new CustomEvent<OpenSupportDetail>(OPEN_SUPPORT_EVENT, { detail: { topic } })
  )
}
