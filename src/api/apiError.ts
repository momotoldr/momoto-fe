interface ApiErrorDetail {
  code?: string
  cause?: string
}

/**
 * Normalized error thrown by every API call. The Axios interceptors translate any
 * failure (server error envelope, non-2xx, or a network fault) into this shape so
 * callers only ever catch one thing.
 *
 * - `code` — machine-readable server error code (from the response `errors[]`).
 * - `status` — HTTP status (0 when the request never reached the server).
 * - `message` — the technical/developer message (from `super(message)`).
 * - `errorType` — Axios error code for transport faults (e.g. `ECONNABORTED`).
 * - `userMessage` — an endpoint-specific i18n key for a friendly fallback message
 *   (translate before display, e.g. via `resolveAuthError`).
 */
class ApiError extends Error {
  code: string
  status: number
  errorType: string
  userMessage: string

  constructor(
    code: string,
    status: number,
    message: string,
    errorType: string,
    userMessage: string
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.errorType = errorType
    this.userMessage = userMessage
  }
}

export const getApiErrorDetails = (
  errors?: ApiErrorDetail[]
): { code?: string; message?: string } => {
  if (errors && errors.length > 0) {
    return {
      code: errors[0]?.code,
      message: errors[0]?.cause,
    }
  }
  return {}
}

export default ApiError
