# Decision Log

This file records notable decisions made during the project — architectural
choices, trade-offs, and clarifications of ambiguous requirements. New
decisions are appended here (with a date and short rationale) as they are made.

---

## 2026-08-09 — Pay-to-print strips via Midtrans Snap (full plan: PLAN-payments.md)

Charging users to unlock a print-ready copy of a saved strip. Backend counterpart of
this decision is in `../momoto-be/DECISIONS.md`; the plan is split across
`PLAN-payments.md` (FE) and `../momoto-be/PLAN-payments.md` (BE).

1. **Download and Print are the same paid action; only Share is free.** Paying unlocks a
   digital, clean, watermark-free high-res PNG — that single file is both "download" and
   "print" (the user prints it themselves); there is **no free watermarked download**.
   The one free action is **Share**, which shares the **watermarked** strip (branded share
   card). _Why:_ keeps the paywall meaningful — you can freely spread the watermarked
   strip (good for reach), but a clean copy to keep/print costs; and it reuses the
   watermark groundwork in `composeStrip` (`watermark: false`) for the paid file. No
   physical fulfillment in v1 (possible later extension).
   - **Checkout happens only in the cart, as a batch.** The **result screen**
     (`StripResult`) offers **Share** (free) and a **"View in cart"** button — no payment.
     In the cart the user **ticks the strips** they want and pays for them together in
     **one** Snap checkout (`POST /payments/checkout` with the selected ids); one
     settlement unlocks all of them. No per-strip pay button. _Why:_ one checkout surface
     is simpler to secure, and paying once for several strips is a better UX (and one
     Midtrans transaction) than clicking pay on each.
2. **Payment gateway: Midtrans Snap** (hosted popup), not Core API. _Why:_ least UI work
   and lowest PCI exposure; supports cards, e-wallets (GoPay/ShopeePay), bank VA, and
   QRIS out of the box. Only the Midtrans **client key** ships in the FE.
3. **Clean image is composed client-side at creation and uploaded locked (Approach A).**
   The client composes both the watermarked and the clean variant and uploads both; the
   server serves the clean bytes only once the strip is paid. _Why:_ avoids a
   `node-canvas` port of `composeStrip` on the server. _Trade-off:_ stores a clean image
   for strips that may never be printed (~1–3 MB each); the creator briefly holds the
   clean image client-side, which is fine since it's their own photo. _Alternative (B,
   deferred):_ store raw frames + config and render clean server-side on payment.
4. **Entitlement comes from the Midtrans webhook, never the client callback.** `snap.pay`
   `onSuccess` only drives optimistic UI; the FE then polls `GET /payments/:orderId` and
   the paid flag is set server-side by the verified notification. _Why:_ the client is
   untrusted; the signed webhook is the only authority for "paid".

**Price:** Rp8.999 per strip (`STRIP_PRINT_PRICE_IDR=8999`, server-side, env-configurable);
the button shows it via `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })`.

**Open (pending):** print resolution/DPI (v1 = same full-res clean PNG); receipts/history
page (later).

## 2026-07-01 — Initial clarifications (planning Q&A)

These resolve ambiguities in REQUIREMENTS.md that were not answerable from the
spec itself.

1. **Real-time infrastructure: frontend-only + dev mocks.**
   Build only the frontend. All endpoints are env-configurable; WebRTC
   signaling uses the public PeerJS cloud broker; a lightweight local Socket.io
   mock server is included for development only.
   *Why:* keeps scope to the stated frontend requirements while remaining
   testable end-to-end locally.

2. **Four-cut = 4 sequential selfies of the local user.**
   Each of the 4 cuts is a timed shot of the local camera, stacked vertically;
   each participant downloads their own strip. Peers pose together (see each
   other live) but are not composited into one shared image.
   *Why:* classic photobooth behavior; matches "capture the current `<video>`
   frame ... repeating 4 times."

3. **Room capacity is exactly 2 (you + one peer).**
   Full-mesh WebRTC with a single call.
   *Why:* simplest reliable P2P wiring; can be revisited if group rooms are
   needed later.

