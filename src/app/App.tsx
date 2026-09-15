import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RouteErrorBoundary } from '@/components/common/RouteErrorBoundary'
import { env } from '@/env'
import { RootLayout } from '@/components/layout/RootLayout'
import { ActivitiesPage } from '@/pages/ActivitiesPage'
import { CartPage } from '@/pages/CartPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { GalleryPage } from '@/pages/GalleryPage'
import { HelpCenterPage } from '@/pages/HelpCenterPage'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PhotoboothPage } from '@/pages/PhotoboothPage'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { RoomPage } from '@/pages/RoomPage'
import { ServerDownPage } from '@/pages/ServerDownPage'
import { TermsPage } from '@/pages/TermsPage'
import { VerifyEmailPage } from '@/pages/VerifyEmailPage'

/**
 * Capture and playback.
 *
 * Normally public, so anyone can try the booth before signing up — capture, compose,
 * view and share are entirely client-side, and the login wall sits at printing: guest
 * strips are cached in the browser and only sync to the server (via the cart) once the
 * user has an account.
 *
 * `VITE_BETA_MODE` moves both behind `ProtectedRoute` instead. During the closed beta
 * the account *is* the invitation, so there is no guest path into a session — including
 * `/room/:roomId`, which a link would otherwise open to anyone who has the URL.
 */
const boothRoutes: RouteObject[] = [
  { path: '/photobooth', element: <PhotoboothPage /> },
  { path: '/room/:roomId', element: <RoomPage /> },
]

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    // Catches render crashes from any page below. Replaces the whole layout on purpose:
    // if a page threw, the layout's own assumptions may not hold either.
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <LandingPage /> },
      // Public: half the answers are for people deciding whether to sign up at all,
      // so the footer is where it's reached from.
      { path: '/help', element: <HelpCenterPage /> },
      { path: '/terms', element: <TermsPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/login', element: <LoginPage /> },
      // { path: '/register', element: <RegisterPage /> },
      // Account recovery and address confirmation stay **public in every mode**,
      // including the closed beta. `betaMode` moves the booth behind the login wall;
      // these three are how an invited tester gets back *to* that wall after losing a
      // password, so putting them behind it would be circular.
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/server-unavailable', element: <ServerDownPage /> },
      { path: '/activities', element: <ActivitiesPage /> },
      // Public in normal operation, behind the wall during the closed beta — see
      // `boothRoutes`.
      ...(env.betaMode ? [] : boothRoutes),
      {
        element: <ProtectedRoute />,
        children: [
          ...(env.betaMode ? boothRoutes : []),
          { path: '/cart', element: <CartPage /> },
          // The gallery holds unlocked strips, which only exist against an account —
          // there is nothing here for a guest to see, so it sits behind the same wall.
          { path: '/gallery', element: <GalleryPage /> },
          { path: '/profile', element: <ProfilePage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
