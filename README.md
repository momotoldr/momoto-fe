# Momoto — Virtual Photobooth (Frontend)

A real-time virtual photobooth. Go solo, or share a room with a partner (or a group),
see each other on live webcams, take a synchronized four-cut photo strip together, then
decorate it, save it to your gallery, and download or share it.

This is the browser app. All camera, WebRTC, capture, composition, and download work
happens here — media never touches a Momoto server.

**Docs.** In this repo: [PLAN.md](PLAN.md) · [PROGRESS.md](PROGRESS.md) ·
[DECISIONS.md](DECISIONS.md) · [REQUIREMENTS.md](REQUIREMENTS.md), plus per-feature
`PLAN-*.md` files. Across the platform (in `../`): `ARCHITECTURE.md`, `TECH-STACK.md`,
`TRD.md`, `SEQUENCE-DIAGRAMS.md`, `DEPLOYMENT.md`.

## Features

### Booth

- **Three modes** — **Solo** (fully in-browser; works without a server), **Date**
  (2-person room), and **Group** (2–4 people; behind `VITE_GROUP_MODE_ENABLED`).
- **Rooms** with short server-minted codes, a lobby, presence and connection status, and
  clear errors for mistyped, unknown, or expired codes.
- **Live P2P video + audio** over WebRTC (PeerJS). ICE servers (STUN + short-lived TURN
  credentials) are fetched from the backend per connection, with build-time fallbacks.
- **Synchronized capture** — a shared `startAt` plus clock-offset sync fires every
  member's 3-2-1 countdown at the same instant. Each of the **4 cuts** composites all
  cameras in the room side by side (a 2×2 grid for four people).
- **Session window** — a 5-minute, server-authoritative timer that resumes on rejoin
  and ends the booth for everyone at 0:00.
- **Strip design** — pick a layout (`4x1` strip or `2x2` grid) and one of 16 templates,
  then reorder shots, retake single shots or all of them, apply photo filters, and place
  SVG stickers (drag / resize / rotate). The host drives setup and guests follow it live.
- **Compose, download & share** — strips are composed on HTML5 Canvas, then downloaded
  as PNG or shared via a branded share card and the Web Share API.
- **Resilience** — in-progress booth drafts survive a tab close (IndexedDB), a
  server-down page gates the routes that need a backend, and a live Date session keeps
  running through a socket blip.

### Accounts, cart & gallery

- **Auth** — email/username + password, optional Google sign-in, email verification,
  password reset, profile with avatar upload/crop, partner linking, and self-service
  account deletion.
- **Cart** — every strip you create is saved. Guests' strips are cached in the browser
  (IndexedDB, capped by `VITE_STRIP_MAX_ITEMS`) and synced to the account on sign-in.
- **Pay-to-print** (behind `VITE_PAYMENTS_ENABLED`) — watermarked previews, with checkout
  via the backend (Midtrans Core API) to unlock the clean copy. Purchases show on the
  profile page.
- **Gallery** — unlocked strips, grouped by month.

### Platform

- Landing page with live stats and testimonials, Activities menu, Help Center, Terms,
  and Privacy.
- **i18n** — English and Bahasa Indonesia (`src/locales`), auto-detected and switchable.
- Feedback / support floating button, toasts, and route-level error boundaries.
- **Closed-beta mode** (`VITE_BETA_MODE`) — puts the booth and rooms behind the login
  wall and hides Google sign-in.

## Stack

Vite 6 · React 18 · TypeScript · React Router v7 · Zustand · axios · react-hook-form +
Zod · i18next · Tailwind CSS v3 + shadcn/ui · Sass (SCSS modules, `@apply`) ·
socket.io-client · PeerJS · sonner · HTML5 Canvas · IndexedDB · deployed on Cloudflare
Workers (static assets) via Wrangler.

## Getting started

    npm install --legacy-peer-deps   # plain `npm install` fails on an optional-peer conflict
    cp .env.example .env             # optional — defaults target a local backend

