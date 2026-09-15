import styles from './FormField.module.scss'

interface FormLabelProps {
  htmlFor: string
  label: string
  required?: boolean
}

export function FormLabel({ htmlFor, label, required }: FormLabelProps) {
  return (
    <label className={styles.label} htmlFor={htmlFor}>
      {label}
      {required && <span className={styles.required}> *</span>}
    </label>
  )
}
