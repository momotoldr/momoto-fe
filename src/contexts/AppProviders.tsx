import { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'

import ErrorBoundary from '@/components/common/ErrorBoundary'
import SuspenseWrapper from '@/components/common/Loading/SuspenseWrapper'
import i18n from '@/lib/i18n'

import { AuthProvider } from './AuthProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        <SuspenseWrapper>
          <AuthProvider>{children}</AuthProvider>
        </SuspenseWrapper>
      </ErrorBoundary>
    </I18nextProvider>
  )
}