A full local stack is three processes:

    npm run dev                        # this app (Vite) on :5173
    cd ../momoto-be   && npm run dev   # backend — rooms, sync, auth, strips, payments — on :3001
    cd ../momoto-peer && npm run dev   # self-hosted PeerJS broker on :9000 (optional)

The backend needs Postgres and a `JWT_SECRET`; see `../momoto-be/README.md`. If you
don't run `momoto-peer`, leave the `VITE_PEERJS_*` vars unset and the app uses the
public PeerJS cloud broker, which is rate-limited.

Open <http://localhost:5173>. Camera access requires HTTPS or `localhost`. With no
backend reachable, **Solo** mode still works (capture, compose, download); Date/Group
rooms, accounts, and the profile need the server.

## Trying a multi-person room

Open the **same room code** in contexts that are each *visible* at once: two windows
side by side, a normal window plus an incognito one, or two devices. Two tabs in one
window don't work well, because browsers throttle background tabs and a hidden booth
misses the synced countdown. Allow the camera in both, then start the session.

To exercise TURN, use two devices on **different networks** (e.g. Wi-Fi + cellular).

## Environment

All vars are `VITE_*`, so Vite inlines them into the public bundle at **build time**.
Changing one means rebuilding, and none of them can hold a secret. See
[.env.example](.env.example) for full notes.

| Variable | Purpose | Default |
| :-- | :-- | :-- |
| `VITE_SOCKET_URL` | Backend origin — Socket.io and the HTTP API (auth, rooms, strips, TURN) | `http://localhost:3001` |
| `VITE_PEERJS_HOST` / `_PORT` / `_PATH` / `_SECURE` | Self-hosted PeerJS broker (`../momoto-peer`) | unset → public PeerJS cloud |
| `VITE_GOOGLE_CLIENT_ID` | Enables "Sign in with Google"; must equal the backend's `GOOGLE_CLIENT_ID` | unset → button hidden |
| `VITE_STUN_URLS` | Fallback STUN servers (comma-separated) | Google public STUN |
| `VITE_TURN_URLS` / `_USERNAME` / `_CREDENTIAL` | Static last-resort TURN (normally fetched from the backend) | unset |
| `VITE_PAYMENTS_ENABLED` | Pay-to-print checkout; off = free downloads | off |
| `VITE_STRIP_PRINT_PRICE_IDR` | Display price; must equal the backend's `STRIP_PRINT_PRICE_IDR` | `8999` |
| `VITE_STRIP_MAX_ITEMS` | Strips a user may keep; must equal the backend's `STRIP_MAX_ITEMS` | `5` |
| `VITE_GROUP_MODE_ENABLED` | Show the Group mode; also raise the backend's `ROOM_CAPACITY_MAX` | off |
| `VITE_BETA_MODE` | Closed beta: booth behind login, Google sign-in hidden | off |

Per-environment files: `.env.development.local`, `.env.staging`, `.env.production`.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check and build for production
- `npm run preview` — build, then serve the production bundle locally with `wrangler dev`
- `npm run deploy` — build and deploy to production (`momotoldr.com`)
- `npm run deploy:staging` — build and deploy to staging (`staging.momotoldr.com`)
- `npm run lint` — run ESLint
- `npm run format` / `npm run format:check` — format with Prettier / check formatting
- `npm run typecheck` — type-check without emitting

Deploy config lives in [wrangler.jsonc](wrangler.jsonc): SPA fallback, so deep links like
`/room/ABCD` survive a reload. Security headers (CSP, Permissions-Policy, HSTS) are in
[public/_headers](public/_headers). Its `connect-src` must list your API and broker hosts.

## Known limitations

- **Peer shots** come from the received video stream, so their resolution is the
  stream's, not the friend's native webcam resolution.
- **NAT/firewalls** — if the backend can't supply TURN credentials, some networks can't
  establish P2P video.
- **Background tabs** are throttled by browsers — keep the booth tab visible.
- Room capacity is enforced by the backend: 2 by default, up to 4 with group mode.
- No automated test suite; verification is manual (see `../TRD.md`).
- Error reporting only logs to the console for now (`src/lib/reportError.ts`, Sentry TODO).
