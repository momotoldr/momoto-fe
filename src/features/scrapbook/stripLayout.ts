import type { StripLayout } from '@/constants/stripTemplates'
import type { StoredStrip } from '@/types/stripType'

/**
 * Which layout family a saved strip belongs to, read off its own shape — a stored strip
 * doesn't record its template. The two families are far apart (a 4x1 ribbon is 1:3, a 2x2
 * card is a little wider than square; see `stripTemplates.ts`), so the midpoint between
 * them is a safe line, and a future third shape would need its own family anyway.
 */
export function stripLayoutOf(strip: Pick<StoredStrip, 'width' | 'height'>): StripLayout {
  return strip.width / strip.height < 0.6 ? '4x1' : '2x2'
}
