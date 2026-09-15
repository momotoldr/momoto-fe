import type { SessionMode } from '@/types/roomsType'

/** Whether a submission is general feedback or a support request. */
export type FeedbackCategory = 'feedback' | 'support'

/** A feedback / support submission — the floating feedback button, or a strip rating. */
export interface FeedbackInput {
  category: FeedbackCategory
  /**
   * The message body. Required unless a `rating` is supplied: the rating card beside a
   * finished strip can be one tap with nothing typed.
   */
  message?: string
  /** Optional 1–5 satisfaction rating. */
  rating?: number
  /** Optional reply-to address. */
  email?: string
  /** Where it was sent from (a page path) — a triage hint for us. */
  context?: string
  /** UI language it was written in — a testimonial's original language. */
  lang?: 'en' | 'id'
  /** Session mode of the strip being rated — a hint for a testimonial's feature tag. */
  sessionMode?: SessionMode
}
