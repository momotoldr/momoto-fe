import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import styles from './ProfileCard.module.scss'

interface ProfileCardProps {
  title: string
  /** One line under the heading. Omit where the heading says everything. */
  subtitle?: string
  /** Extra classes for the card itself (a panel occasionally needs its own padding). */
  className?: string
  children: ReactNode
}

/** The white rounded card every profile panel is built from. */
export function ProfileCard({ title, subtitle, className, children }: ProfileCardProps) {
  return (
    <section className={cn(styles.card, className)}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}
