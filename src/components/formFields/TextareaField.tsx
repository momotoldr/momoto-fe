import * as React from 'react'

import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { FormFieldError } from './FormFieldError'
import { FormLabel } from './FormLabel'
import styles from './FormField.module.scss'

export interface TextareaFieldProps extends React.ComponentProps<'textarea'> {
  /** Field name — doubles as the fallback `id` (label `htmlFor` / error `aria-describedby`). */
  name: string
  /** Resolved label text (already translated). Omit / `hideLabel` to render none. */
  label?: string
  /** Resolved error text (already translated), or undefined when valid. */
  error?: string
  required?: boolean
  hideLabel?: boolean
  /** Extra classes for the wrapper element (e.g. layout like `flex-1`). */
  wrapperClassName?: string
}

/** Presentational multiline field: label + textarea + error, with a11y wiring. */
export const TextareaField = React.forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ name, label, error, required, hideLabel = false, wrapperClassName, id, ...rest }, ref) => {
    const fieldId = id ?? name
    const errorId = `${fieldId}-error`
    return (
      <div className={cn(styles.wrapper, wrapperClassName)}>
        {!hideLabel && label && <FormLabel htmlFor={fieldId} label={label} required={required} />}
        <Textarea
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
TextareaField.displayName = 'TextareaField'
