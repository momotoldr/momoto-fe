import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import styles from './ErrorCard.module.scss'

interface Props {
  title: string
  message: string
  /** Buttons/links for recovery. */
  children?: ReactNode
}

/**
 * Presentational "something failed" card. Shared by the two boundaries that can show a
 * terminal error — the provider-level `ErrorBoundary` and the router's
 * `RouteErrorBoundary` — so both look identical.
 *
 * Pure presentation: no state, no error handling of its own.
 */
export function ErrorCard({ title, message, children }: Props) {
  return (
    <div className={styles.wrapper} role="alert">
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">
          <TriangleAlert size={26} />
        </span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{message}</p>
        {children ? <div className={styles.actions}>{children}</div> : null}
      </div>
    </div>
  )
}

export default ErrorCard
