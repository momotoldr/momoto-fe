import * as React from 'react'

import { cn } from '@/lib/utils'

import { FormFieldError } from './FormFieldError'
import { FormLabel } from './FormLabel'
import styles from './FormField.module.scss'

export interface SelectOption {
  value: string
  /** Resolved option text (already translated). */
  label: string
}

export interface SelectFieldProps extends React.ComponentProps<'select'> {
  /** Field name — doubles as the fallback `id` (label `htmlFor` / error `aria-describedby`). */
  name: string
  /** Resolved label text (already translated). Omit / `hideLabel` to render none. */
  label?: string
  /** Resolved error text (already translated), or undefined when valid. */
  error?: string
  required?: boolean
  hideLabel?: boolean
  options: readonly SelectOption[]
  /** Text of the empty first option (value `''`) shown until something is picked. */
  placeholder?: string
  /** Extra classes for the wrapper element (e.g. layout like `flex-1`). */
  wrapperClassName?: string
}

/**
 * Presentational dropdown: label + native select + error, with a11y wiring. Native on
 * purpose, like the profile's location selects: short lists, keyboard type-ahead and
 * the phone's own picker for free.
 */
export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    {
      name,
      label,
      error,
      required,
      hideLabel = false,
      options,
      placeholder,
      wrapperClassName,
      className,
      id,
      ...rest
    },
    ref
  ) => {
    const fieldId = id ?? name
    const errorId = `${fieldId}-error`
    return (
      <div className={cn(styles.wrapper, wrapperClassName)}>
        {!hideLabel && label && <FormLabel htmlFor={fieldId} label={label} required={required} />}
        <select
          id={fieldId}
          name={name}
          ref={ref}
          className={cn(styles.select, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <FormFieldError id={errorId} error={error} />}
      </div>
    )
  }
)
SelectField.displayName = 'SelectField'
