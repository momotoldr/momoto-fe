import type { ComponentType } from 'react'
import { Binoculars, Camera, Heart, Pen } from 'lucide-react'

import { ROUTES } from '@/constants/routes'

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
  { key: 'draw', Icon: Pen, available: false },
  { key: 'lovematch', Icon: Heart, available: false },
  { key: 'spot', Icon: Binoculars, available: false },
]
