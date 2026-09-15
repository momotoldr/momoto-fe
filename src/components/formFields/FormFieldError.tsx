import styles from './FormField.module.scss'

interface FormFieldErrorProps {
  id?: string
  error: string
}

export function FormFieldError({ id, error }: FormFieldErrorProps) {
  return (
    <p id={id} className={styles.error}>
      {error}
    </p>
  )
}
