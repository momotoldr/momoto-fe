import { getStoredToken } from '@/constants/auth'
import { env } from '@/env'

/**
 * Linking this browser's anonymous id to the signed-in account, so "what did this user
 * do" is answerable in momoto-analytics — and unlinking it when the account is deleted.
 *
 * Plain `fetch`, deliberately not `axiosClient`: a failed analytics call is not evidence
 * about momoto-core, and must never touch the server/network stores, trigger a token
 * refresh, or sign anyone out. Every failure here is silent.
 */

function identifyUrl(): string {
  return `${env.analyticsUrl.replace(/\/+$/, '')}/v1/b/identify`
}

/** `POST /v1/b/identify { anonId }` with the access token. Best-effort. */
export async function linkAnonId(anonId: string): Promise<void> {
  const token = getStoredToken()
  if (!env.analyticsEnabled || !token) return
  try {
    await fetch(identifyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ anonId }),
      credentials: 'omit',
    })
  } catch {
    // Offline or blocked: the next page load links it.
  }
}

/**
 * `DELETE /v1/b/identify` — unlink every browser from the account. Called right after a
 * successful account deletion with the token captured beforehand (it still verifies
 * until it expires). `keepalive`, because the page navigates away immediately. If it
 * never arrives, the link still expires with the analytics retention window.
 */
export function unlinkAccount(token: string | null): void {
  if (!env.analyticsEnabled || !token) return
  fetch(identifyUrl(), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'omit',
    keepalive: true,
  }).catch(() => {})
}
