/**
 * How a growing total is rounded down for display: the largest step at or below the
 * number decides its granularity. Ordered high to low; the first match wins.
 *
 * Coarser as the number grows, so the claim stays roughly as precise at every size —
 * 5 apart in the tens, 500 apart in the thousands. Below the smallest floor there is
 * nothing to round to (a step of 5 turns 4 into "0+"), so small counts are shown as
 * they are.
 */
const ROUNDING_STEPS = [
  { min: 10_000, step: 1_000 },
  { min: 1_000, step: 500 },
  { min: 100, step: 50 },
  { min: 10, step: 5 },
] as const

export interface RoundedTotal {
  /** The number to print. */
  value: number
  /** Whether it was rounded down — i.e. whether it earns a "+". */
  approximate: boolean
}

/**
 * Round a cumulative total down to a round-ish number, so the landing page can show
 * "2,000+" instead of a figure that is stale the moment it renders.
 *
 * **Always down, never nearest.** "15+" has to mean *at least* 15 or the counter is
 * lying, and rounding 2,600 up to "3,000+" would claim four hundred strips that don't
 * exist. Under-claiming is the only direction that stays true between refreshes, which
 * is what lets the server compute these once a day.
 *
 * @example roundTotalDown(2345) // { value: 2000, approximate: true }  → "2,000+"
 * @example roundTotalDown(15)   // { value: 15,   approximate: true }  → "15+"
 * @example roundTotalDown(9)    // { value: 9,    approximate: false } → "9"
 */
export function roundTotalDown(total: number): RoundedTotal {
  for (const { min, step } of ROUNDING_STEPS) {
    if (total >= min) return { value: Math.floor(total / step) * step, approximate: true }
  }
  return { value: total, approximate: false }
}
