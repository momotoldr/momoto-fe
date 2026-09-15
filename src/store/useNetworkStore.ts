import { create } from 'zustand'

/** How the connection is behaving. `slow` still works — it's just painful. */
export type ConnectionQuality = 'good' | 'slow'

/**
 * Tracks whether *this device* has a network connection and how well it's working, as
 * distinct from whether the backend is up (`useServerStore`). These fail in different
 * ways and deserve different copy: "check your wifi" is useless advice when our server
 * is the thing that's down, and "we're having trouble, hang tight" is a lie when the
 * user's train went into a tunnel.
 *
 * Fed by the browser's `online` / `offline` events and by an active latency probe —
 * both in `NetworkWatcher`.
 *
 * **`navigator.onLine` is only trustworthy in one direction.** `false` reliably means
 * there is no network interface at all. `true` only means *something* is plugged in —
 * a captive portal, a router with a dead uplink, and an expired hotspot all report
 * online. So we treat `false` as proof of offline, and let the server probe
 * (`useServerStore.reachable`, `quality`) catch the "connected to nothing" case.
 */
interface NetworkState {
  online: boolean
  quality: ConnectionQuality
  /**
   * Bumped by anything that just *saw* the network struggle — a request that timed
   * out, a socket that dropped mid-session, the browser downgrading us to 2g.
   * `NetworkWatcher` watches this counter and starts probing; nothing else reads it.
   * A counter rather than a boolean so repeated reports are distinct events.
   */
  trouble: number
  setOnline: (online: boolean) => void
  setQuality: (quality: ConnectionQuality) => void
  reportTrouble: () => void
  /** Re-read `navigator.onLine`. Used on retry / tab focus, where no event fired. */
  refresh: () => boolean
}

/** SSR-safe read; anything other than an explicit `false` counts as online. */
const readOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false

export const useNetworkStore = create<NetworkState>((set) => ({
  online: readOnline(),
  quality: 'good',
  trouble: 0,
  setOnline: (online) => set({ online }),
  setQuality: (quality) => set({ quality }),
  reportTrouble: () => set((s) => ({ trouble: s.trouble + 1 })),
  refresh: () => {
    const online = readOnline()
    set({ online })
    return online
  },
}))
