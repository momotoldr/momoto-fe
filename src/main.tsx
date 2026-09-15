import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster, toast } from 'sonner'

import App from '@/app/App'
import { useCartStore } from '@/store/useCartStore'
import { useMediaStore } from '@/store/useMediaStore'
import { usePeerStore } from '@/store/usePeerStore'
import { usePhotosStore } from '@/store/usePhotosStore'
import { useRoomStore } from '@/store/useRoomStore'
import { useSessionStore } from '@/store/useSessionStore'
import { useStripStore } from '@/store/useStripStore'
import { captureCompositeFrame } from '@/utils/captureFrame'
import { composeStrip } from '@/utils/composeStrip'

import '@/index.scss'
import { AppProviders } from './contexts/AppProviders'

if (import.meta.env.DEV) {
  // Dev-only: expose stores on window for manual testing/debugging in the
  // console. Stripped from production builds.
  Object.assign(window, {
    __photobooth: {
      useMediaStore,
      useCartStore,
      usePhotosStore,
      useRoomStore,
      usePeerStore,
      useStripStore,
      useSessionStore,
      toast,
      captureCompositeFrame,
      composeStrip,
    },
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <App />
      <Toaster richColors position="top-center" />
    </AppProviders>
  </React.StrictMode>
)
