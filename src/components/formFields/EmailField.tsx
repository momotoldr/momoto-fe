import * as React from 'react'

import { InputField, type FieldProps } from './InputField'

/** Thin `InputField` preset for emails (defaults `type`/`autoComplete`, both overridable). */
export const EmailField = React.forwardRef<HTMLInputElement, FieldProps>((props, ref) => (
  <InputField ref={ref} type="email" autoComplete="email" {...props} />
))
EmailField.displayName = 'EmailField'
