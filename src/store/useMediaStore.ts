import { create } from 'zustand'

import type { MediaErrorKind } from '@/utils/media-errors'

export type MediaStatus = 'idle' | 'requesting' | 'ready' | 'error'

interface MediaState {
  /** The camera + mic straight from getUserMedia. Owned by useUserMedia. */
  localStream: MediaStream | null
  camEnabled: boolean
  micEnabled: boolean
  status: MediaStatus
  error: MediaErrorKind | null

  setStream: (stream: MediaStream) => void
  setStatus: (status: MediaStatus) => void
  setError: (error: MediaErrorKind | null) => void
  toggleCam: () => void
  toggleMic: () => void
  /** Clear state. Does NOT stop tracks — the acquiring hook owns stopping. */
  reset: () => void
}

export const useMediaStore = create<MediaState>((set, get) => ({
  localStream: null,
  camEnabled: true,
  micEnabled: true,
  status: 'idle',
  error: null,

  setStream: (stream) =>
    set({
      localStream: stream,
      status: 'ready',
      error: null,
      camEnabled: stream.getVideoTracks().some((track) => track.enabled),
      micEnabled: stream.getAudioTracks().some((track) => track.enabled),
    }),

  setStatus: (status) => set({ status }),

  setError: (error) => set({ error, status: error ? 'error' : get().status }),

  toggleCam: () => {
    const { localStream, camEnabled } = get()
    const next = !camEnabled
    localStream?.getVideoTracks().forEach((track) => (track.enabled = next))
    set({ camEnabled: next })
  },

  toggleMic: () => {
    const { localStream, micEnabled } = get()
    const next = !micEnabled
    localStream?.getAudioTracks().forEach((track) => (track.enabled = next))
    set({ micEnabled: next })
  },

  reset: () =>
    set({
      localStream: null,
      camEnabled: true,
      micEnabled: true,
      status: 'idle',
      error: null,
    }),
}))
