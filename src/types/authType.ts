/** A linked partner's public summary (see partner linking). */
export interface PublicPartner {
  id: string
  displayName: string
  avatarUrl: string | null
}

/** The authenticated user, as returned by the backend's auth endpoints. */
export interface User {
  id: string
  username: string
  /**
   * The account's **proven** address, or null. Only ever set by opening a
   * confirmation link (or by Google, which proves it for us) — an address the user
   * has merely typed lives in `pendingEmail` until then.
   */
  email: string | null
  /**
   * Whether `email` has been proven. False alongside a non-null `email` is a real
   * state, not a bug: an operator-created account has an address nobody confirmed.
   */
  emailVerified: boolean
  /** An address awaiting confirmation. Null when there's nothing pending. */
  pendingEmail: string | null
  displayName: string
  /**
   * An absolute URL (the CDN copy of an uploaded picture, or a Google-hosted one) or
   * an API-relative path (`/avatars/<id>?v=…`, when the backend serves the image
   * itself). Pass it through `avatarSrc()` before rendering — it handles all three.
   */
  avatarUrl: string | null
  /** True if the account has a password set (vs Google-only). */
  hasPassword: boolean
  /** True if a Google identity is linked. */
  googleLinked: boolean
  /** Where the person lives, set on the profile. Null when they haven't said. */
  location: UserLocation | null
  /** ISO-8601 timestamp of when the account was opened; the profile counts its age from it. */
  createdAt: string
  partner: PublicPartner | null
}

export interface RegisterRequest {
  username: string
  password: string
  displayName: string
  /** Required. The confirmation link goes here; the account works before it's opened. */
  email: string
  /** UI language, so the mail matches what the user is reading. */
  lang?: string
}

export interface ChangePasswordRequest {
  /** Omitted only by a Google-only account setting its first password. */
  currentPassword?: string
  newPassword: string
  /** UI language, so the "password changed" notice matches what the user is reading. */
  lang?: string
}

/** Response from the endpoints that accept an address claim. */
export interface PendingEmailResponse {
  ok: true
  pendingEmail: string
}

export interface LoginRequest {
  username: string
  password: string
}

/** Response shape for register / login / google / refresh. */
export interface AuthResponse {
  user: User
  accessToken: string
}

/** Response shape for `GET /auth/me` and `PATCH /auth/me`. */
export interface MeResponse {
  user: User
}

/**
 * A saved location: an Indonesian regency/city (`countryCode: 'ID'` + `regionCode`), or a
 * country abroad with an optional typed `cityName`.
 */
export interface UserLocation {
  countryCode: string
  regionCode: string | null
  /** Official region name ("Kota Bandung"), resolved by the server. */
  regionName: string | null
  /** The region's province, resolved by the server. Null abroad. */
  provinceCode: string | null
  provinceName: string | null
  cityName: string | null
}

/** What `PATCH /auth/me` accepts for `location`; `null` clears it. */
export type LocationInput = { regionCode: string } | { countryCode: string; cityName?: string }

export interface UpdateProfileRequest {
  displayName?: string
  location?: LocationInput | null
}

/** Response from `POST /partner/invite`. */
export interface PartnerInviteResponse {
  code: string
  expiresAt: string
}
