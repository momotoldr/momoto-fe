/**
 * Single funnel for unexpected, user-visible failures (render crashes caught by an
 * error boundary or the router's error element).
 *
 * Today it only logs. It exists so that wiring an error reporter is a one-place change
 * rather than a hunt through every `catch` — see the TODO below.
 */

interface ErrorContext {
  /** Where it was caught, e.g. 'ErrorBoundary' or 'RouteErrorBoundary'. */
  source: string
  /** React's component stack, when the caller has one. `null` is what React itself
   *  passes when it has no stack to give, so accept it rather than making every
   *  caller coerce. */
  componentStack?: string | null
}

export function reportError(error: unknown, context: ErrorContext): void {
  // Console first, always — this is what you have in a local dev session.
  console.error(`[${context.source}]`, error, context.componentStack ?? '')

  // TODO: forward to Sentry once a DSN is provisioned (see DEPLOYMENT.md go-live
  // checklist). Deliberately not installed yet — it needs a project + DSN, and the
  // DSN must come from a VITE_SENTRY_DSN build var, not a committed constant:
  //   Sentry.captureException(error, { tags: { source: context.source } })
}

/**
 * Best-effort human-readable message for an unknown thrown value. Anything can be
 * thrown in JS, so this narrows before touching `.message`.
 */
export function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return undefined
}
