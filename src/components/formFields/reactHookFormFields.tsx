import type * as React from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { EmailField } from './EmailField'
import { InputField } from './InputField'
import { PasswordField } from './PasswordField'
import { TextareaField } from './TextareaField'

/** Props the RHF wrapper injects itself — callers don't pass these. */
type BoundProps = 'name' | 'value' | 'onChange' | 'onBlur' | 'error' | 'ref'

/** The props every presentational field shares that the RHF wrapper drives. */
type RhfBaseFieldProps = {
  name: string
  label?: string
  error?: string
  disabled?: boolean
}

/** `label` is an i18n key here (translated inside); everything else forwards to the field. */
type RhfFieldProps<P> = Omit<P, BoundProps> & {
  name: string
  label?: string
}

/**
 * Wrap a presentational field so it binds to the surrounding react-hook-form
 * context (needs a `<FormProvider>`). Pulls value/handlers/ref from `Controller`,
 * translates the `label` i18n key and the zod error key, and disables the field
 * while the form is submitting. Generic over the field's own props so it wraps both
 * text inputs and the textarea uniformly.
 */
function withReactHookForm<P extends RhfBaseFieldProps>(Component: React.ComponentType<P>) {
  function RhfField({ name, label, disabled, ...rest }: RhfFieldProps<P>) {
    const { control } = useFormContext()
    const { t } = useTranslation()

    return (
      <Controller
        name={name}
        control={control}
        render={({ field, fieldState: { error }, formState: { isSubmitting } }) => (
          <Component
            {...(rest as unknown as P)}
            {...field}
            disabled={disabled ?? isSubmitting}
            label={label ? t(label) : undefined}
            error={error?.message ? t(error.message) : undefined}
          />
        )}
      />
    )
  }
  return RhfField
}

export const RhfInputField = withReactHookForm(InputField)
export const RhfEmailField = withReactHookForm(EmailField)
export const RhfPasswordField = withReactHookForm(PasswordField)
export const RhfTextareaField = withReactHookForm(TextareaField)
