# Momoto Frontend — Observability

Plan for frontend observability. It covers a **clickstream** (page views and clicks, per
session), **error reporting** (what broke) and **performance timings** (what was slow).
All three go through one pipeline, so batching, consent, sampling and retention are
decided in one place.

> **Revision 2 (2026-09-29).** Rewritten after checking the first draft against the code
> as it now is (backend split into core + realtime, FE on Cloudflare Workers, closed beta
> live in prod). The architecture is unchanged. What changed: a "what exists today" audit,
> an explicit session model, the transport details (`text/plain` beacon, a separate
> identify call), click autocapture, flag and build context on every batch, and corrected
> file references. The previous version is in git history.
>
> **Revision 3 (2026-09-29).** The pipeline itself (queue, batching, retry, delivery on
> unload, identity ids, page views, click autocapture) moves into a separate library,
> **[`momoto-tracker`](../../../docs/PLAN-tracker.md)**. This document now covers only
> Momoto's side:
> - what to track (the taxonomy)
> - where each event is emitted
> - privacy
> - the backend ingest
>
> **Revision 4 (2026-09-29):** there is no portal UI. Events are queried directly in
> Railway, by `sessionId` (see `momoto-analytics/PLAN.md` §6).
>
> Where this plan and the library plan disagree on a pipeline detail, the library plan
> is the one to follow.

**Legend:** DoD = Definition of Done.

---

## What exists today (audited 2026-09-29)

| Signal | State |
| --- | --- |
| Page views | **None.** `public/_headers` still allows the Cloudflare Web Analytics beacon and its comment says "Pages auto-injects" it. We moved to **Workers**, which does not inject it: the live HTML on `momotoldr.com` and `staging.momotoldr.com` carries no beacon. |
| Clicks / funnel | **None.** 114 `onClick=` sites and no instrumentation. |
| Client errors | `src/lib/reportError.ts` only calls `console.error`. The Sentry TODO is still open. Two callers: `ErrorBoundary` and `RouteErrorBoundary`. There is no `window.onerror` / `unhandledrejection` hook. |
| Worker observability | `wrangler.jsonc` sets `observability.enabled: true`, but the Worker is assets-only (no `main`). Asset hits are not Worker invocations, so it logs nothing. |
| Backend | `momoto-core` has no event table or ingest route. `feedbackRouter` is the closest model: anonymous-friendly, `RateLimiter`, a local `optionalUserId()`. |
| Admin | `momoto-portal` has `SessionsPage`, but its sessions come from saved strips, not visits. **Out of scope:** analytics is read with SQL in Railway, not in the portal. |

Nobody can currently answer "how many people opened the booth today", "where do they
drop off" or "how many connections needed TURN". The closed beta is running in prod with
real testers, and it is producing none of the data it exists to collect.

---

## Concept