4. **Strip background is a minimal, themeable solid color.**
   Single solid-color background with an optional footer (title/date),
   structured so selectable templates can be added later.
   *Why:* fastest path that still looks intentional; easy to extend.

**Assumed defaults (pending objection):** ephemeral photos/rooms (no
persistence); mic audio streamed to peer; countdown audio via Web Audio API;
modern evergreen desktop browsers over HTTPS/localhost; short client-generated
room codes.

---

## 2026-07-01 — Styling: Sass (SCSS) + Tailwind v3 + shadcn/ui

Use Sass instead of plain CSS for authored styles, combined with shadcn/ui.

- shadcn/ui components stay **Tailwind-utility based** (they ship as `.tsx`) —
  Sass does not replace that layer. Sass covers: the global stylesheet entry
  (`src/index.scss` with the `@tailwind` directives + shadcn CSS variables) and
  our own authored styles (partials via `@use`, mixins, `.module.scss` CSS
  Modules).
- **Tailwind CSS v3 is pinned** (not v4). Tailwind v4 is CSS-first and its docs
  explicitly advise against CSS preprocessors like Sass; v3's JS config +
  `@tailwind` directives pass cleanly through the Sass → PostCSS pipeline.
- Build pipeline: Sass compiles `.scss` → CSS, then PostCSS runs Tailwind +
  autoprefixer. Vite handles `.scss` natively once `sass` is installed.

*Why:* the requested Sass + shadcn combination; this is the reliable way to get
both without the Tailwind-v4 preprocessor conflict.

---

## 2026-07-01 — Styling convention: no inline Tailwind in authored JSX

Authored (non-shadcn) components must not carry Tailwind utility classes inline
in JSX. Instead:

- Each component has a **co-located `*.module.scss`**.
- Elements use semantic class names via `className={styles.x}`.
- Class bodies use **`@apply <utilities>`** (Tailwind tokens + shadcn theme
  preserved). Raw CSS / theme CSS vars (e.g. `hsl(var(--foreground))`) are fine
  where no utility fits.

**Exceptions:** shadcn/ui primitives in `src/components/ui/**` keep their inline
Tailwind classes; shadcn component props (`variant`, `size`, …) are unaffected.

**Applies forward** to every phase.

Consequence: the earlier `styles/_variables.scss` + `_mixins.scss` partials were
removed as redundant under this convention. Shared Sass helpers can be
reintroduced only when a concrete need arises.

*Why:* user preference for clean markup with styling centralized in SCSS modules.

---

## 2026-07-01 — Captured frames are mirrored to match the preview

The local preview is mirrored (selfie-style). Captured frames are mirrored too,
so the downloaded strip matches what the user saw while posing. Controlled by the
`MIRROR_CAPTURE` flag in `features/capture/constants.ts` — set to `false` for the
true (un-mirrored) camera image.

*Why:* least surprise vs. the on-screen preview; trivially reversible.

---

## 2026-07-01 — Countdown sync strategy + solo fallback

- **Synchronized start via server timestamp + client clock offset.** On connect,
  the client runs a `time:sync` handshake (NTP-style) to estimate
  `serverClock - clientClock`. `session:start` makes the server broadcast
  `countdown-start { startAt }` (server time + small buffer); each client
  converts `startAt` to local time via its offset and schedules the capture
  sequence, so both begin at the same wall-clock instant rather than on raw
  message receipt.
- **Solo / offline fallback.** If no socket is connected (no dev server / real
  backend reachable), **Start Session** runs the capture sequence locally, so the
  app stays fully usable standalone.

*Why:* robust sync without depending on a real backend; keeps the frontend
usable on its own.

---

## 2026-07-01 — Peer connection (PeerJS) strategy

- **PeerJS ids exchanged over the socket room** via a `peer:announce` relay
  (auto-generated ids, rather than reusing socket ids as PeerJS ids — which
  risks PeerJS id-validation edge cases).
- **Deterministic initiator**: the peer with the lexicographically higher PeerJS
  id places the call; the other answers. Prevents both calling at once (glare).
- **Peer mic/cam reflection** via a `peer:media-state` relay — a WebRTC receiver
  can't see the sender's track `enabled` flag, so the sender broadcasts it.
