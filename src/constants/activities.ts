import type { ComponentType } from 'react'
import { BookHeart, Camera } from 'lucide-react'

import { ROUTES } from '@/constants/routes'
import { env } from '@/env'

/** A live Momoto activity (menu item). Only shipped activities are listed; what's next
 * is teased by one generic note on the pages rather than named here. `key` maps to
 * copy under `activities.items.<key>.*`. */
export interface Activity {
  key: string
  Icon: ComponentType<{ className?: string }>
  /** Destination route. */
  to: string
}

export const ACTIVITIES: Activity[] = [
  { key: 'photobooth', Icon: Camera, to: ROUTES.photobooth },
  // Live only where its routes are registered (`VITE_SCRAPBOOK_ENABLED`); otherwise not
  // listed at all.
  ...(env.scrapbookEnabled ? [{ key: 'scrapbook', Icon: BookHeart, to: ROUTES.scrapbook }] : []),
]