- **First-party, not a vendor.** Events go to our own `momoto-analytics` service and
  land in its own Postgres. They are read with SQL in Railway; there is no dashboard. The privacy page promises *"We don't use advertising
  cookies or third-party tracking pixels"* (`en` + `id` `translation.json`, `storage`
  section). A first-party, cookieless pipeline keeps that true, needs no consent banner
  and adds no vendor. See [Rejected alternatives](#rejected-alternatives).
- **One typed taxonomy.** Events are a discriminated union in `src/analytics/events.ts`,
  so a typo is a type error. The service's allowlist is checked against the same list in
  its CI.
- **Two ways to emit.**
  1. **Explicit `track(...)`** for anything with meaning: a shot taken, a template
     chosen, a payment.
  2. **Click autocapture.** One delegated `document` listener records every click on a
     `button`, `a` or `[role=button]`. The element's `data-track` id is used when it has
     one, and the click is recorded as *untracked* when it doesn't (see
     [Clickstream](#clickstream-page-views-and-clicks)). Tagging a button is one
     attribute, not a handler. That fits the styling convention and keeps `onClick`
     about behaviour.
- **The booth is realtime; the pipeline must not be.** Nothing runs per animation frame,
  per ICE candidate or per video frame. Events queue in memory, flush on a timer or on
  `pagehide`, and never re-render anything.
- **Off by default until proven.** `VITE_ANALYTICS_ENABLED` gates the module. When it is
  unset, `track` is a no-op that logs through `console.debug` in dev. This follows the
  same pattern as `VITE_PAYMENTS_ENABLED` and `VITE_BACKDROPS_ENABLED`.
- **No PII, enforced by types.** Props are `string | number | boolean | null` only. No
  free text, no email, no element text content, no raw room code or strip id. Where a
  join key is needed, send a truncated SHA-256.

---

## Session model

Two different things are called a "session" in this app. The pipeline carries both, and
queries must keep them apart.

| id | what it is | storage | lifetime |
| --- | --- | --- | --- |
| `anonId` | a browser | `localStorage` `momoto.analytics.aid` | until cleared |
| `sessionId` | **a visit**: the clickstream unit | `sessionStorage` `momoto.analytics.sid` + last-activity ts | tab; rolls over after 30 min idle |
| `boothSessionId` | **a booth run**: one room from open to Finish/expiry | derived: `sha256(roomId + sessionStart).slice(0, 16)` | one room window |
| `userId` | an account | server-side, via identify | while signed in |

- **"Every session" in the request means the visit.** It is the unit the main query
  drill-down lists: one row per `sessionId` holding its ordered page views and clicks.
- `boothSessionId` rides as a prop on every booth event. Both members of a Date/Group
  room derive the same value, so one booth run can be viewed from both sides. The raw
  room code never leaves the device.
- `anonId` comes from `newId()` in `utils/id.ts`. It is random and never derived from a
  fingerprint.
- **Why identify exists.** The guest flow captures a strip *before* the login wall, so
  the interesting funnel starts before there is a user. After login, register, Google
  sign-in or `getMe` restore, the client makes one authenticated `POST /events/identify
  { anonId }` call. That stores the `anonId → userId` link on the server. The beacon
  itself never carries a user id, because a user id in a public, unauthenticated body
  could be forged.

---

## Architecture

The pipeline is `@momotoldr/tracker` (see the [library plan](../../../docs/PLAN-tracker.md)).
In momoto-fe, `src/analytics/` is a thin layer over it:

```
src/analytics/
  events.ts        # MomotoEvents: the event map passed to createTracker<MomotoEvents>()
  trackIds.ts      # TRACK_IDS: every data-track value, greppable
  routes.ts        # route normaliser for the pageViews plugin (matchPath over ROUTES)
  tracker.ts       # createTracker(config) at module scope, plus plugins; identify wiring
  booth.ts         # boothSessionId derivation; useTipsStore → stage_entered subscription
  errors.ts        # window.onerror / unhandledrejection → client_error
  vitals.ts        # LCP / INP / CLS / TTFB → web_vital
  index.ts         # barrel: `import { track } from '@/analytics'`
```

The tracker is created at module scope, never in a component, so StrictMode and HMR
can't create a second instance. The `pageViews` and `autocapture` plugins replace the
`RouteTracker` / `ClickTracker` components from revision 2, so nothing needs mounting in
`RootLayout`.

### Context sent once per batch (not per event)

```jsonc
{
  "appVersion": "808bd75",          // GITHUB_SHA::7 via Vite `define`; "dev" locally
  "env": "production",              // Vite mode
  "flags": { "beta": true, "payments": false, "group": false, "backdrops": false },
  "locale": "id", "viewport": "390x844", "isMobile": true,
  "connection": "4g"                // navigator.connection?.effectiveType, when present
}
```

Staging and prod run different flags (for example, payments are on in staging), so
`flags` is what lets a funnel be read correctly. `appVersion` is what makes it possible
to say "errors started with deploy X". Nothing in the context identifies a person.

### Queue and delivery

The library owns this: batching, retry with backoff, delivery on unload via
`sendBeacon`, the `sessionStorage` backup, caps and dropped-event counts (library plan
§2–3). Two points are Momoto-specific:

- **Not axios.** The library uses its own `fetch`, so a failed beacon never touches
  `useServerStore` / `useNetworkStore`. Keep it that way: never pass the tracker an axios
  adapter. Only the health probe may blame the server.
- **Endpoint** is `VITE_ANALYTICS_URL` + `/v1/b` (batch) and `/v1/e` (single), served
  by `momoto-analytics`. The host (`e.momotoldr.com`) needs adding to `connect-src`. The paths are
  neutral on purpose, because ad-block lists match `/events`, `/track` and `/analytics`.
  The hostname gets checked against blockers on staging (service plan A2).

### Consent

Emit nothing when any of these hold:

1. `VITE_ANALYTICS_ENABLED !== 'true'`
2. `navigator.doNotTrack === '1'` or `navigator.globalPrivacyControl === true`
3. `localStorage['momoto.analytics.optout'] === 'true'` (a toggle on `/profile`)
4. the visit lost the `VITE_ANALYTICS_SAMPLE_RATE` roll. The roll happens **once per
   `sessionId`**, never per event, because per-event sampling breaks funnels. Default 1.0.

No consent banner: this is first-party, cookieless, non-advertising measurement. The
privacy page gets a paragraph saying exactly what is collected and how to opt out (F5).
**F5's copy must ship before the flag is turned on in production**, because the beta
testers are real people.

---

## Clickstream: page views and clicks

### Page views

The library's `pageViews` plugin emits `page_view` on every pathname change. Momoto
supplies the normaliser (`src/analytics/routes.ts`):

- `route`: the **pattern** (`/room/:roomId`), matched against `ROUTES`, never the URL.
  The raw path would leak room codes, and `/reset-password?token=…` would leak a token.
- `fromRoute`, and `msOnPrevious` (time spent on the page being left).
- Query strings are **never** recorded, and the plugin can't read them. The booth mode
  from `/photobooth?mode=` comes from `booth_mode_selected` instead.
- It de-dupes on route, so the double mount under React StrictMode in dev doesn't emit
  twice.

The first `page_view` of a visit also carries `referrerHost` (host only) and
`utm_source` / `utm_campaign` if present. This covers "where did beta testers come from"
without keeping the full referrer.

### Clicks (autocapture + `data-track`)

A single `click` listener on `document` (capture phase, passive) walks up to the nearest
`button, a, [role=button], [data-track]` and emits:

```ts
{ name: 'click', props: {
    id: 'booth.start_session' | null,  // data-track, or null = untracked
    el: 'button' | 'a' | 'role',
    route: '/photobooth',
    // for <a> only: target route pattern, or 'external:<host>'
    to?: string,
} }
```

- **Element text is never read.** It can hold a user's name (UserMenu), an email or an
  invite code, and it changes with the locale anyway.
- **Untracked clicks are still recorded** (`id: null`). A saved query lists "untracked clicks
  per route". That is the to-do list for tagging, and it shows gaps that a hand-picked
  list would hide.
- **`data-track` naming:** `area.action`, e.g. `landing.cta_start`, `mode.date`,
  `booth.start_session`, `booth.retake`, `arrange.create`, `result.download`,
  `cart.unlock`. Every value is listed in a `TRACK_IDS` constant, so ids stay greppable
  and queries can refer to them.
- shadcn `Button` spreads props, so `data-track` passes through with no component
  change.

Explicit `track()` events stay as they are. A click answers "what did they press". A
`strip_created` answers "did it work". Most funnel steps need the second.

---

## Event taxonomy

Names are `snake_case`, `noun_verb-past`. Props are flat scalars.

### Lifecycle
| event | props |
| --- | --- |
| `app_open` | `referrerHost`, `utmSource`, `utmCampaign`, `isPwa` |
| `page_view` | `route`, `fromRoute`, `msOnPrevious` |
| `click` | `id`, `el`, `route`, `to` |
| `visit_hidden` | `msVisible`, emitted on `pagehide`; gives visit duration |
| `signed_out` | — |

### Auth
| event | props |
| --- | --- |
| `auth_submitted` | `method: 'password' \| 'google'`, `intent: 'login' \| 'register'` |
| `auth_succeeded` | `method`, `intent` |
| `auth_failed` | `method`, `intent`, `code` (the `ApiError` code, never the message) |
| `email_verification_opened` | `outcome: 'ok' \| 'expired' \| 'invalid'` |
| `password_reset_requested` / `password_reset_completed` | — |

### Booth funnel
Mirrors `BOOTH_STAGES` (`lobby → booth → arrange → result`). All booth events carry
`boothSessionId` and `mode`.

| event | props | emitted from |
| --- | --- | --- |
| `booth_mode_selected` | `mode: 'solo' \| 'date' \| 'group'` | mode card handler |
| `camera_requested` | — | `useUserMedia` |
| `camera_granted` | `msToReady`, `deviceCount` | `useUserMedia` |
| `camera_denied` | `reason` (normalized code from `utils/media-errors.ts`) | `useUserMedia` |
| `room_created` / `room_joined` | `seats` | `useRoom` |
| `room_refused` | `reason: 'full' \| 'ended' \| 'not_found' \| 'busy'` | `useRoom` |
| `peer_connected` | `msToConnect`, `viaTurn: boolean` | `usePeerConnection` |
| `peer_failed` | `reason`, `msElapsed` | `usePeerConnection` |
| `peer_dropped` | `msIntoSession` | `usePeerConnection` |
| `session_started` | `seats` | `useRoom` |
| `shot_taken` | `index` (0–3) | `useCaptureSequence` |
| `capture_completed` | `msFromStart` | `useCaptureSequence` |
| `retake_requested` | `shotIndex \| null` | capture handler |
| `stage_entered` | `stage`, `msInPreviousStage` | **`useTipsStore` subscription** |
| `template_selected` | `templateId`, `family: 'ribbon' \| 'card'` | `useStripStore` |
| `filter_selected` / `backdrop_selected` | `filterId` / `backdropId` | `useStripStore` |
| `sticker_added` | `stickerId` | arrange handler |
| `strip_created` | `templateId`, `filterId`, `stickerCount`, `msToCompose` | compose call site |
| `strip_downloaded` | `format`, `watermarked` | `utils/download.ts` |
| `strip_shared` | `surface` | share handler |
| `session_finished` | `byHost`, `hadStrip`, `secondsUsed` | `useRoom` |
| `session_expired` | `hadStrip` | `useSessionTimer` |

Notes:
- **`stage_entered` subscribes to `useTipsStore`, not `useBoothStage`.** The hook's
  cleanup sets `null` on every unmount, and StrictMode runs that twice. The store already
  receives exactly one value per screen, so subscribing outside React
  (`useTipsStore.subscribe`) gives one event per real transition. Ignore `null`.
- **`viaTurn`** is one `getStats()` read of `conn.peerConnection` after `connected`: the
  selected candidate pair's local or remote `candidateType === 'relay'`. It is a single
  call, not polling. This is the number that turns the TURN cost cliff in
  `PUBLIC-SCALE.md` from a guess into a measurement.
- `shot_taken` is the only high-frequency event, bounded at four per capture. Never
  instrument countdown ticks, time-sync pings or ICE candidates.

### Commerce
`cart_viewed { itemCount, slotsUsed }` · `strip_added_to_cart { source: 'result' |
'guest_sync' }` · `unlock_clicked { paymentsEnabled }` · `checkout_started` ·
`payment_succeeded { amountIdr }` · `payment_failed { code }` · `gallery_viewed
{ itemCount }` · `strip_deleted { from: 'cart' | 'gallery' }`.

### Health
| event | props |
| --- | --- |
| `client_error` | `source`, `name`, `messageHash`, `route` |
| `api_failed` | `route` (**template**, e.g. `/strips/:id`), `method`, `status`, `code` |
| `network_trouble` | `route` |
| `server_status_changed` | `status: 'up' \| 'down' \| 'unknown'` |
| `web_vital` | `metric: 'LCP' \| 'INP' \| 'CLS' \| 'TTFB'`, `value`, `rating` |
| `timing` | `name`, `ms` (e.g. `segmenter_ready`, `strip_upload`) |

`messageHash`, not the message, because error strings pick up user input. Full messages
belong in Sentry (F3, optional).

---

## Backend: `momoto-analytics`

A **separate service with its own Postgres** (decided 2026-09-29). Its plan, including
the ingest rules, trust model, data model, measured sizing, retention, jobs and deploy,
is **[`momoto-analytics/PLAN.md`](../../../momoto-analytics/PLAN.md)**. What momoto-fe
needs to know:

- **Where events go:** `VITE_ANALYTICS_URL`, i.e. `https://e.momotoldr.com` (prod) or
  `https://e-staging.momotoldr.com`. It is required when `VITE_ANALYTICS_ENABLED=true`,
  checked by `scripts/check-env.mjs`, and both hosts must be added to `connect-src` in
  `public/_headers`.
- **Identify** calls `POST /v1/b/identify` on that host with the normal access token.
  The service verifies it with the shared `JWT_SECRET`.
- **The event allowlist** in the service is kept in step with `src/analytics/events.ts`.
  Its CI fails when a name is missing, so adding an event means adding it there too.
- **Account deletion:** `useDeleteAccount` calls `DELETE /v1/b/identify` just before
  `DELETE /auth/me`, while the token is still valid. It's best-effort; the service also
  expires identity links after the retention window. Core needs no change.
- **Reading the data:** SQL against the analytics DB in Railway, usually "one
  `sessionId`, in order". The saved queries are in the service plan §6.
- Size, measured: **278 bytes per event**, ~0.9 GB/month at 10k MAU, kept 90 days.

## Finding a visit

Scope (user decision 2026-09-30): **only event tracking.** The feedback form and the
error screens are left untouched. A visit is found from the data itself, using the
service's saved queries:
- **Latest visits** (query 0): most recent visits with their user (if signed in),
  entry route and event count. Pick one, then run query 1 on its `sessionId`.
- **From an account** (query 2): look up the `userId` in core's DB, then list that
  user's visits.
- **From a crash** (query 4): visits with a `client_error` in the last 24 h.
- **In dev:** `window.__photobooth.analytics.getIdentity()` shows the current
  `sessionId`, next to the existing store handles.

---

## Phases

### F0 — Quick win + stub *(half a day)*
- Turn on **Cloudflare Web Analytics** for `momotoldr.com` in the dashboard, or fix the
  stale `_headers` comment if it stays off. Either way the comment must stop claiming
  auto-injection. This gives aggregate page views and vitals today, before any code
  ships. It does not give per-session clickstream. (Decision below.)
- Add `VITE_ANALYTICS_ENABLED`, `VITE_ANALYTICS_SAMPLE_RATE` and `VITE_ANALYTICS_URL`
  (required when enabled) to `env.ts`, `.env.example` and `scripts/check-env.mjs`. Add
  `__APP_VERSION__` via Vite `define` from `GITHUB_SHA`.
- Write `events.ts` (`MomotoEvents`) with the taxonomy above. It can land before the
  library does: until L6, `track()` only `console.debug`s.

**DoD:** `track('app_open', …)` type-checks; a typo'd name fails
`npm run typecheck`; nothing is sent.

### F1 — Integrate the library: page views + clicks *(1 day FE; = library L6)*
Needs `@momotoldr/tracker` v0.1.0 (library L0–L5). It installs as a git dependency,
`git+https://github.com/momotoldr/momoto-tracker.git#v0.1.0`, from the public repo. CI
needs no changes (library plan §7.1) and `momoto-analytics` on staging
(service A0–A2).

FE:
- `tracker.ts` with the config;
- the `pageViews` plugin with the route normaliser;
- the `autocapture` plugin (no `data-track` ids yet);
- identify via `onIdentity`, `resetIdentity` on sign-out, and the
  `DELETE /v1/b/identify` call in `useDeleteAccount`;
- the dev handle `window.__photobooth.analytics`;
- `VITE_ANALYTICS_URL` + `connect-src`.

**DoD:**
- Browsing on staging produces `app_open`, one `page_view` per route change and a
  `click` per button press, and rows appear in the staging DB.
- Closing the tab still delivers the last batch (visible as a beacon in the network
  panel).
- DNT/GPC on ⇒ zero requests.
- The request is not blocked by uBlock Origin defaults.
- Signing in writes one `AnalyticsIdentity` row in the analytics DB, and deleting a test
  account removes it.
- **Query 1 on the current `sessionId` shows the visit in order:** every page view and
  click, as it happened.
- **No room code, token or query string appears in any row.**

### F2 — Booth funnel + `data-track` on CTAs *(2–3 days)*
Instrument the booth events at the call sites in the table. Tag the primary CTAs with
`data-track`: landing CTA, mode cards, Start Session, Retake, Create, Download, Share,
Unlock, Add to cart. Add `TRACK_IDS`.

**DoD:**
- One solo and one date run on staging each produce a complete, ordered funnel with no
  gaps, and both date members share one `boothSessionId`.
- `viaTurn` is correct on a forced-relay run (`iceTransportPolicy: 'relay'` locally).
- React Profiler shows no new re-renders in the room: `track` is only called from
  effects, handlers and store subscriptions, never from render.

### F3 — Errors and vitals *(1–2 days)*
Fan `reportError` out as `client_error` (this closes its TODO). Add `errors.ts` for
`window.onerror` / `unhandledrejection`. Emit `api_failed` from `interceptErrorResponse`
in `axiosClient.ts`, using the route **template**. Add `vitals.ts` via `web-vitals`
(≈2 KB).

Optional, independent: Sentry behind `VITE_SENTRY_DSN`, with source maps uploaded in CI
(prod doesn't ship maps publicly, see `vite.config.ts`). Recommended eventually, not a
blocker.

**DoD:** a deliberately thrown render error produces a boundary and a `client_error`
row; a forced 500 produces `api_failed`; LCP/INP/CLS arrive once per page view.

### F5 — Consent, docs, retention *(half a day). Must land before prod F1 is switched on.*
Opt-out toggle on `/profile`; privacy paragraph in `en` + `id` that lists fields
exactly (including the 90-day retention and how the account link is removed); a
`DEPLOYMENT.md` section; the `VITE_ANALYTICS_*`
GitHub Environment vars for staging and production.

**DoD:** the toggle stops emission immediately without a reload; the privacy copy
matches the collected fields exactly.

(There is no F4: the portal and findability phases were dropped.)

**Rollout:** staging with the flag on from F1 → prod once F1, F2 and F5 are done. The
closed beta is the best time for this: every tester is signed in, so every funnel joins
to an account.

---

## Decisions needed

1. **Cloudflare Web Analytics as a stopgap: on or off?** It is cookieless and already
   allowed by the CSP, and it was running before the Workers move. But it *is* a
   third-party script, sitting next to the "no third-party tracking pixels" line.
   *Recommendation:* turn it on now as a stopgap and drop it once F2 is live in prod.
2. ~~Store~~ **Decided:** Postgres, in the separate **`momoto-analytics`** service with
   its own database. Workers Analytics Engine was rejected: per-visit timelines and joins
   to users are awkward there (SQL API only, 3-month retention, sampling at volume).
3. **Sample rate at launch:** 1.0 for the beta, revisit at public launch.

---

## Rejected alternatives

- **PostHog / Plausible / Umami Cloud.** Faster to stand up, with better dashboards. But
  it means a third-party script on a page holding a live camera feed, the privacy line
  would need caveats, and session replay on a *photobooth* is a non-starter.
  Self-hosting one is a second service to run. Revisit if hand-written SQL queries
  become the bottleneck.
- **Google Analytics.** Advertising cookies and a consent banner, and it contradicts the
  shipped privacy copy.
- **Events over Socket.io (`momoto-realtime`).** The connection exists only inside a
  room, so it would miss landing, auth and cart. It would also share the channel that
  carries capture sync, which must never be delayed, and realtime has no DB by design.
- **Per-event sampling.** It breaks funnels (step B can appear to out-convert step A).
  Sample visits instead.
- **Recording click text / CSS selectors.** Text leaks PII and changes with the locale.
  Selectors change with every refactor. `data-track` + "untracked" is stable and safe.

## Risks and watch-items

- **A public write endpoint.** The allowlist, rate limit and size cap in
  `momoto-analytics` are what stop `/v1/b` from becoming a spam sink. They are
  required, not optional.
- **Instrumentation drifting from behaviour.** Emit from the single place that already
  owns the fact (`useTipsStore` for stage, the mode card for mode). Never re-derive
  funnel state elsewhere.
- **Leaking identifiers through routes.** `page_view` uses patterns, and links use
  `to` patterns. Add a unit test that feeds `/room/ABC123?x=1` and
  `/reset-password?token=…` through the normaliser.
- **Sample in exactly one place: the client.** Server-side sampling on top would square
  the funnel.
- **StrictMode double effects** in dev will double-emit anything tracked from a
  mount-effect. The `pageViews` plugin de-dupes routes. Elsewhere, prefer store
  subscriptions.
