import { Loader2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import styles from './Loading.module.scss'

interface LoadingProps {
  text?: string
}

export const Loading = ({ text }: LoadingProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <Loader2Icon className={styles.spinner} aria-hidden="true" />
      <span className={styles.text}>{text ?? t('common.loading')}</span>
    </div>
  )
}
