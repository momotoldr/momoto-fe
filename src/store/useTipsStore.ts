import { create } from 'zustand'

import { TIPS_MUTED_STORAGE_KEY, TIPS_READ_MS, type BoothStage } from '@/constants/boothTips'

/**
 * Storage is best-effort: Safari's private mode throws on write, and a browser that
 * won't remember the preference is a far smaller problem than a booth that won't open.
 * Failure degrades to "nothing was remembered".
 */
function readMuted(): boolean {
  try {
    return localStorage.getItem(TIPS_MUTED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(TIPS_MUTED_STORAGE_KEY, String(muted))
  } catch {
    /* storage unavailable — the tips simply introduce themselves again next time */
  }
}

/**
 * Write down the screen whose card is currently up, if it has been up long enough to
 * have been read. Shared by the paths that take the card away without the person
 * having touched it.
 */
function markRead(
  state: Pick<TipsState, 'stage' | 'open' | 'openedAt' | 'seen'>,
  set: (partial: Partial<TipsState>) => void
): void {
  const { stage, open, openedAt, seen } = state
  if (!stage || !open || openedAt === null) return
  if (Date.now() - openedAt < TIPS_READ_MS) return
  if (seen.includes(stage)) return
  set({ seen: [...seen, stage] })
}

interface TipsState {
  /** The booth screen currently on show, or null when the booth isn't up. */
  stage: BoothStage | null
  /** Whether the tips card is on screen. */
  open: boolean
  /** When it went up, so a card that only flashed past isn't counted as read. */
  openedAt: number | null
  /**
   * Stages already read *in this session*. Deliberately not persisted: each booth run
   * is walked through from the top, and this only stops a screen from introducing
   * itself twice within the one session — coming back to the booth from a retake, say.
   * `RoomPage` clears it along with the rest of the session state.
   */
  seen: BoothStage[]
  /**
   * The person has told us they've used the booth before, so nothing introduces itself
   * on its own any more. The room bar's help button still opens the tips on demand —
   * this quiets them, it doesn't take them away.
   */
  muted: boolean

  /** Declared by whichever component owns the screen; null when it unmounts. */
  setStage: (stage: BoothStage | null) => void
  /** Open on demand (the help button in the room bar) regardless of seen/muted. */
  openTips: () => void
  closeTips: () => void
  setMuted: (muted: boolean) => void
  /** Clear the session's state (not the muted preference) when the room unmounts. */
  reset: () => void
}

export const useTipsStore = create<TipsState>((set, get) => ({
  stage: null,
  open: false,
  openedAt: null,
  seen: [],
  muted: readMuted(),

  setStage: (stage) => {
    if (get().stage === stage) return

    // Leaving a screen whose card stood there long enough to be read counts as
    // reading it: the card doesn't block anything, so most people will take it in and
    // carry on rather than press "Got it", and popping it at them again next time
    // would be nagging.
    markRead(get(), set)

    // The booth screen is gone (or a terminal screen took over): take the card with
    // it rather than leaving advice for a screen nobody is looking at any more.
    if (stage === null) {
      set({ stage: null, open: false, openedAt: null })
      return
    }

    const { seen, muted } = get()
    // First time on this screen: introduce it. Every time after, the card stays shut
    // and the room bar's help button is the way back to it.
    const open = !muted && !seen.includes(stage)
    set({ stage, open, openedAt: open ? Date.now() : null })
  },

  openTips: () => set({ open: true, openedAt: Date.now() }),

  // Dismissing is deliberate, so it settles the screen outright — no matter how
  // briefly the card was up.
  closeTips: () => {
    const { stage, seen } = get()
    if (stage && !seen.includes(stage)) {
      set({ open: false, openedAt: null, seen: [...seen, stage] })
      return
    }
    set({ open: false, openedAt: null })
  },

  setMuted: (muted) => {
    writeMuted(muted)
    set({ muted })
  },

  // `muted` survives: "I've done this before" is a fact about the person, not about
  // the session that happens to be ending.
  reset: () => set({ stage: null, open: false, openedAt: null, seen: [] }),
}))
