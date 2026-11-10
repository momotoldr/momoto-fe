import { useSyncExternalStore } from 'react'

/** Tailwind's `lg` — where the editor's side column appears (see `ScrapbookPage.module.scss`). */
const QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

const getSnapshot = () => window.matchMedia(QUERY).matches
const getServerSnapshot = () => true

/**
 * Whether the editor is in its desktop layout (a side column) rather than its phone one.
 * Live, so turning a tablet or resizing a window switches where the strip picker opens:
 * the side column on desktop, a pop-up on a phone.
 */
export function useDesktopLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
