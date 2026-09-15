/** A best-effort unique id: `crypto.randomUUID` when available, else a fallback. */
export function newId(prefix = 'id'): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
