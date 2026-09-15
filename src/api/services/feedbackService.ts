import type { FeedbackInput } from '@/types/feedbackType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const client = new AxiosClient()

/**
 * Submit a feedback / support message. Works signed-in or anonymous — the axios
 * interceptor attaches the access token when there is one, so the server can tie the
 * message to its author. Throws `ApiError` on failure (the caller toasts).
 */
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  await client.postData(API_ROUTES.FEEDBACK.ROOT, input)
}
