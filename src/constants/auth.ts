/**
 * Storage key for the access token.
 *
 * The short-lived access token lives in localStorage (persisted, shared across
 * tabs). This is safe here because the long-lived, higher-value refresh token is a
 * separate httpOnly cookie that JavaScript can't read; a stolen access token also
 * expires quickly. All access goes through the helpers below so the storage
 * backend stays in one place (easy to switch to in-memory later if hardening XSS).
 */
export const AUTH_TOKEN_KEY = 'auth_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY)
}
