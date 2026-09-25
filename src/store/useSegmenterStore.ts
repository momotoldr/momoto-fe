import { create } from 'zustand'

/**
 * Where the background remover is (see `utils/segmentation/segmenter`). Global rather
 * than per screen: the worker and its ~73 MB of runtime and model outlive any one
 * screen, and the arrange rail and the result screen both wait on the same one.
 */
interface SegmenterState {
  /**
   * `idle` — nothing asked for yet (nothing downloaded either: the cost is only paid
   * by someone who picks a backdrop). `loading` — fetching and compiling. `ready` —
   * cutting out. `error` — something went wrong; a retry starts over. `unsupported` —
   * the GPU session couldn't start on this device at all; final for the page.
   */
  phase: 'idle' | 'loading' | 'ready' | 'error' | 'unsupported'
  /** Download progress in bytes, while `loading`. Cached parts count as instant. */
  loaded: number
  total: number
}

export const useSegmenterStore = create<SegmenterState>(() => ({
  phase: 'idle',
  loaded: 0,
  total: 0,
}))
