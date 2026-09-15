import { create } from 'zustand'

import { clearStoredToken } from '@/constants/auth'
import type { User } from '@/types/authType'

/**
 * `loading` while the initial `getMe` hydration is in flight (avoids a redirect
 * flash on protected routes); then `authenticated` / `unauthenticated`.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  user: User | null
  status: AuthStatus
  /** Convenience flag mirrored from `status`. */
  isAuthenticated: boolean

  /** After login / register / google / refresh / getMe — mark the session live. */
  setSession: (user: User) => void
  /** After a profile edit — update the cached user without changing status. */
  setUser: (user: User) => void
  /** No user was found during hydration (no/invalid token). */
  setUnauthenticated: () => void
  /** Local sign-out — drops the token + user (does not call the server). */
  clearLocal: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  isAuthenticated: false,

  setSession: (user) => set({ user, status: 'authenticated', isAuthenticated: true }),
  setUser: (user) => set({ user }),
  setUnauthenticated: () => set({ user: null, status: 'unauthenticated', isAuthenticated: false }),
  clearLocal: () => {
    clearStoredToken()
    set({ user: null, status: 'unauthenticated', isAuthenticated: false })
  },
}))
