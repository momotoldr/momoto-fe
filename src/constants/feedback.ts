import type { SupportTopic } from '@/types/feedbackType'

/**
 * The star values a rating can take, in display order. Shared by the rating card on
 * the strip result screen and the aria labels that describe it.
 */
export const FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const

/**
 * Cap on the optional comment that can ride along with a rating. Well under the
 * server's 4000-character message limit on purpose: this is a line or two beside the
 * stars, not the long-form box the feedback button opens.
 */
export const FEEDBACK_NOTE_MAX = 500

/**
 * The support dialog's topics, in the order they're offered. Copy lives at
 * `support.topics.<topic>.{label,hint,placeholder}`. `other` stays last: it's the
 * catch-all for anything the rest don't name.
 */
export const SUPPORT_TOPICS: readonly SupportTopic[] = [
  'session',
  'strip',
  'payment',
  'account',
  'other',
]
