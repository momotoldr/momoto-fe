import { GoogleLogin } from '@react-oauth/google'

import { loginWithGoogle } from '@/api/services/authService'
import { env } from '@/env'
import type { User } from '@/types/authType'

interface GoogleButtonProps {
  onSuccess: (user: User) => void
  onError: () => void
}

/**
 * "Sign in with Google" — renders nothing when Google sign-in isn't configured
 * (no `VITE_GOOGLE_CLIENT_ID`), so the surrounding divider can hide too. On a
 * successful credential it exchanges the Google ID token for a Momoto session.
 */
export function GoogleButton({ onSuccess, onError }: GoogleButtonProps) {
  if (!env.googleClientId) return null

  return (
    <GoogleLogin
      onSuccess={(credential) => {
        const idToken = credential.credential
        if (!idToken) {
          onError()
          return
        }
        loginWithGoogle(idToken).then(onSuccess).catch(onError)
      }}
      onError={onError}
    />
  )
}
