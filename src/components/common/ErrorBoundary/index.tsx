import { RotateCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

import { ErrorCard } from '@/components/common/ErrorCard'
import { Button } from '@/components/ui/button'
import i18n from '@/lib/i18n'
import { reportError } from '@/lib/reportError'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Guards the **provider layer** — everything outside the router: `AuthProvider`,
 * `SuspenseWrapper`, `Toaster`, `GoogleOAuthProvider`.
 *
 * It deliberately does *not* cover page crashes: `RouterProvider` catches those itself
 * and never rethrows, so they can't reach up here. Those are handled by
 * `RouteErrorBoundary`, registered as the router's `errorElement`.
 *
 * Uses `i18n.t` rather than the `useTranslation` hook because this must be a class
 * component (only class components can be error boundaries). Fine here: i18n is
 * initialized synchronously from bundled resources, and this screen is terminal.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, { source: 'ErrorBoundary', componentStack: errorInfo.componentStack })
  }

  render(): ReactNode {
    const { hasError, error } = this.state
    const { children, fallback } = this.props

    if (hasError) {
      if (fallback) return fallback

      // Raw messages are dev-only — see the same note in RouteErrorBoundary.
      const detail = import.meta.env.DEV ? error?.message : undefined

      return (
        <ErrorCard
          title={i18n.t('errors.somethingWrong')}
          message={detail || i18n.t('errors.unexpected')}
        >
          <Button onClick={() => window.location.reload()}>
            <RotateCw size={16} />
            {i18n.t('errors.refresh')}
          </Button>
        </ErrorCard>
      )
    }

    return children
  }
}
