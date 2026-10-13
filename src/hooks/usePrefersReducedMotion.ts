import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

const getSnapshot = () => window.matchMedia(QUERY).matches

/** No window, no preference to read — assume motion is fine. */
const getServerSnapshot = () => false

/**
 * Whether the user has asked the OS for less motion. Live: flipping the setting while
 * the page is open re-renders the caller, so a JS-driven animation can follow it the
 * way a CSS `@media (prefers-reduced-motion: reduce)` block does.
 *
 * For animations that only CSS drives, keep the media query in the stylesheet — this
 * is for the ones started from script (`element.animate`, timers, scroll).
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
