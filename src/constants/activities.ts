import type { ComponentType } from 'react'
import { Binoculars, BookHeart, Camera, Heart, Pen } from 'lucide-react'

import { ROUTES } from '@/constants/routes'
import { env } from '@/env'

/** A Momoto activity (menu item). Available ones link somewhere; the rest are
 * teased as "coming soon". `key` maps to copy under `activities.items.<key>.*`. */
export interface Activity {
  key: string
  Icon: ComponentType<{ className?: string }>
  /** Destination route, when the activity is live. */
  to?: string
  available: boolean
}

export const ACTIVITIES: Activity[] = [
  { key: 'photobooth', Icon: Camera, to: ROUTES.photobooth, available: true },
  // Live only where its routes are registered (`VITE_SCRAPBOOK_ENABLED`); otherwise not
  // listed at all — it isn't "coming soon" to anyone who can't be told when.
  ...(env.scrapbookEnabled
    ? [{ key: 'scrapbook', Icon: BookHeart, to: ROUTES.scrapbook, available: true }]
    : []),
  { key: 'draw', Icon: Pen, available: false },
  { key: 'lovematch', Icon: Heart, available: false },
  { key: 'spot', Icon: Binoculars, available: false },
]
