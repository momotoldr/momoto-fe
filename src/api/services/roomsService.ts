import type {
  MintRoomResponse,
  RoomLookup,
  RoomStatus,
  RoomStatusResponse,
} from '@/types/roomsType'

import { API_ROUTES } from '../apiRoutes'
import AxiosClient from '../client/axiosClient'

const roomsService = new AxiosClient()

const VALID_STATUSES: readonly RoomStatus[] = ['open', 'full', 'ended', 'not_found']

/**
 * Mint a fresh, unique room code for a **date** session. A successful mint doubles
 * as a reachability check — a date room only works if the backend minted it and is
 * reachable (see `utils/rooms.ts`). Rejects (via the client's `ApiError`) if the
 * server is unreachable or returns a non-2xx (e.g. the backend's `429`); rejects
 * with a plain `Error` if the response body is missing/malformed.
 */
export async function mintRoomCode(capacity?: number): Promise<string> {
  // `capacity` is omitted for solo/date so the server applies its own default. A group
  // room asks for its seats explicitly, and the server *rejects* a number above its
  // `ROOM_CAPACITY_MAX` rather than quietly clamping — which is what a build with group
  // mode on meets when the backend hasn't been raised to match.
  const { data } = await roomsService.postData<MintRoomResponse>(
    API_ROUTES.ROOMS.CREATE,
    capacity === undefined ? undefined : { capacity }
  )
  if (data && typeof data.roomId === 'string' && data.roomId.length >= 4) {
    return data.roomId
  }
  throw new Error('mint returned an invalid code')
}

/**
 * Pre-join joinability check for a typed code. Rejects (via `ApiError`) if the server
 * is unreachable / rate-limited so the caller can distinguish that from a definitive
 * `not_found` / `full` / `ended`; rejects with a plain `Error` on a malformed body.
 */
export async function lookupRoomStatus(roomId: string): Promise<RoomLookup> {
  const { data } = await roomsService.getData<RoomStatusResponse>(API_ROUTES.ROOMS.BY_ID(roomId))
  if (data && VALID_STATUSES.includes(data.status)) {
    // `capacity` decides which mode the joiner opens the booth in, so a server too old
    // to send it degrades to the two-seat assumption rather than to a broken room.
    return {
      status: data.status,
      capacity: typeof data.capacity === 'number' ? data.capacity : null,
      members: typeof data.members === 'number' ? data.members : 0,
    }
  }
  throw new Error('lookup returned an invalid status')
}
