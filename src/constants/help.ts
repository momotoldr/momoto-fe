import { env } from '@/env'
import type { SupportTopic } from '@/types/feedbackType'

/** The FAQ's questions, in the order they get asked. Copy lives at `help.items.<key>.{q,a}`. */
export const HELP_FAQ_KEYS = ['install', 'free', 'print', 'friend', 'privacy', 'need'] as const

/**
 * One troubleshooting entry inside a help category. Copy lives at
 * `help.categories.<topic>.issues.<key>.{q,a,steps?}` — `steps` is an optional list.
 *
 * `shown` hides an entry whose feature is switched off in this build: a "my payment QR
 * expired" answer is noise on a site that never asks anyone to pay.
 */
export interface HelpIssue {
  key: string
  shown?: boolean
}

/**
 * The Help Center's categories — deliberately the support dialog's topics
 * (`SUPPORT_TOPICS`), in the same order and under the same labels, so "Contact support
 * about this" lands on a dropdown that already names the category the reader was in.
 * Each lists the issues that most often bring someone to that topic.
 */
export const HELP_CATEGORIES: Record<SupportTopic, readonly HelpIssue[]> = {
  session: [
    { key: 'camera' },
    { key: 'code' },
    { key: 'peer' },
    { key: 'dropped' },
    { key: 'start' },
    { key: 'timesUp' },
    { key: 'busy' },
  ],
  strip: [
    { key: 'missing' },
    { key: 'watermark' },
    { key: 'download' },
    { key: 'different' },
    { key: 'retake' },
    { key: 'remove' },
    { key: 'backdrop', shown: env.backdropsEnabled },
  ],
  payment: [
    { key: 'unlock' },
    { key: 'paidLocked', shown: env.paymentsEnabled },
    { key: 'expired', shown: env.paymentsEnabled },
    { key: 'galleryFull' },
    { key: 'noPrintable' },
    { key: 'refund', shown: env.paymentsEnabled },
  ],
  account: [
    { key: 'signIn' },
    { key: 'forgot' },
    { key: 'verify' },
    { key: 'partner' },
    { key: 'signup', shown: env.betaMode },
    { key: 'delete' },
  ],
  other: [{ key: 'bug' }, { key: 'connection' }, { key: 'idea' }, { key: 'data' }],
}
