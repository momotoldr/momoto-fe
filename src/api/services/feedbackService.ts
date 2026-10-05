import { tracker } from '@/analytics'
import type { FeedbackInput } from '@/types/feedbackType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const client = new AxiosClient()

/**
 * Submit a feedback / support message. Works signed-in or anonymous — the axios
 * interceptor attaches the access token when there is one, so the server can tie the
 * message to its author. Throws `ApiError` on failure (the caller toasts).
 *
 * Every submission carries the current analytics visit id (`sessionId`), so the sender's
 * event timeline can be looked up from the message in the admin portal. It is null when
 * tracking is off or this visit was sampled out, and is never shown to the sender.
 */
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  await client.postData(API_ROUTES.FEEDBACK.ROOT, {
    ...input,
    sessionId: tracker.getIdentity()?.sessionId ?? null,
  })
}
