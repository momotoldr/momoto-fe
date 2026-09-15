import Appbar from '@/components/layout/AppBar'
import Footer from '@/components/layout/Footer'
import { Outlet } from 'react-router-dom'

import { ConnectionChip } from '@/components/common/ConnectionChip'
import { NetworkWatcher } from '@/components/common/NetworkWatcher'
import { ServerGate } from '@/components/common/ServerGate'
import { SupportFab } from '@/components/common/SupportFab'
import { UnverifiedEmailBanner } from '@/components/common/UnverifiedEmailBanner'
import styles from './RootLayout.module.scss'

export function RootLayout() {
  return (
    <div className={styles.root}>
      <NetworkWatcher />
      <ServerGate />
      <Appbar />
      {/* Directly under the app bar, above every page: an account with no confirmed
          address has no way back in, and the Profile row that says so is somewhere
          nobody visits. Renders nothing unless it applies. */}
      <UnverifiedEmailBanner />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Footer />
      <SupportFab />
      {/* Fixed to the bottom-left corner, so it sits outside the page flow and can't
          shove the layout around every time the connection wobbles. */}
      <ConnectionChip />
    </div>
  )
}
