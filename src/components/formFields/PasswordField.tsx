import * as React from 'react'

import { PasswordInput } from '@/components/auth/PasswordInput'
import { cn } from '@/lib/utils'

import { FormFieldError } from './FormFieldError'
import { FormLabel } from './FormLabel'
import type { FieldProps } from './InputField'
import styles from './FormField.module.scss'

/** Presentational password field: label + show/hide input + error, with a11y wiring. */
export const PasswordField = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ name, label, error, required, hideLabel = false, wrapperClassName, id, ...rest }, ref) => {
    const fieldId = id ?? name
    const errorId = `${fieldId}-error`
    return (
      <div className={cn(styles.wrapper, wrapperClassName)}>
        {!hideLabel && label && <FormLabel htmlFor={fieldId} label={label} required={required} />}
        <PasswordInput
          id={fieldId}
          name={name}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        />
        {error && <FormFieldError id={errorId} error={error} />}
      </div>
    )
  }
)
PasswordField.displayName = 'PasswordField'
