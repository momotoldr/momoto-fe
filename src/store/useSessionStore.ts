import { create } from 'zustand'

/**
 * Length of a booth session before it auto-ends (seconds).
 *
 * Solo only: a date room's window is server-authoritative (`session:window`), so it
 * comes from the backend's SESSION_DURATION_MS instead. The two are set by hand and
 * must be kept equal — they drifted once already (backend 3 min vs solo 5 min).
 */
export const SESSION_SECONDS = 300

interface SessionState {
  /** Timestamp (ms) when the session ends, or null before it starts. */
  endsAt: number | null
  /** Seconds remaining, derived from `endsAt`; null before the timer starts. */
  secondsLeft: number | null
  ended: boolean

  /** Start (or resume) the timer with a fixed end timestamp. */
  start: (endsAt: number) => void
  tick: () => void
  /** Force the session ended now (server-pushed expiry — no waiting on the tick). */
  end: () => void
  reset: () => void
}

/** Whole seconds remaining until `endsAt`. */
function remainingSeconds(endsAt: number): number {
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
}

export const useSessionStore = create<SessionState>((set) => ({
  endsAt: null,
  secondsLeft: null,
  ended: false,

  start: (endsAt) => {
    const left = remainingSeconds(endsAt)
    set({ endsAt, secondsLeft: left, ended: left <= 0 })
  },

  tick: () =>
    set((state) => {
      if (state.endsAt === null) return {}
      const left = remainingSeconds(state.endsAt)
      return { secondsLeft: left, ended: left <= 0 }
    }),

  end: () => set({ secondsLeft: 0, ended: true }),

  reset: () => set({ endsAt: null, secondsLeft: null, ended: false }),
}))
