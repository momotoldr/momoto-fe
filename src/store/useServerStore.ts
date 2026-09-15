import { create } from 'zustand'

/**
 * What we know about the backend — three states, because the honest answer to "is the
 * server up?" is sometimes "we can't tell", and the UI has to be able to say that.
 *
 * - `up` — the server answered. Any HTTP response proves it, including a 5xx: the
 *   request reached us and came back.
 * - `down` — the health probe got through and the server answered badly (a 5xx, or a
 *   `/healthz` that reported itself unhealthy). This is the only state that has earned
 *   the right to copy blaming us.
 * - `unknown` — a request produced no response at all. This is the important one: a
 *   dead backend and a broken path to a healthy one are *indistinguishable* from here.
 *   `navigator.onLine === true` doesn't narrow it either — a captive portal, a router
 *   with a dead uplink and an expired hotspot all report online (see `useNetworkStore`).
 *   So we record the absence of a verdict rather than inventing one, and the chip says
 *   "could be us, could be you" instead of asserting an outage over someone's bad wifi.
 *
 * Note that a 5xx on an ordinary API call leaves this `up` rather than flipping it to
 * `down`: one endpoint failing is that endpoint's problem, and a global outage banner
 * is the wrong response to it. `down` is a verdict reserved for the liveness probe.
 *
 * Written by the axios layer (`up` on any response, `unknown` on a transport fault),
 * by `probeServer()`, and by the room socket's grace timer. Read by `ConnectionChip`
 * (which of the three messages to show), `ServerGate` (bounce the routes that need a
 * backend), `ServerDownPage` (leave on recovery) and `NetworkWatcher` (anything other
 * than `up` is a question worth probing until it's answered).
 */
export type ServerStatus = 'up' | 'down' | 'unknown'

interface ServerState {
  status: ServerStatus
  setStatus: (status: ServerStatus) => void
}

export const useServerStore = create<ServerState>((set) => ({
  status: 'up',
  setStatus: (status) => set({ status }),
}))
