import { ReactNode } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { I18nextProvider } from 'react-i18next'

import ErrorBoundary from '@/components/common/ErrorBoundary'
import SuspenseWrapper from '@/components/common/Loading/SuspenseWrapper'
import { env } from '@/env'
import i18n from '@/lib/i18n'

import { AuthProvider } from './AuthProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  // GoogleOAuthProvider is only useful with a configured client id; when unset
  // (Google sign-in disabled), skip it so it doesn't warn about a missing id.
  const withGoogle = (node: ReactNode) =>
    env.googleClientId ? (
      <GoogleOAuthProvider clientId={env.googleClientId}>{node}</GoogleOAuthProvider>
    ) : (
      node
    )

  return (
    <I18nextProvider i18n={i18n}>
      {withGoogle(
        <ErrorBoundary>
          <SuspenseWrapper>
            <AuthProvider>{children}</AuthProvider>
          </SuspenseWrapper>
        </ErrorBoundary>
      )}
    </I18nextProvider>
  )
}
