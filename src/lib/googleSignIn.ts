import { ROUTES } from '@/constants/routes'
import { env } from '@/env'
import { safeRedirectPath } from '@/utils/common'

/**
 * "Continue with Google", as a plain redirect.
 *
 * We build Google's authorization URL ourselves rather than use its JS popup clients:
 * the popup code client always sends `prompt=consent` + `access_type=offline`, so every
 * sign-in was a fresh grant and Google mailed the user "you shared data with Momoto"
 * each time. Here consent is asked once (`prompt=select_account` only picks the
 * account) and no long-lived access is requested — momoto-core reads one ID token.
 *
 * The round trip: the button stores a `state` and a PKCE verifier in sessionStorage
 * and sends the tab to Google; Google sends it back to `/auth/google/callback?code&state`;
 * that page checks `state` and posts code + verifier to `POST /auth/google`, which
 * redeems them with the client secret.
 */

const STORAGE_KEY = 'google_sign_in'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

/** What the button leaves for the callback page. */
export interface PendingGoogleSignIn {
  /** Must come back unchanged from Google — proves this tab started the sign-in. */
  state: string
  /** PKCE secret; only its SHA-256 went to Google. */
  codeVerifier: string
  /** Where to go once signed in. */
  returnTo: string
  /** The page the button was on, to go back to if sign-in doesn't complete. */
  from: string
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function randomToken(byteLength: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

/**
 * The callback URL for *this* origin. It must be registered as an Authorized redirect
 * URI on the OAuth client, and momoto-core only accepts its own origins' ones.
 */
export function googleRedirectUri(): string {
  return `${window.location.origin}${ROUTES.googleCallback}`
}

/** Leave for Google's sign-in page. Resolves only if the browser didn't navigate. */
export async function startGoogleSignIn(returnTo: string, from: string): Promise<void> {
  const state = randomToken(16)
  // 32 random bytes → 43 base64url characters, the shortest verifier RFC 7636 allows.
  const codeVerifier = randomToken(32)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))

  const pending: PendingGoogleSignIn = { state, codeVerifier, returnTo, from }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending))

  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: base64Url(new Uint8Array(digest)),
    code_challenge_method: 'S256',
    prompt: 'select_account',
    access_type: 'online',
  })
  window.location.assign(`${AUTH_ENDPOINT}?${params.toString()}`)
}

/**
 * Read — and forget — what `startGoogleSignIn` stored. One-shot, so a reload of the
 * callback page can't replay a code. Null when there's nothing (or nothing usable).
 */
export function takeGoogleSignIn(): PendingGoogleSignIn | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as Partial<PendingGoogleSignIn>
    if (typeof pending.state !== 'string' || typeof pending.codeVerifier !== 'string') {
      return null
    }
    return {
      state: pending.state,
      codeVerifier: pending.codeVerifier,
      returnTo: safeRedirectPath(pending.returnTo ?? null, ROUTES.activities),
      from: safeRedirectPath(pending.from ?? null, ROUTES.login),
    }
  } catch {
    return null
  }
}
