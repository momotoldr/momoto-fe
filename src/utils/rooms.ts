import { lookupRoomStatus, mintRoomCode } from '@/api/services/roomsService'
import { env } from '@/env'
import type { RoomLookup, RoomStatus, SessionMode } from '@/types/roomsType'

export type { RoomLookup, RoomStatus, SessionMode }

/**
 * Seats a group room is minted with. The server caps this at its own
 * `ROOM_CAPACITY_MAX` and **refuses** anything above it, so a build asking for four
 * against a backend still set to two fails loudly at creation rather than producing a
 * room whose third person is turned away at the door.
 */
export const GROUP_CAPACITY = 4

/**
 * People who must be present before a session can run, by room size. Mirrors the
 * server's `minSessionMembers` — the backend refuses to open a window below it either.
 *
 * A two-seat room needs both: one person is a selfie, not a booth. A **group room needs
 * three** — the mode exists for more than a pair, and running one with two present just
 * produces a date strip in a room everybody joined for something else. It stays a floor
 * rather than the room's capacity, so a group of three whose fourth never turns up isn't
 * stranded waiting for them.
 */
export const GROUP_MIN_MEMBERS = 3

export function minSessionMembers(capacity: number | null): number {
  return capacity !== null && capacity > 2 ? GROUP_MIN_MEMBERS : 2
}

/**
 * The booth mode named by a `?mode=` query parameter, defaulting to `date` for anything
 * unrecognised — which is what an omitted mode has always meant.
 *
 * `group` resolves only when the build offers group mode. That is the gate that makes a
 * stale or hand-typed `?mode=group` link harmless: without it, a URL alone could open a
 * booth this build cannot run, and the person would sit in a room whose other seats the
 * server refuses to fill. Falling back to `date` gives them a working room instead of a
 * broken one.
 */
export function resolveSessionMode(raw: string | null | undefined): SessionMode {
  if (raw === 'solo') return 'solo'
  if (raw === 'group' && env.groupModeEnabled) return 'group'
  return 'date'
}

/**
 * Local, throwaway room code for **solo** mode, which never connects to the server.
 * Date mode must *not* use this: a date room only works if the backend minted it and
 * is reachable (otherwise the guest could never join). See `requestRoomCode`.
 */
export function localRoomCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = 6
  // Fixed-length, crypto-random when available (Math.random().toString(36) can
  // yield fewer than 6 chars). This is only the solo throwaway code, never
  // server-facing, so a graceful Math.random fallback is fine.
  const randomValues =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? crypto.getRandomValues(new Uint32Array(length))
      : Array.from({ length }, () => Math.floor(Math.random() * 0xffffffff))
  let code = ''
  for (let i = 0; i < length; i++) {
    code += alphabet[randomValues[i] % alphabet.length]
  }
  return code
}

/**
 * Ask the backend to mint a unique room code for a **date** session. The server
 * guarantees the code isn't an active or already-ended room, and — crucially — a
 * successful mint proves the backend is reachable, which a date room requires (the
 * guest joins and both peers sync through it).
 *
 * **Throws** if the server is unreachable or the mint fails. There is deliberately no
 * local fallback: a locally-generated date code would create a room nobody can join.
 * Callers must handle the rejection (surface an error, don't navigate).
 */
export async function requestRoomCode(capacity?: number): Promise<string> {
  return mintRoomCode(capacity)
}

/**
 * Pre-join check for a code typed into the "join a friend" form: asks the backend
 * whether the code names a joinable room. Catches typos / never-minted codes (which
 * would otherwise silently spawn a lonely single-member room via the socket join).
 * **Throws** if the server is unreachable — the caller distinguishes that from a
 * definitive `not_found`/`full`/`ended`.
 */
export async function lookupRoom(roomId: string): Promise<RoomLookup> {
  return lookupRoomStatus(roomId)
}

/**
 * The mode a joined room should open in, from what the pre-join lookup found.
 *
 * A code carries its own seat count, and the joiner has to honour it: entering a
 * four-seat room in date mode would shoot two-camera cuts while everyone else shot
 * four. Returns `null` when this build can't run the room it found — a group code with
 * group mode switched off — so the caller can refuse rather than open a broken booth.
 */
export function modeForCapacity(capacity: number | null): SessionMode | null {
  if (capacity !== null && capacity > 2) return env.groupModeEnabled ? 'group' : null
  return 'date'
}
