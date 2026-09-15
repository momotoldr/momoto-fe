import { clearStoredToken, getStoredToken, setStoredToken } from '@/constants/auth'
import i18n from '@/lib/i18n'
import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  MeResponse,
  PendingEmailResponse,
  RegisterRequest,
  UpdateProfileRequest,
  User,
} from '@/types/authType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const authClient = new AxiosClient()

/** True if an access token is present (optimistic — the server is authoritative). */
export function hasStoredToken(): boolean {
  return !!getStoredToken()
}

export async function register(body: RegisterRequest): Promise<User> {
  const { data } = await authClient.postData<AuthResponse>(API_ROUTES.AUTH.REGISTER, {
    lang: i18n.language,
    ...body,
  })
  setStoredToken(data.accessToken)
  return data.user
}

export async function login(body: LoginRequest): Promise<User> {
  const { data } = await authClient.postData<AuthResponse>(API_ROUTES.AUTH.LOGIN, body)
  setStoredToken(data.accessToken)
  return data.user
}

export async function loginWithGoogle(idToken: string): Promise<User> {
  const { data } = await authClient.postData<AuthResponse>(API_ROUTES.AUTH.GOOGLE, { idToken })
  setStoredToken(data.accessToken)
  return data.user
}

/** Loads the current user (used for session hydration on app load). */
export async function getMe(): Promise<User> {
  const { data } = await authClient.getData<MeResponse>(API_ROUTES.AUTH.ME)
  return data.user
}

export async function updateProfile(body: UpdateProfileRequest): Promise<User> {
  const { data } = await authClient.patchData<MeResponse>(API_ROUTES.AUTH.ME, body)
  return data.user
}

/**
 * Replace the profile picture. The blob is already cropped and re-encoded by
 * `cropToAvatarBlob`, and goes up as a raw body — there's one file and no other
 * fields, so multipart would only add framing.
 */
export async function uploadAvatar(image: Blob): Promise<User> {
  const { data } = await authClient.postData<MeResponse>(API_ROUTES.AUTH.AVATAR, image, {
    headers: { 'Content-Type': image.type },
  })
  return data.user
}

/** Remove the uploaded picture, falling back to the initial-letter placeholder. */
export async function removeAvatar(): Promise<User> {
  const { data } = await authClient.deleteData<MeResponse>(API_ROUTES.AUTH.AVATAR)
  return data.user
}

/** Revokes the refresh token server-side, then clears the local access token. */
export async function logout(): Promise<void> {
  try {
    await authClient.postData(API_ROUTES.AUTH.LOGOUT)
  } finally {
    clearStoredToken()
  }
}

/**
 * Permanently delete the current account. Accounts with a password must re-supply it
 * (the server verifies). Only clears the local token on success — a failed attempt
 * (e.g. wrong password) leaves the session intact so the user can retry.
 */
export async function deleteAccount(password?: string): Promise<void> {
  await authClient.deleteData(API_ROUTES.AUTH.ME, { data: password ? { password } : {} })
  clearStoredToken()
}

/**
 * Claim an email address for the signed-in account. Mails a confirmation link and
 * returns the (normalized) address it went to — the server does not change the
 * account until that link is opened, so nothing here is final.
 */
export async function setEmail(email: string): Promise<string> {
  const { data } = await authClient.postData<PendingEmailResponse>(API_ROUTES.AUTH.EMAIL, {
    email,
    lang: i18n.language,
  })
  return data.pendingEmail
}

/** Re-send the pending confirmation link (a fresh token; the older link stops working). */
export async function resendVerification(): Promise<string> {
  const { data } = await authClient.postData<PendingEmailResponse>(API_ROUTES.AUTH.EMAIL_RESEND, {
    lang: i18n.language,
  })
  return data.pendingEmail
}

/**
 * Prove an address using the token from the emailed link.
 *
 * Deliberately usable signed out — these links are opened on phones and in webmail
 * previews as often as in the session that asked for them.
 */
export async function verifyEmail(token: string): Promise<User> {
  const { data } = await authClient.postData<MeResponse>(API_ROUTES.AUTH.VERIFY_EMAIL, { token })
  return data.user
}

/**
 * Change (or, for a Google-only account, set) the password while signed in.
 *
 * Every other device is signed out server-side; this one is re-issued a session, so
 * the caller stays signed in.
 */
export async function changePassword(body: ChangePasswordRequest): Promise<void> {
  const { data } = await authClient.postData<{ accessToken: string }>(API_ROUTES.AUTH.PASSWORD, {
    ...body,
    lang: i18n.language,
  })
  setStoredToken(data.accessToken)
}

/**
 * Ask for a password-reset link.
 *
 * **Always resolves**, whatever the identifier was. The server answers identically
 * for an unknown account on purpose (it would otherwise be a way to test whether a
 * username exists), so there is nothing here for the caller to branch on — show the
 * same confirmation either way.
 */
export async function requestPasswordReset(identifier: string): Promise<void> {
  await authClient.postData(API_ROUTES.AUTH.FORGOT_PASSWORD, {
    identifier,
    lang: i18n.language,
  })
}

/** Is a reset link still good? Lets the page say "expired" before asking for a password. */
export async function checkResetToken(token: string): Promise<boolean> {
  const { data } = await authClient.getData<{ valid: boolean }>(API_ROUTES.AUTH.RESET_PASSWORD, {
    token,
  })
  return data.valid
}

/**
 * Redeem a reset link. No session comes back by design — the user signs in with the
 * password they just chose.
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  await authClient.postData(API_ROUTES.AUTH.RESET_PASSWORD, {
    token,
    password,
    lang: i18n.language,
  })
}
