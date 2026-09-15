export const ROUTES = {
  home: '/',
  activities: '/activities',
  photobooth: '/photobooth',
  cart: '/cart',
  gallery: '/gallery',
  help: '/help',
  terms: '/terms',
  privacy: '/privacy',
  room: '/room/:roomId',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
  profile: '/profile',
  serverUnavailable: '/server-unavailable',
} as const

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]
