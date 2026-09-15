import { z } from 'zod'

/**
 * Central schema definitions for the app's forms (zod-based).
 *
 * Consumed through `@hookform/resolvers/zod` (`zodResolver`) in the auth pages.
 * Validation messages are **i18n keys**, not literal copy — the form fields
 * translate them via `t(key)` (see `components/formFields`), so both `en` and
 * `id` stay covered.
 */

export const MIN_PASSWORD = 8

// Usernames are alphanumeric only (no special characters), case-insensitive, 3–20 chars.
const USERNAME_RE = /^[a-zA-Z0-9]+$/

const usernameSchema = z
  .string()
  .trim()
  .min(1, 'auth.errors.usernameRequired')
  .regex(USERNAME_RE, 'auth.errors.usernameInvalid')
  .min(3, 'auth.errors.usernameTooShort')
  .max(20, 'auth.errors.usernameTooLong')

/** Login only needs a non-empty username; the server is the authority on the credentials. */
const loginUsernameSchema = z.string().trim().min(1, 'auth.errors.usernameRequired')

/** Login only requires a non-empty password (existing accounts may predate the min length). */
const passwordSchema = z.string().min(1, 'auth.errors.passwordRequired')

/** Registration enforces the minimum length on top of "required". */
const newPasswordSchema = z
  .string()
  .min(1, 'auth.errors.passwordRequired')
  .min(MIN_PASSWORD, 'auth.errors.passwordTooShort')

/**
 * Deliberately loose, mirroring the server's own check (`lib/email.ts`). A regex that
 * tries to implement the RFC rejects addresses that genuinely work and still can't
 * tell you whether the mailbox exists — the confirmation link is what proves that.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'auth.errors.emailRequired')
  .max(254, 'auth.errors.emailTooLong')
  .regex(EMAIL_RE, 'auth.errors.emailInvalid')

// Letters and spaces only — no digits or special characters.
const DISPLAY_NAME_RE = /^[A-Za-z\s]+$/

const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'auth.errors.displayNameRequired')
  .regex(DISPLAY_NAME_RE, 'auth.errors.displayNameInvalid')

export const loginSchema = z.object({
  username: loginUsernameSchema,
  password: passwordSchema,
})

export const registerSchema = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: newPasswordSchema,
})

/** Adding or replacing the address on an existing account (Profile). */
export const emailFormSchema = z.object({ email: emailSchema })

/**
 * Changing the password while signed in. `currentPassword` is required only when the
 * account has one — a Google-only account is *setting* a first password, with nothing
 * to re-supply — so the requirement is applied by the caller via `superRefine`.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, 'auth.errors.passwordRequired'),
  })
  .superRefine((values, ctx) => {
    if (values.newPassword !== values.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'auth.errors.passwordMismatch',
      })
    }
  })

/**
 * "I forgot my password." One field that takes **either** a username or an email:
 * sign-in is username-first, but people remember their address, and someone who has
 * forgotten a password won't reliably recall which of the two we hold. The server
 * accepts both, so the client shouldn't be fussier than it is.
 */
export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1, 'auth.errors.identifierRequired'),
})

/** Choosing a new password from a reset link. */
export const resetPasswordSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, 'auth.errors.passwordRequired'),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'auth.errors.passwordMismatch',
      })
    }
  })

// The profile picture is uploaded separately (see `AvatarUploadField`), so it isn't
// part of this form's values.
// Where the user lives, as the profile form holds it. Flat rather than a union so one
// controlled field can switch between the three shapes; `toLocationInput` turns it into
// what the API accepts. Mirrors the server's city-name rule in `lib/locations.ts`.
const CITY_NAME_RE = /^[\p{L}\s.'-]+$/u

export const locationSchema = z
  .object({
    kind: z.enum(['none', 'region', 'abroad']),
    // The province is only a step towards the region: it narrows the city list and is
    // never sent, since a region code already names its province.
    provinceCode: z.string(),
    regionCode: z.string(),
    countryCode: z.string(),
    cityName: z
      .string()
      .trim()
      .max(60, 'auth.errors.cityTooLong')
      .refine((v) => v === '' || CITY_NAME_RE.test(v), 'auth.errors.cityInvalid'),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'region' && !value.regionCode) {
      ctx.addIssue({
        code: 'custom',
        path: ['regionCode'],
        message: 'auth.errors.regionRequired',
      })
    }
    if (value.kind === 'abroad' && !value.countryCode) {
      ctx.addIssue({
        code: 'custom',
        path: ['countryCode'],
        message: 'auth.errors.countryRequired',
      })
    }
  })

export const profileSchema = z.object({
  displayName: displayNameSchema,
  location: locationSchema,
})

// Lenient superset of the 6-char mint format — obvious garbage is rejected without a
// round-trip, while the server lookup stays the authority on whether a code exists.
const roomCodeSchema = z
  .string()
  .trim()
  .min(1, 'photobooth.codeRequired')
  .regex(/^[A-Za-z0-9]{4,12}$/, 'photobooth.codeInvalid')

export const joinRoomSchema = z.object({ code: roomCodeSchema })

// Support request (see `components/common/SupportFab`), the app's one "something's
// wrong" form. The reply-to email is required — a support request we can't answer is a
// dead end — and the message carries the rest. Unprompted opinions are a star rating on
// the strip result screen instead (`features/compose/StripRating`), which needs no
// schema of its own. Loose email shape, mirroring the server's own check.
const SUPPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const supportSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'support.errors.messageRequired')
    .max(4000, 'support.errors.messageTooLong'),
  email: z
    .string()
    .trim()
    .min(1, 'support.errors.emailRequired')
    .max(254, 'support.errors.emailTooLong')
    .refine((v) => v === '' || SUPPORT_EMAIL_RE.test(v), 'support.errors.emailInvalid'),
})

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
export type EmailFormValues = z.infer<typeof emailFormSchema>
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
export type ProfileValues = z.infer<typeof profileSchema>
export type LocationValues = z.infer<typeof locationSchema>
export type JoinRoomValues = z.infer<typeof joinRoomSchema>
export type SupportValues = z.infer<typeof supportSchema>
