import { useCallback, useEffect, useState } from 'react'

/**
 * A visible cooldown between one email send and the next.
 *
 * Two jobs. It stops someone who sees no mail from hammering a button into the
 * server's hourly cap — the claim endpoint allows 5 an hour, the reset endpoint 3, and
 * a user who burns those on impatience is locked out of the one thing they came to
 * do. And it *says why the button is dead*, which a plain `disabled` never does.
 *
 * **Persisted, not component state.** The timestamp lives in `localStorage`, so the
 * countdown survives a remount, a route change and a reload. Holding it in state
 * instead would mean navigating away and back was a free reset — which is exactly what
 * an impatient person does next.
 *
 * None of this is a security control; the server's rate limits are. This is the part
 * that keeps an honest user from tripping them.
 */

/** How long to wait between sends. Comfortably under the server's hourly budgets. */
export const SEND_COOLDOWN_SECONDS = 60

interface SendCooldown {
  /** Whole seconds left, 0 when clear. */
  remaining: number
  /** True while the caller should keep its send button disabled. */
  active: boolean
  /** Call right after a successful send. */
  start: () => void
}

function readStartedAt(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    return raw ? Number(raw) || 0 : 0
  } catch {
    // Private windows throw rather than returning null. No persistence, no cooldown —
    // the server still holds the line.
    return 0
  }
}

function secondsLeft(startedAt: number, seconds: number): number {
  if (!startedAt) return 0
  const elapsed = (Date.now() - startedAt) / 1000
  return Math.max(0, Math.ceil(seconds - elapsed))
}

/**
 * @param key    Storage key — one per kind of message, so confirming an address and
 *               asking for a reset link don't share a timer.
 * @param seconds Cooldown length.
 */
export function useSendCooldown(key: string, seconds = SEND_COOLDOWN_SECONDS): SendCooldown {
  const [remaining, setRemaining] = useState(() => secondsLeft(readStartedAt(key), seconds))

  useEffect(() => {
    if (remaining <= 0) return
    // Recomputed from the stored timestamp rather than decremented, so a backgrounded
    // tab (where timers are throttled) resumes with the right number instead of a
    // countdown that ran slow.
    const id = window.setInterval(() => {
      setRemaining(secondsLeft(readStartedAt(key), seconds))
    }, 1000)
    return () => window.clearInterval(id)
  }, [remaining, key, seconds])

  const start = useCallback(() => {
    try {
      localStorage.setItem(key, String(Date.now()))
    } catch {
      // Not persistable; the in-memory countdown below still runs for this view.
    }
    setRemaining(seconds)
  }, [key, seconds])

  return { remaining, active: remaining > 0, start }
}
