import type { IceServersResponse } from '@/types/turnType'

import { env } from '@/env'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

/** TURN credentials are minted by momoto-realtime. */
const turnService = new AxiosClient(env.realtimeUrl)

/**
 * Fetch fresh ICE servers (STUN + ephemeral TURN credentials) from the backend.
 * Called just before establishing the WebRTC peer connection so the TURN credential
 * is minted per-connection and short-lived. Rejects (via `ApiError`) if the server is
 * unreachable — the caller falls back to the build-time `env.iceServers`.
 */
export async function fetchIceServers(): Promise<IceServersResponse> {
  const { data } = await turnService.getData<IceServersResponse>(API_ROUTES.TURN.CREDENTIALS)
  // Validate rather than trust the cast: a malformed-but-2xx body must reject so
  // `resolveIceServers` falls back to the build-time servers instead of feeding
  // junk into RTCPeerConnection/PeerJS.
  if (!data || !Array.isArray(data.iceServers)) {
    throw new Error('turn-credentials returned an invalid body')
  }
  return data
}