- **Broker**: public PeerJS cloud by default; `VITE_PEERJS_*`-overridable for a
  self-hosted PeerServer. TURN may be needed on restrictive networks (known
  limitation).

*Why:* layers P2P video cleanly on top of the Phase 4 socket presence without a
custom signaling server.

---

## 2026-07-01 — Capture model changed: alternating two-camera strip

**Supersedes** the original "four-cut = 4 sequential selfies of the local user."
Per user testing feedback, when a peer is present the strip now **alternates
between the two cameras**: shots go local → peer → local → peer, so the strip is
`[you, friend, you, friend]`. The 3-2-1 countdown overlays only the frame being
captured that shot (your tile, then the peer's tile — one at a time, never both),
driven by `usePhotosStore.activeSource`.

- Peer shots are captured from the **received video stream** (stream resolution,
  not the peer's native webcam res) — i.e. we capture "their frame" as displayed.
  A future upgrade could exchange native-res frames between peers for higher
  quality.
- **Solo** (no peer): all 4 shots are local (unchanged).

*Why:* the user wants one shared strip featuring both people, with the countdown
following whichever camera is being captured.

---

## 2026-07-01 — Capture model: side-by-side composite (both cams per cut)

**Supersedes** the alternating model. Each of the 4 cuts now composites **both
cameras side-by-side into one frame** (local mirrored on the left, peer on the
right, each cover-cropped to fill its half), captured **simultaneously**. The
3-2-1 countdown shows on **both tiles at once** (shared moment). Solo (no peer)
captures the local camera full-frame.

- The cut keeps the local camera's native dimensions; the peer half comes from
  the received stream (stream res). If the peer drops mid-session, that cut
  degrades to local-only.

*Why:* the user wants both people together in every cut ("2 cams on the same
frame").

---

## 2026-07-01 — Pre-camera layout picker (strip vs 2×2 grid)

Entering a room now shows a **layout picker before the camera opens**: choose a
**vertical strip** (4 stacked) or a **2×2 grid** — both still 4 shots. Capture is
unchanged (4 synced shots); the choice only affects composition, so each person
picks their own arrangement locally (no socket sync needed). `composeStrip` was
generalized to `cols` (1 = strip, 2 = grid). The choice resets on leaving the room.

*Why:* user-requested template step; kept purely client-side by not changing the
shot count.

---

## 2026-07-01 — Strip color picker (after layout, before camera)

After the layout picker, a **color picker** step lets each person choose the
strip background: white, black, gold, pink, blue, or red. Each color carries a
readable footer-text shade (dark text on light backgrounds, light text on dark),
so `composeStrip` gained a `textColor` option. Client-side only, like the layout
choice — each person picks their own; both reset on leaving the room.

*Why:* requested customization; no capture/sync impact (only affects
composition).

---

## 2026-07-01 — Strip setup is host-controlled (fixes guest re-picking)

**Reverses** the "each person picks their own layout/color" note above. In a
2-person room the **host** (first member; a solo/offline user; or whoever
remains after the other leaves) picks the layout + color; the choice is broadcast
(`strip:config`) and the **guest inherits it** — the guest never sees the
pickers, showing "Waiting for the host…" until the config arrives, then going to
the camera. The host re-broadcasts on peer-join so a late guest still receives
it. Role tracked via `useRoomStore.isHost` (room-member order).

*Why:* bug — a guest could pick a different layout/color than the host; the strip
setup must be shared so both strips match.

---

## 2026-07-01 — Entry modes: Solo vs Date (lobby)

The landing offers two modes (plus join-by-code):

- **Solo** — no shared code and **no socket connection** (`useRoom({ connect:
  false })`); acts as host locally and goes straight to layout → color → camera.
  Each cut is the local camera full-frame. Fully offline-capable.
- **Date** — generates a code and shows a **lobby** (share code + "waiting for
  your friend") until the guest joins, then proceeds to the host's layout/color
  setup.

Mode is carried in the room URL (`?mode=solo|date`, default `date`). Guests
joining by code are always date-mode guests. The layout-picker copy was made
mode-agnostic (solo has one camera).

*Why:* clearer entry than a bare "create room"; solo needs no server or peer.

---

## 2026-07-01 — Camera opens during config (talk while setting up)

Reordered the booth: the camera + peer video now open as soon as you enter the
booth (past the date lobby), and the layout/color setup happens **below the live
feeds** — so participants can see and talk while the host picks. Capture (Start
Session) still runs only after setup. The config pickers moved from separate
pre-camera screens into `CameraStage`'s ready state; the guest sees the video +
"host is setting up…" instead of a blank wait, with cam/mic controls available.

*Why:* better UX — the two people can interact while configuring the strip.

---

## 2026-07-01 — 3-minute session timer

Each booth session runs a **3-minute timer** (`SESSION_SECONDS = 180`) that
starts when the booth opens (past the date lobby, so lobby waiting doesn't
count). A `m:ss` countdown shows in the header (turns red under 30s). At 0 the
session ends — a "Time's up" screen with "Back home", and the booth unmounts so
the camera/peer connection are torn down. The timer **freezes once a completed
strip is on screen**, so a finished strip isn't cut off before download.
Per-client (not server-synced), but both peers open the booth ~together so they
end within a second of each other.

*Why:* requested room time limit.

---

## 2026-07-01 — Session persists across tab close/reopen

The timer is anchored to a fixed **end timestamp persisted in localStorage per
room** (with the chosen layout/color). So closing/refreshing and reopening the
same room **resumes** the remaining time + setup instead of restarting; a session
that expired while away comes back already ended. Explicit **Leave / Back home
clears** the persisted session (rejoining that code is fresh); an accidental
close does not. A completed strip isn't cut off at 0 — the "Time's up" screen
only replaces the booth when no finished strip is showing
(`ended && !resultShowing`).

*Why:* an accidental tab close shouldn't reset or lose the session.

---

## 2026-07-01 — WYSIWYG capture: fixed 3:4 cell for preview + capture

**Refines** the composite capture model. The live preview and the captured cut now
share **one cell aspect ratio** so the preview shows exactly what's captured.

- `CELL_ASPECT = 3/4` (portrait) in `features/capture/constants.ts`. Each camera is
  cover-cropped (from center) into a `cellHeight × cellHeight*3/4` cell;
  `captureCompositeFrame` lays cells side-by-side. Duo cut = two 3:4 cells (3:2 cut),
  solo = one 3:4 cell — replacing the previous "cut keeps the local camera's native
  dimensions" (which made duo cells ~half-width and solo full-frame, neither matching
  the 16:9 preview tiles).
- Preview tiles (`CameraStage`) are `aspect-[3/4]` with `object-cover` + local mirror,
  so each tile is the exact center-crop of that camera's captured cell. `ShotTray`
  slots match (`aspect-[3/4]`, `object-contain` to show a full two-person cut).

*Why:* the framing shown while posing must equal the framing that lands in the strip;
portrait cells also make a natural photobooth strip (two people side-by-side per cut).

---

## 2026-08-04 — PeerJS broker stays a separate deployable (`momoto-peer`)

**Supersedes** the "public PeerJS cloud by default" broker choice above (2026-07-01),
which throttles under real load.

- The broker is its own service, `momoto-peer` — Express + `ExpressPeerServer` with
  `/healthz`, a CORS allowlist, and `allow_discovery` off. Deployed as a second
  always-on instance; the frontend points at it via `VITE_PEERJS_*`.
- **`momoto-be` must not host it.** No `peer` dependency, no `ExpressPeerServer` mount
  (guard comment in `src/http/app.ts`). The backend's `peer:announce` /
  `peer:media-state` relays stay — those carry PeerJS *ids* and media flags between room
  members, which is room protocol, not brokering.

*Why:* not a performance win — signaling is a few tiny messages per session and media is
P2P either way. Embedding the broker in `momoto-be` would in fact be cheaper by one
instance, and looks free today because in-memory `roomStore` already loses live rooms on
redeploy. But once room state moves to Redis, redeploys stop dropping rooms, and an
embedded broker would reintroduce that disconnect. Separate restart/scale domains now
avoids untangling it later.
