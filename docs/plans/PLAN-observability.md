# Momoto Frontend — Observability

Plan for frontend observability: a **clickstream** (what people do), **error
reporting** (what broke), and **performance timings** (what was slow). One pipeline,
three kinds of payload, so there is a single place to reason about batching, consent,
sampling and retention rather than three half-integrations.

The backend half — the ingest endpoint, the table, the retention sweep and the admin
queries — is sketched in [Backend contract](#backend-contract) and should get its own
`../momoto-core/PLAN-observability.md` before F1 starts.

**Legend:** DoD = Definition of Done.

## Concept

- **First-party, not a vendor.** Events go to `POST /events` on `momoto-core` and land in
  Postgres; the funnels are read in `momoto-portal`. The privacy page already promises
  *"We don't use advertising cookies or third-party tracking pixels"*
  (`locales/en/translation.json:293`) — a first-party pipeline keeps that literally
  true, needs no cookie banner, and adds no vendor to a product whose whole cost model
  is ~1¢/active user/month. PostHog/Plausible stay a **rejected alternative** (below),
  not a fallback.
- **One typed taxonomy, no stringly-typed `track('thing')`.** Events are a
  discriminated union in `src/analytics/events.ts`. A typo is a type error, and the
  admin queries can be generated from the same list.
- **Two ways to emit.** Explicit `track(...)` for anything with meaning (a shot taken,
  a template chosen, a payment). A **delegated `data-track` click listener** for the
  raw clickstream, so adding a tracked button is an attribute, not a handler — this
  respects the styling convention (no logic smuggled into JSX beyond a data attribute)
  and keeps `onClick` handlers about behaviour.
- **The booth is realtime; the pipeline must not be.** Nothing may run per animation
  frame, per ICE candidate, or per video frame. Events queue in memory and flush on a
  timer / `pagehide` via `sendBeacon`. There is a hard per-session event cap.
- **Off by default until it's proven.** `VITE_ANALYTICS_ENABLED` gates the whole
  module; unset = a no-op `track` that tree-shakes to nothing meaningful. Same shape as
  `VITE_PAYMENTS_ENABLED` and `VITE_GROUP_MODE_ENABLED`.
- **No PII, enforced by types.** Event props are `string | number | boolean | null`
  only, and the taxonomy carries no free text, no email, no room code, no strip id in
  the clear. Where an id is genuinely needed for joining (strip, room), send a
  truncated hash.

## Why this is worth building now

The product has a long funnel with many places to silently lose someone, and right now
none of them are visible:

```
landing → mode pick → camera permission → room create/join → peer connect
        → session start → capture → arrange (template/filter/stickers)
        → strip created → download / add to cart → unlock → payment
```

Camera permission and peer connect are the two steps that fail for *environmental*
reasons — a denied prompt, a NAT that needs TURN — and both fail silently from the
outside. The TURN cliff is already flagged as the scaling risk in the cost model; a
`peer_connected { viaTurn: true }` counter is how that stops being a guess.

---

## Architecture

```
src/analytics/
  events.ts        # the taxonomy: discriminated union of every event + props
  context.ts       # anonymous id, session id, device/app context
  consent.ts       # enabled? DNT/GPC? user opt-out? sampled in?
  queue.ts         # in-memory buffer, batching, flush, sendBeacon, caps
  track.ts         # the public API: track(), trackTiming(), identify()
  RouteTracker.tsx # page_view on location change
  ClickTracker.tsx # delegated document click listener for [data-track]
  vitals.ts        # LCP / INP / CLS / TTFB → the same queue
  index.ts         # barrel: `import { track } from '@/analytics'`
```

`RouteTracker` and `ClickTracker` mount once in `RootLayout`, next to `NetworkWatcher`
and `ServerGate` — they are the same kind of thing (invisible, app-wide, render
nothing).

### Identity

| id | storage | lifetime | purpose |
| --- | --- | --- | --- |
| `anonId` | `localStorage` (`momoto.analytics.aid`) | until cleared | stitch sessions from one browser |
| `sessionId` | `sessionStorage` | tab, + 30-min idle rollover | one visit |
| `userId` | from `useAuthStore` | while signed in | join a funnel to an account |

`anonId` is a random v4-ish id from `utils/id.ts` — never derived from a fingerprint.
When a signed-out visitor signs in, emit `identify` once so the anon funnel before the
login wall can be joined to the account after it. This is the guest-booth flow's whole
point: a guest captures a strip and *then* meets the wall, so the interesting funnel
starts before there is a user.

### Queue and delivery

- Buffer in memory; flush when **20 events** are queued, or every **10 s**, or on
  `visibilitychange → hidden` / `pagehide`.
- Flush uses `navigator.sendBeacon(url, blob)` when available (survives the tab
  closing, which is exactly when the last funnel step is emitted), falling back to
  `fetch(..., { keepalive: true })`.
- **Deliberately not axios.** The events call must not touch `useServerStore` /
  `useNetworkStore` — a failed analytics beacon is not evidence about the backend, and
  routing it through `axiosClient` would let telemetry send someone to the server-down
  page. Same reasoning as the timeout carve-out already in `interceptErrorResponse`.
- Failure is silent and lossy on purpose: no retry queue, no persistence. Dropped
  events are cheaper than a broken app.
- **Caps:** max 300 events per session, max 30 KB per batch. On overflow, count the
  drops and send one `events_dropped { count }` — a truncated funnel that says it was
  truncated beats one that quietly lies.

### Consent

Emit nothing when any of these hold:

1. `VITE_ANALYTICS_ENABLED !== 'true'`
2. `navigator.doNotTrack === '1'` or `navigator.globalPrivacyControl === true`
3. `localStorage['momoto.analytics.optout'] === 'true'` (a toggle on `/profile`)
4. the session lost the `VITE_ANALYTICS_SAMPLE_RATE` dice roll (rolled **once per
   session**, not per event — per-event sampling shreds funnels)

No consent banner: this is first-party, cookieless, non-advertising measurement. The
privacy page gets a paragraph saying exactly what is collected and how to opt out —
see F5.

---

## Event taxonomy

Names are `snake_case`, `noun_verb-past`. Props are flat scalars. This is the first
draft of the union in `events.ts`; the point of writing it out here is that the admin
funnel queries are downstream of it.

### Lifecycle
| event | props |
| --- | --- |
| `app_open` | `referrer`, `locale`, `isPwa` |
| `page_view` | `path`, `fromPath` |
| `identify` | `method: 'login' \| 'register' \| 'google' \| 'restore'` |
| `signed_out` | — |

### Auth
| event | props |
| --- | --- |
| `auth_submitted` | `method: 'password' \| 'google'`, `intent: 'login' \| 'register'` |
| `auth_succeeded` | `method`, `intent` |
| `auth_failed` | `method`, `intent`, `code` (the `ApiError` code, never the message) |
| `email_verification_opened` | `outcome: 'ok' \| 'expired' \| 'invalid'` |
| `password_reset_requested` / `password_reset_completed` | — |

### Booth funnel — the core
Mirrors `BOOTH_STAGES` (`lobby → booth → arrange → result`) so a stage histogram
matches the tips the person was being shown.

| event | props |
| --- | --- |
| `booth_mode_selected` | `mode: 'solo' \| 'date' \| 'group'` |
| `camera_requested` | `mode` |
| `camera_granted` | `msToReady`, `deviceCount` |
| `camera_denied` | `reason` (the normalized code from `utils/media-errors.ts`) |
| `room_created` / `room_joined` | `mode`, `seats` |
| `peer_connect_started` | — |
| `peer_connected` | `msToConnect`, `viaTurn: boolean` |
| `peer_failed` | `reason`, `msElapsed` |
| `peer_dropped` | `msIntoSession` |
| `session_started` | `mode`, `seats` |
| `shot_taken` | `index` (0–3) |
| `capture_completed` | `msFromStart` |
| `retake_requested` | `shotIndex \| null` (null = all) |
| `stage_entered` | `stage: BoothStage`, `msInPreviousStage` |
| `template_selected` | `templateId`, `family: 'ribbon' \| 'card'` |
| `filter_selected` | `filterId` |
| `sticker_added` | `stickerId` |
| `strip_created` | `templateId`, `filterId`, `stickerCount`, `msToCompose` |
| `strip_downloaded` | `format: 'png'`, `watermarked: boolean` |
| `strip_shared` | `surface` |
| `session_finished` | `byHost: boolean`, `hadStrip: boolean`, `secondsUsed` |
| `session_expired` | `hadStrip: boolean` |

`shot_taken` is the one high-frequency event, and it is bounded at four per capture —
never instrument the countdown ticks.

### Commerce
`cart_viewed { itemCount, slotsUsed }` · `strip_added_to_cart { source: 'result' \|
'guest_sync' }` · `unlock_clicked { paymentsEnabled }` · `checkout_started` ·
`payment_succeeded { amountIdr }` · `payment_failed { code }` · `gallery_viewed
{ itemCount }` · `strip_deleted { from: 'cart' \| 'gallery' }`.

### Health (the observability half)
| event | props |
| --- | --- |
| `client_error` | `source`, `name`, `messageHash`, `path` |
| `api_failed` | `route` (the **template**, not the URL — `/strips/:id`), `method`, `status`, `code` |
| `network_trouble` | `path` |
| `server_status_changed` | `status: 'up' \| 'down' \| 'unknown'` |
| `web_vital` | `metric: 'LCP' \| 'INP' \| 'CLS' \| 'TTFB'`, `value`, `rating` |
| `timing` | `name`, `ms` |

`messageHash` rather than the message: error strings pick up user input surprisingly
often. Full messages go to Sentry, which is the tool built to hold them.

---

## Backend contract

`POST /events` on `momoto-core`, modelled on the existing `feedbackRouter` — anonymous
friendly, rate limited, optional bearer via `optionalUserId`.

```jsonc
// request
{
  "anonId": "…", "sessionId": "…",
  "context": { "appVersion": "…", "locale": "en", "viewport": "1440x900",
               "connection": "4g", "isMobile": false },
  "events": [
    { "name": "shot_taken", "ts": 1757300000000, "props": { "index": 2 } }
  ]
}
// response: 204, always. Never a body, never an error the client acts on.
```

- **Table `AnalyticsEvent`** — `id`, `name`, `ts`, `anonId`, `sessionId`, `userId?`,
  `props Json`, `context Json`, `ip` *(truncated: last octet / last 80 bits zeroed)*,
  `createdAt`. Indexes on `(name, ts)`, `(sessionId, ts)`, `(userId, ts)`.
- **Rate limit** ~60 batches / 10 min / IP via the existing `RateLimiter`, plus a
  server-side cap on `events.length` (100) and body size (the global `express.json`
  limit already bounds this).
- **Validate against an allowlist of event names** and drop unknown ones. The endpoint
  is public; without this it is a free write-anything-to-our-database API.
- **Retention:** a `purge:events` script on the `purge:strips` pattern, deleting rows
  older than 90 days, wired into the periodic sweep.
- **Admin:** extend `OverviewPage` with a funnel card and a health card; the queries
  are `count(distinct sessionId) group by name` over a date range.

---

## Phases

### F0 — Decide and stub *(half a day)*
Add `VITE_ANALYTICS_ENABLED`, `VITE_ANALYTICS_SAMPLE_RATE`, `VITE_ANALYTICS_URL`
(defaults to `env.socketUrl`) to `env.ts` and `.env.example`. Write `events.ts` with
the union above and a `track()` that only `console.debug`s.

**DoD:** `track({ name: 'app_open', … })` type-checks; a typo'd name fails `npm run
typecheck`; nothing is sent anywhere.

### F1 — Pipeline + page views *(1–2 days)*
`context.ts`, `consent.ts`, `queue.ts`, real `track.ts`, `RouteTracker`. Backend
`POST /events` + table + rate limit + allowlist.

**DoD:** navigating the app produces `app_open` and one `page_view` per route change;
rows appear in Postgres; closing the tab still delivers the last batch (verify the
beacon in the network panel); DNT on ⇒ zero requests.

### F2 — Booth funnel *(2–3 days)*
Instrument the booth events. Call sites are already concentrated:
`useUserMedia` (camera), `usePeerConnection` (peer + TURN), `useCaptureSequence`
(shots), `useBoothStage` (stage transitions — it already sees every change, so
`stage_entered` is nearly free), `useStripStore` / `composeStrip` (template, filter,
strip created), `useSessionTimer` (expiry), `useRoom` (finish).

Then `ClickTracker` + `data-track` on the primary CTAs (mode cards, Start Session,
Create, Download, Unlock).

**DoD:** one solo run and one date run each produce a complete, ordered funnel with no
gaps; the room's realtime behaviour is unchanged (no new re-renders — verify `track`
is not called from render, only from effects and handlers).

### F3 — Errors and vitals *(1–2 days)*
Fan `reportError` out to the queue as `client_error` (this closes the existing TODO in
`lib/reportError.ts`). Add a `window.onerror` / `unhandledrejection` hook. Emit
`api_failed` from `interceptErrorResponse` — route **template**, not URL. Add
`vitals.ts` using the `web-vitals` library (≈2 KB) or a hand-rolled
`PerformanceObserver` if the dependency isn't wanted.

Optional and independent: wire Sentry behind `VITE_SENTRY_DSN`, uploading source maps
in the Wrangler build. Recommended eventually — stack traces with source maps are the
one thing worth a vendor — but not a blocker for any of the above.

**DoD:** a deliberately thrown render error produces both a boundary and a
`client_error` row; a forced 500 produces `api_failed`; LCP/INP/CLS arrive once each
per page view.

### F4 — Admin surfaces *(2 days)*
Funnel card, health card, and a Sessions drill-down in `momoto-portal`.

**DoD:** the overview answers, without SQL: how many opened the booth, how many got a
camera, how many connected, how many finished a strip, how many unlocked — and what
share of connections needed TURN.

### F5 — Consent, docs, retention *(half a day)*
Opt-out toggle on `/profile`; privacy page paragraph (`en` + `id`); `purge:events`
script + sweep; a section in `DEPLOYMENT.md`.

**DoD:** the toggle stops all emission immediately without a reload; the privacy copy
matches what is actually collected, field for field.

---

## Rejected alternatives

- **PostHog / Plausible / Umami Cloud.** Faster to stand up and better dashboards, but
  it is a third-party script on a page holding a live camera feed, it makes the
  privacy line above need caveats, and session replay on a *photobooth* is a
  non-starter. Self-hosting one is a second service to pay for and operate. Revisit if
  the hand-rolled admin queries become the bottleneck.
- **Google Analytics.** Advertising cookies, consent banner, and it would directly
  contradict the shipped privacy copy.
- **Events over the existing Socket.io connection.** Tempting — the connection is
  already open in the booth — but it exists only inside a room, so it would cover the
  least interesting half of the funnel and give landing/auth/cart nothing. It would
  also put analytics traffic on the same channel as capture sync, which is the one
  thing that must never be delayed.
- **Per-event sampling.** Cheaper, but it makes funnels meaningless: step B can appear
  to out-convert step A. Sample sessions instead.

## Risks and watch-items

- **Event volume vs Postgres.** At beta scale this is nothing. If it grows, the escape
  hatch is to keep raw rows for 7 days and roll daily aggregates into a summary table —
  design the admin queries so they can switch source without changing the UI.
- **A public write endpoint.** The allowlist, the rate limit and the size cap are not
  optional extras; they are what stops `/events` being a spam sink.
- **Instrumentation drifting from behaviour.** `stage_entered` from `useBoothStage` and
  `booth_mode_selected` from the mode card are safe because they sit on the single
  place that already owns the fact. Resist re-deriving funnel state anywhere else —
  the same reasoning that keeps `BoothStage` declared rather than computed.
- **Two hand-matched numbers, again.** `VITE_ANALYTICS_SAMPLE_RATE` (client) and any
  server-side sampling must not both be applied, or the funnel is silently squared.
  Sample in exactly one place: the client.
