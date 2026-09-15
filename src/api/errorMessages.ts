import { API_ROUTES } from './apiRoutes'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type EndpointMessages = Partial<Record<HttpMethod, string>>

/**
 * Endpoint-specific fallback messages surfaced as `ApiError.userMessage`, as
 * **i18n keys** (translated at display time — see `resolveAuthError`). These are
 * last-resort copy for an *unexpected* failure (network fault, 429, 5xx).
 * Expected, actionable outcomes (a typo'd / full / ended room) are modeled as data —
 * `GET /rooms/:id` returns `{ status }` with 200 — and mapped to localized copy by
 * the caller (`PhotoboothPage`), so they never reach here.
 */
const API_ERROR_MESSAGES: Record<string, EndpointMessages> = {
  // ── Auth ──────────────────────────────────────────────────────
  [API_ROUTES.AUTH.REGISTER]: {
    POST: 'errors.api.register',
  },
  [API_ROUTES.AUTH.LOGIN]: {
    POST: 'errors.api.login',
  },
  [API_ROUTES.AUTH.GOOGLE]: {
    POST: 'errors.api.google',
  },
  [API_ROUTES.AUTH.ME]: {
    GET: 'errors.api.loadAccount',
    PATCH: 'errors.api.saveProfile',
  },
  [API_ROUTES.AUTH.EMAIL]: {
    POST: 'errors.api.setEmail',
  },
  [API_ROUTES.AUTH.EMAIL_RESEND]: {
    POST: 'errors.api.setEmail',
  },
  [API_ROUTES.AUTH.VERIFY_EMAIL]: {
    POST: 'errors.api.verifyEmail',
  },
  [API_ROUTES.AUTH.PASSWORD]: {
    POST: 'errors.api.changePassword',
  },
  [API_ROUTES.AUTH.FORGOT_PASSWORD]: {
    POST: 'errors.api.forgotPassword',
  },
  [API_ROUTES.AUTH.RESET_PASSWORD]: {
    GET: 'errors.api.resetPassword',
    POST: 'errors.api.resetPassword',
  },

  // ── Rooms ─────────────────────────────────────────────────────
  [API_ROUTES.ROOMS.CREATE]: {
    POST: 'errors.api.createRoom',
  },
  [API_ROUTES.ROOMS.BY_ID.pattern]: {
    GET: 'errors.api.checkRoom',
  },

  // ── TURN / WebRTC ─────────────────────────────────────────────
  [API_ROUTES.TURN.CREDENTIALS]: {
    GET: 'errors.api.videoSetup',
  },
}

/** i18n key returned when no endpoint-specific message matches. */
const DEFAULT_ERROR_KEY = 'errors.api.generic'

const stripQueryParams = (url: string): string => {
  if (!url) return ''
  return url.split('?')[0]
}

/**
 * Convert a route with `:param` placeholders to a regex.
 * Example: '/rooms/:id' → /^\/rooms\/([^/?]+)$/
 */
const patternToRegex = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match a single path segment (stop at `/` and `?`) so `/rooms/:id` doesn't
  // also match `/rooms/a/b/c`.
  const regexStr = escaped.replace(/:[^/]+/g, '([^/?]+)')
  return new RegExp(`^${regexStr}$`)
}

// Finds the best matching API route key for a given URL
const findEndpoint = (url: string, routes: string[]): string | null => {
  const cleanUrl = stripQueryParams(url)

  // Exact match
  if (routes.includes(cleanUrl)) return cleanUrl

  // Dynamic pattern match
  const patternMatch = routes.find((route) => patternToRegex(route).test(cleanUrl))
  if (patternMatch) return patternMatch

  // Prefix match with slash boundary
  const prefixMatch = routes.find((route) => cleanUrl === route || cleanUrl.startsWith(`${route}/`))
  if (prefixMatch) return prefixMatch

  return null
}

/** Returns the i18n key for an endpoint's fallback error (translate before display). */
export const getUserErrorMessage = (url: string, method: string = 'GET'): string => {
  const apiMethod = method.toUpperCase() as HttpMethod
  const routes = Object.keys(API_ERROR_MESSAGES)
  const endpoint = findEndpoint(url, routes)

  if (endpoint && API_ERROR_MESSAGES[endpoint]?.[apiMethod]) {
    return API_ERROR_MESSAGES[endpoint][apiMethod]!
  }

  return DEFAULT_ERROR_KEY
}
