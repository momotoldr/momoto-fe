import { createTracker } from '@momotoldr/tracker'
import { autocapture, pageViews } from '@momotoldr/tracker/plugins'

import { env } from '@/env'
import i18n from '@/lib/i18n'
import { useAuthStore } from '@/store/useAuthStore'

import type { MomotoEvents } from './events'
import { linkAnonId } from './identify'
import { normalizeRoute } from './routes'

/**
 * The one tracker for this tab — created at **module scope**, never in a component: React
 * StrictMode runs effects twice and HMR re-runs modules, and either would otherwise start a
 * second tracker. (The library also returns the running instance for a repeat call.)
 *
 * Off (`env.analyticsEnabled` false, or this visit sampled out) it is a no-op with the same
 * interface: no listeners, no timers, no requests — so callers never check whether tracking
 * is on. Every event it does track is also written to the console (`onTrack` below).
 */
export const tracker = createTracker<MomotoEvents>({
  event: {
    source: 'momoto-fe',
    mode: 'BATCHED',
    classification: {
      page_view: { eventType: 'PAGE' },
      click: { eventType: 'COMPONENT' },
      // The two events most worth not losing get special treatment.
      client_error: { highPriority: true },
      payment_succeeded: { mode: 'REAL_TIME' },
    },
  },
  network: { baseUrl: env.analyticsUrl || 'https://invalid.local' },
  batch: { storage: { queue: { persistToSession: true } } },
  consent: {
    enabled: env.analyticsEnabled,
    // Owner decision (2026-10-02): track every visitor. Do Not Track and Global Privacy
    // Control are deliberately NOT honoured — Brave and several privacy extensions send GPC
    // by default, and honouring it silently left those visitors out of the data.
    respectDnt: false,
    // No opt-out key either: there is no opt-out — only the build flag turns tracking off.
    sampleRate: env.analyticsSampleRate,
  },
  // Sent once per batch (not per event). Identifies a build and a device class, never a
  // person; the library adds viewport, language and connection type itself.
  context: () => ({
    appVersion: __APP_VERSION__,
    env: import.meta.env.MODE,
    locale: i18n.language ?? null,
    isMobile: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    flags: {
      beta: env.betaMode,
      payments: env.paymentsEnabled,
      group: env.groupModeEnabled,
      backdrops: env.backdropsEnabled,
    },
  }),
  // Every tracked event, in every build (production included), as a plain `console.log` —
  // so what is being recorded can be checked in any browser's console. Page views and clicks
  // come from the plugins, which is why this hooks the tracker rather than `track()`.
  onTrack: (event) => console.log('[analytics]', event.name, event.data),
  // The library's own diagnostics (sends, retries, timers) — development only, and at
  // `console.debug` level, which browsers hide unless "Verbose" is on.
  debug: import.meta.env.DEV,
})

/** Where the visit came from — host and campaign only, never a full referrer or query. */
function appOpen(): MomotoEvents['app_open'] {
  let referrerHost: string | null = null
  try {
    const ref = document.referrer ? new URL(document.referrer) : null
    if (ref && ref.origin !== location.origin) referrerHost = ref.host
  } catch {
    // An unparsable referrer is just no referrer.
  }
  const params = new URLSearchParams(location.search)
  return {
    referrerHost,
    utmSource: params.get('utm_source')?.slice(0, 100) ?? null,
    utmCampaign: params.get('utm_campaign')?.slice(0, 100) ?? null,
    isPwa: typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
  }
}

// First, so a visit reads app_open → page_view → … (installing `pageViews` records the
// current page straight away).
void tracker.track('app_open', appOpen())

// Page views and clicks, recorded as route patterns. Clicks carry the control's
// `data-track` id, or `null` — untracked clicks are kept so the gaps in tagging show up.
tracker.use(pageViews({ normalize: normalizeRoute }))
tracker.use(autocapture({ normalize: normalizeRoute }))

// ── Account linking ──────────────────────────────────────────────────────────────
//
// The tracker knows only anonymous ids. When someone is signed in, this browser's anonId
// is linked to their account through an authenticated call (identify.ts) — never by
// putting a user id in an event, which anyone could forge.

let linkedAnonId: string | null = null

function linkIfSignedIn(): void {
  const identity = tracker.getIdentity()
  if (!identity || useAuthStore.getState().status !== 'authenticated') return
  if (linkedAnonId === identity.anonId) return
  linkedAnonId = identity.anonId
  void linkAnonId(identity.anonId)
}

// Fires now, and again whenever the ids change (a new visit after 30 idle minutes).
tracker.onIdentity(linkIfSignedIn)

useAuthStore.subscribe((state, previous) => {
  if (state.status === previous.status) return
  if (state.status === 'authenticated') {
    // Sign-in, or a restored session (`getMe`) on page load.
    linkIfSignedIn()
  } else if (state.status === 'unauthenticated' && previous.status === 'authenticated') {
    // Sign-out or an expired session. The event goes out under the old ids; then this
    // browser gets new ones, so the next person on a shared device isn't stitched to the
    // last.
    void tracker.track('signed_out', {})
    tracker.resetIdentity()
    linkedAnonId = null
  }
})
