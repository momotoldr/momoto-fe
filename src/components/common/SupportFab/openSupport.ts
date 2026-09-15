/**
 * The one-way channel into the support dialog.
 *
 * A window event rather than a shared store: there is exactly one `SupportFab`,
 * mounted in `RootLayout`, and exactly one thing to say to it. A store would be state
 * nobody reads. It lives in its own module so the FAB file stays components-only
 * (Fast Refresh gives up on a file that exports both).
 */
export const OPEN_SUPPORT_EVENT = 'momoto:support-open'

/** Open the support dialog from anywhere (a no-op if the FAB isn't mounted). */
export function openSupportDialog(): void {
  window.dispatchEvent(new Event(OPEN_SUPPORT_EVENT))
}
