# Progress Log

A running log of work on the Real-Time Virtual Photobooth frontend.
Newest entries at the top.

> **Pay-to-print (Midtrans Snap)** has its own log: **`PROGRESS-payments.md`** (plan in
> `PLAN-payments.md`). Backend counterpart: `../momoto-be/PROGRESS-payments.md`.

---

## 2026-08-10 — Self-service account deletion (profile "Delete account")

Users can now delete their own account from **Profile → Delete account**, no DB access
needed.

- **Backend (`../momoto-be`)** — new `DELETE /auth/me` (`requireAuth`). Accounts with a
  password must re-supply it (server verifies → `403 invalid_password` on mismatch);
  Google-only accounts confirm without one. Deletes the user (cascades strips, avatar,
  refresh tokens, partner invites; unlinks partner; detaches feedback; removes their
  payment rows) and clears the refresh cookie.
- **Frontend** — `authService.deleteAccount(password?)` (clears the local token only on
  success). `ConfirmDialog` extended with optional `children` + `confirmDisabled` so it
  can host the password field. New `useDeleteAccount` hook (mirrors `useLogout`): confirm
  dialog with a password field for password accounts, inline "wrong password" error, and
  on success clears the session, toasts, and routes home. A "Delete account" section added
  to `ProfilePage`. i18n keys `auth.profile.delete*` + `auth.deleteConfirm.*` (en + id).
- **Verified (live, real backend)** — wrong password → inline error, session intact;
  correct password → account deleted, signed out, redirected home; deleted account can no
  longer log in (401). BE + FE `typecheck` / `lint` / `build` clean.

## 2026-08-10 — Feedback FAB: support-only when signed out + tip fires for guests

Two adjustments to the feedback FAB for **unauthenticated** users.

- **Form collapses to Support.** Signed-out users can't leave general feedback — the
  category toggle is hidden and the form is Support-only (`availableCategories =
  isAuthenticated ? ['feedback','support'] : ['support']`, `defaultCategory` likewise).
  Since Support already drops the rating and requires the email, a guest sees just a
  required **message** + required **email** — exactly what a reply-able support request
  needs. Signed-in users are unchanged (both tabs).
- **Tip now appears for guests.** Root cause it didn't: the tip was synced to the cart
  tip (cart-count growth), but the cart is **auth-gated** (`AuthProvider` only `load()`s
  it when authenticated), so a guest's count never grows → no tip. Added a fallback:
  when `authStatus === 'unauthenticated'`, the tip pops after `TIP_DELAY` (1.5s). So
  signed-in users still get it in sync with the cart tip (on add-to-cart), and guests
  get it shortly after load. Same 7s auto-dismiss / ✕ / open-to-close behavior.
- **Verified (live, backend up):** signed-out, the dialog shows **no tabs, no rating,
  required message + email** (screenshot); a state probe confirmed `authStatus:
  unauthenticated` with `tipOpen` flipping true then auto-dismissing — i.e. the tip
  fires for guests. `typecheck` / `lint` / `build` / `format:check` clean. (DOM-query
  polling for the tip is flaky here because the preview's navigate/exec latency can
  exceed the 7s tip window — verification was via a React-state probe.)

## 2026-08-10 — Feedback FAB: nudge tip popover (synced with the cart tip)

Added a **tip popover beside the feedback FAB** that surfaces **in sync with the cart
tip** — both pop when a strip is added to the cart — nudging the user to send feedback
or ask for support. (Iterated from an earlier same-day version that popped once per
session on load; the final trigger mirrors the cart tip.)

- **`components/common/FeedbackFab`** — new `tipOpen` state driven by the **same
  trigger as the cart tip**: it watches `useCartStore` item count via a
  `prevCartCountRef` and pops when the count **grows** (`grew && count > 0 &&
  !onCartPage`), suppressed on the cart page, and **auto-dismisses after 7s**
  (`TIP_TIMEOUT`, same window as the cart tip). A manual ✕ closes it, and opening the
  dialog (FAB or the tip's CTA) closes it too. Rendered only when `tipOpen && !open`.
  Unlike the cart tip, its CTA opens the form directly (the dialog lives in the same
  component) — no store needed.
- **SCSS** — `.tip` sits `fixed bottom-6 right-[5.5rem]` (**beside** the bottom-right
  FAB, to its left) with a right-pointing `.tipArrow`, slide-in keyframe, `.tipClose`,
  `.tipTitle/Text/Cta` — the FAB counterpart of the AppBar cart tip.
- **Copy** — `feedback.tipTitle` ("How's it going?"), `feedback.tipText` (mentions
  feedback **or** support), `feedback.tipCta` ("Tell us"), `feedback.tipDismiss`
  (en + id).
- **Verified:** `typecheck` / `lint` / `build` / `format:check` clean; DOM checks
  confirmed the tip renders beside the FAB (bottom-aligned, ~10px gap) and its CTA
  opens the dialog. The count-growth trigger is a direct copy of the cart tip's
  (AppBar), so the two fire together on add-to-cart. (Live add-to-cart needs a signed-in
  session; the preview pane also won't capture the fixed popover in a screenshot — an
  env rendering quirk — so this was verified via the live DOM + the shared logic.)

## 2026-08-10 — Strip result: feedback prompt card (informational)

Added an **informational card** on the strip result screen (under Share / View in
cart) nudging the user to leave feedback — pointing them at the floating feedback
button. It has **no action of its own**; the form stays exclusively on the FAB.

- **`features/compose/StripResult.tsx`** (+ scss) — a `role="note"` card (`MessageCircle`
  icon + title + text), styled like the existing `.composing` card (`bg-muted/40`,
  bordered). No button/link.
- **Copy** — `result.feedbackTitle` / `result.feedbackText` (en + id); the text refers
  to "the feedback button in the bottom-right corner".
- The brief experiment of lifting the dialog's open-state into a `useFeedbackStore` so
  the card could open the form was **reverted** — per the ask, the card is
  informational and the form lives only on the FAB (`FeedbackFab` keeps its local
  `useState`).
- **Verified:** `typecheck` / `lint` / `build` / `format:check` clean.

## 2026-08-10 — Feedback form: support category drops rating, requires email

Per-category rules on the feedback form: **Support** requests now **omit the star
rating** and **require the email** (so we can actually reply); **Feedback** is
unchanged (optional rating + optional email).

- **`feedbackSchema` (`@/validations`)** — wrapped in a `.superRefine` that adds an
  `feedback.errors.emailRequiredSupport` issue on the `email` path when
  `category === 'support'` and the email is blank. The base optional-but-valid email
  rule still applies to both categories.
- **`FeedbackFab`** — `isSupport = category === 'support'`: the rating block is hidden
  for support; `RhfEmailField` switches to the required label (`feedback.emailLabelRequired`
  → "Email \*") + a support hint and passes `required`. On submit, `rating` is sent
  only for feedback. Switching category re-validates the email (`trigger('email')`)
  **only after a first submit**, so a stale "email required" clears when moving back to
  feedback and reappears on support — without surfacing errors before the user tries.
- **Copy** — added `feedback.emailLabelRequired`, `feedback.emailHintSupport`,
  `feedback.errors.emailRequiredSupport` (en + id).
- **Verified (live, real backend + Postgres):** support tab shows 0 stars + "Email \*"
  + support hint; empty-email support submit → inline "Please enter your email so we
  can reply." (no POST); switching to feedback clears it, back to support restores it;
  a valid support submit stored a row with `category: support`, **`rating: null`**, and
  the email. Feedback tab still 5 stars + optional email. `typecheck` / `lint` /
  `build` / `format:check` clean.

## 2026-08-10 — Feedback form → react-hook-form + centralized fields

Rebuilt the feedback form (added earlier the same day) on the app's standard form
stack — **react-hook-form + zod resolver + the centralized `formFields`** — matching
the auth pages, instead of the initial ad-hoc `useState` + manual validation.

- **Centralized fields extended** — added a **`Textarea`** UI primitive
  (`components/ui/textarea.tsx`, mirroring `Input`) and a presentational
  **`TextareaField`** (`components/formFields/`, mirroring `InputField`: label +
  textarea + error + a11y wiring). `reactHookFormFields.tsx`'s `withReactHookForm`
  HOC is now **generic** over the field's props (`P extends RhfBaseFieldProps`) so it
  wraps inputs and the textarea uniformly; new export **`RhfTextareaField`** (existing
  `RhfInputField`/`RhfEmailField`/`RhfPasswordField` unchanged).
- **Schema centralized** — `feedbackSchema` + `FeedbackValues` in `@/validations`
  (category enum, rating 0–5 int, message required ≤4000, optional email with a loose
  shape check). Messages are **i18n keys** (`feedback.errors.*`), translated by the
  field wrapper — same convention as the auth schemas.
- **`FeedbackFab`** now uses `useForm(zodResolver(feedbackSchema))` + `FormProvider`;
  message via `RhfTextareaField`, email via `RhfEmailField`, `isSubmitting` drives the
  button, `reset()` prefills the email on open, `setFocus('message')` on open. The
  custom category toggle + star rating are driven through RHF (`watch`/`setValue`).
  Validation is now **inline per-field** (the manual "message required" toast is gone).
- **Copy** — `feedback.messageRequired` → a `feedback.errors.{messageRequired,
  messageTooLong,emailInvalid,emailTooLong}` block (en + id). Removed the now-unused
  `.textarea`/`.input` SCSS (the fields bring their own styling); added `.emailGroup`.
- **Verified (live, real backend + Postgres):** empty submit → inline "Please enter a
  message first." on the textarea (`aria-invalid`, **no** network call); a bad email →
  inline "valid email" error; fixing both → `POST /feedback` **201**, dialog closed,
  row persisted (category/rating/message/email/context). `typecheck` / `lint` /
  `build` / `format:check` clean.

## 2026-08-10 — Feedback/support: floating button + form (app-wide)

Added a **floating feedback button** pinned to the right edge, present on every page
(mounted in `RootLayout`, so it shows on the strip result too). Clicking it opens a
form dialog; submissions POST to the backend's new **`/feedback`** API (see
`../momoto-be`). Works signed-in or anonymous.

- **`components/common/FeedbackFab`** (new, + scss) — a round FAB (`MessageCircle`,
  `fixed right-4 top-1/2`) and a portal dialog mirroring `ConfirmDialog`'s a11y
  (Escape / backdrop close, body-scroll lock, focus the message on open). Form: a
  **Feedback / Support** segmented toggle, an **optional 1–5 star** rating (click the
  same star to clear), a required **message** textarea (placeholder swaps per
  category), and an **optional email** (prefilled from `useAuthStore` when signed in).
  Submit → `submitFeedback` → success toast + close + reset; empty message is blocked
  with a toast. Sends `context: location.pathname` for triage.
- **API layer** — `api/services/feedbackService.ts` `submitFeedback`;
  `types/feedbackType.ts` `FeedbackCategory` / `FeedbackInput`; `apiRoutes.ts`
  `FEEDBACK.ROOT`. The axios interceptor attaches the token when present, so the
  server can tie a message to its author (else anonymous).
- **`RootLayout`** renders `<FeedbackFab />` after the footer.
- **Copy** — full `feedback.*` block (open/title/subtitle/tabs/rating/message
  placeholders per category/email/submit/sending/success/error/validation) in en + id.

  _Follow-up (2026-08-10): the form was rebuilt on **react-hook-form + zod + the
  centralized form fields** — see the next entry. The FAB was also moved from the
  right edge (`right-4 top-1/2`) to the **bottom-right corner** (`bottom-6 right-6`)._
- **Verified (live, real backend + Postgres):** FAB renders on the right edge,
  vertically centered; dialog opens with all fields; a submit stored a row
  (`POST /feedback` → 201, row present with category/rating/message/email/context +
  server-captured user agent, `userId` null when anonymous); an empty message → 400;
  the form closed on success. `typecheck` / `lint` / `build` / `format:check` clean.

## 2026-08-09 — Pay-to-print frontend implemented → see PROGRESS-payments.md

Snap checkout in the cart, paid clean-file download, "View in cart" on the result
screen (free download removed; Share stays free). Full details + verification in
`PROGRESS-payments.md`.

## 2026-08-09 — Cart groups by mode (Solo / Date), not per session

The cart grouped by `sessionId`, but every **solo** session gets its own local room
code, so multiple solo sessions showed up as separate "Solo session" groups. Now the
cart buckets strips into at most **two** groups by `sessionMode` — "Solo sessions" and
"Date sessions" — newest strip (and group) first.

- **`pages/CartPage.tsx`** — `groupBySession` → `groupByMode` (keyed on `sessionMode`,
  `__unknown__` fallback); `groupTitle` maps solo/date/unknown to the group label.
- **Copy** — replaced `cart.soloSession` / `cart.dateSession` ("Room {{code}}") with
  `cart.soloGroup` / `cart.dateGroup` (en + id); `unknownSession` kept as the fallback.
- **Verified (live):** 4 seeded strips (2 solo across 2 codes + 2 date across 2 rooms)
  render as exactly two groups — "Date sessions" (2) and "Solo sessions" (2). The
  per-strip `sessionId` is still stored server-side, so a finer grouping stays possible
  later. `typecheck` / `lint` / `format:check` clean.

## 2026-08-09 — Cart is now server-backed (strips persist across reloads + devices)

Follow-up to the cart below. The cart was in-memory, so a reload wiped it. It now
persists via the backend's new **`/strips`** API (see `../momoto-be` PROGRESS), so a
signed-in user's strips survive reloads and follow them across devices — and it's the
groundwork for paid downloads (strips tied to the account, server-controlled render).

- **`api/services/stripsService.ts`** (new) — `listStrips` / `uploadStrip(blob, meta)`
  / `deleteStrip(id)`; resolves the API-relative image `url` against `env.socketUrl`
  so components get a ready cross-origin `<img src>`. `types/stripType.ts` `StoredStrip`;
  `apiRoutes.ts` `STRIPS` group; `utils/dataUrl.ts` `dataUrlToBlob`.
- **`store/useCartStore.ts`** — rewritten from an in-memory list to a **server mirror**:
  `items: StoredStrip[]` + `status`, with `load()` (GET), `addStrip(blob, meta)` (upload
  → prepend), `removeStrip(id)` (DELETE → drop), `clear()` (delete-all → refetch), and a
  local `reset()` for sign-out. The store API stayed close, so callers barely moved.
- **`contexts/AuthProvider.tsx`** — drives the cart from the auth lifecycle: `load()` on
  `authenticated`, `reset()` on `unauthenticated`. So the AppBar badge is populated
  app-wide and a signed-out (or next) user never sees someone else's strips.
- **`features/compose/StripResult.tsx`** — on a successful compose it now **uploads** the
  PNG (`dataUrlToBlob` → `addStrip`) instead of stashing it in memory, guarded by a
  `uploadedResultIdRef` so a recompose / StrictMode remount can't create a duplicate
  server row. Upload failure just toasts (`cart.saveError`); the strip stays
  viewable/downloadable locally.
- **`pages/CartPage.tsx`** — loads from the server on mount with **loading / error+retry /
  empty** states; renders `<img src={strip.url}>`; **download** fetches the cross-origin
  image to a same-origin blob URL first (an `<a download>` won't honor a filename
  cross-origin); remove/clear call the server. Grouping/plurals unchanged, plus an
  `unknownSession` fallback.
- **`usePhotosStore`** keeps `resultId` (now the upload-dedupe key). The old in-memory
  `CartStrip` (frames/config) is gone — the server stores the composed bytes; raw frames
  come back only when server-side clean rendering lands for payment.
- Copy: `cart.*` reworded off "this session" + new `loading`/`loadError`/`retry`/
  `saveError`/`downloadError`/`removeError`/`unknownSession` (en + id).
- **Verified (live, real backend + Postgres):** logged in via the real form → the badge
  loaded the user's strip from the server; **the strip survived a full page reload**
  (the original bug); the cross-origin image rendered via CORS; remove deleted
  server-side and stayed gone after reload; empty state correct. `typecheck` / `lint` /
  `build` / `format:check` all clean.

**Setup:** needs the backend running with the `add_strips` migration applied
(`cd ../momoto-be && npm run db:migrate`). Cart is gated on auth, so it only loads for
signed-in users.

## 2026-08-09 — Cart: every created strip is saved, viewable + downloadable per session

Added a **cart** that collects every strip the user creates. Previously only the
**latest** strip survived ("Retake all" discarded the prior one); now each
**Create strip** adds a persistent entry, browsable at **`/cart`** and downloadable
individually — the groundwork for the planned pay-to-download flow (each cart item
also keeps its source frames + design so a paid download can recompose it clean).

- **`store/useCartStore.ts`** (new) — Zustand singleton `items: CartStrip[]` +
  `addStrip` / `removeStrip` / `clear`. `addStrip` **dedupes by id** so a recompose
  / StrictMode remount can't double-add. `CartStrip` holds the composed (watermarked)
  `dataUrl` for instant preview + download, plus frozen `frames` + `config` for a
  future clean (unwatermarked) recompose, and `sessionId` / `sessionMode` /
  `createdAt`. **In-memory** (survives create→cart→download nav, not a full reload) —
  full-res base64 PNGs blow the ~5 MB localStorage quota after 2–3 strips, so
  cross-reload persistence is a follow-up (IndexedDB, behind the same API).
- **`store/usePhotosStore.ts`** — new `resultId` minted in `confirmSelection` (via new
  `utils/id.ts` `newId`), cleared on `reset` / `startCapture`. It's the cart dedupe
  key so one creation → one cart entry.
- **`features/compose/StripResult.tsx`** — on a successful compose, adds the strip to
  the cart (guarded by the resultId dedupe) with a "added to cart" toast, and reads
  `roomId` (`useParams`) + `mode` (`useSearchParams`) for the session tag. Now uses
  the extracted **`utils/download.ts`** `downloadDataUrl` (was a local copy).
- **`pages/CartPage.tsx`** (+ scss) at **`/cart`** (behind `ProtectedRoute`, like the
  booth) — strips **grouped by session**, newest-first within and across groups
  (solo → "Solo session", date → "Room <code>"). Each card: composed preview +
  **Download** + **Remove**; plus **Clear all** and an empty state → the photobooth.
  i18n plurals via `_one`/`_other` (i18next v26).
- **`components/layout/AppBar`** — a cart icon (`ShoppingBag`) with a live count badge,
  next to the user menu; `constants/routes.ts` `cart` + route in `app/App.tsx`.
- **Copy** — `nav.cart` + a full `cart.*` block (title/subtitle plurals/empty/session
  labels/strip count/download/remove/added) in **en + id**.
- **Verified (live, dev server):** seeded 3 strips across 2 sessions via the store →
  `/cart` groups them correctly (Solo 1 / Room ABCD 2), newest-first, right plurals;
  the AppBar badge tracked 3→2 on remove; re-adding a duplicate id was ignored;
  per-strip download fired without error; the route redirects to login when signed
  out. `typecheck` / `lint` / `build` / `format:check` all clean.

**Next (payment):** the cart is the natural checkout surface — gate a clean
(`watermark: false`) recompose of `frames`+`config` behind payment, keeping the
watermarked preview for free. Persist the cart to **IndexedDB** so it survives reloads.

## 2026-08-09 — Watermark on the composed strip (groundwork for paid downloads)

The finished strip now carries a **tiled diagonal "Momoto" watermark**, baked into
the composed image so it flows through to both the **download** and the **share
card** (which wraps the same strip). This is the visible groundwork for a planned
pay-to-download flow: a free strip is always marked; a future paid download composes
a clean one.

- **`utils/composeStrip.ts`** — new `drawWatermark()` helper tiles the wordmark
  diagonally (−30°), clipped to the photo-grid rect, with a translucent white fill
  **+** dark stroke so it stays legible over both light and dark photos. Drawn
  **last** (over photos *and* stickers) so it can't be hidden under a sticker or
  cropped out. New `ComposeOptions` fields: `watermark?: boolean` (defaults `true`)
  and `watermarkText?: string` (defaults the brand mark). Brick-offset alternate
  rows; tile reach covers the rotated bounding box.
- **`constants/strips.ts`** — `STRIP_WATERMARK = 'Momoto'` (default wordmark).
- **`features/compose/StripResult.tsx`** — passes `watermark: true` +
  `watermarkText: brand` to `composeStrip`; a comment marks the seam where the
  future paid download will pass `watermark: false`. Added `brand` to the compose
  effect deps.
- **Not shown during arrange** — the arrange step (`StripSelector`) renders slots
  directly, not via `composeStrip`, so the watermark only appears on the final
  created strip (correct: it marks the deliverable, not the editing surface).
- **Verified:** ran the real `drawWatermark` geometry in a browser over sample
  light/dark frames — the tiled mark is legible everywhere and clipped to the grid
  (footer stays clean). `typecheck` / `lint` / `build` / `format:check` all clean.

**Next (payment):** gate `watermark` on a paid flag — free preview stays marked,
paid download composes with `watermark: false` for a clean strip.

## 2026-07-23 — Auth follow-ups: logout confirm, session-expired toast, socket re-auth

Refinements to the accounts feature from the same day.

- **Logout confirmation everywhere.** New shared `hooks/useLogout.tsx` (confirm
  state + logout + a `ConfirmDialog`), used by the AppBar `UserMenu` and the
  ProfilePage sign-out. Copy is context-aware: in a room it warns you'll leave the
  live session; elsewhere it's generic. `RoomPage.shouldConfirmLeave` gained an
  `isAuthenticated` guard so the room's own leave-blocker stands down once auth
  clears (no double dialog). Copy `auth.logoutConfirm.*` (en + id).
- **Socket handshake re-auth.** The socket only verifies the token at handshake, so
  a reconnect after the access token expired would fail (`connect_error:
  unauthorized`) — the HTTP silent-refresh didn't cover it. `axiosClient` now
  exports `refreshAccessToken` + `notifySessionExpired`; `useRoom`'s connect-error
  handler refreshes once and reconnects with the fresh token, falling back to the
  session-expired flow only if the refresh fails. Bounded by `refreshing`/`retried`
  refs (reset on connect) so it can't loop.
- **Token storage** kept in **localStorage** (briefly explored sessionStorage, then
  reverted) but centralized behind `getStoredToken`/`setStoredToken`/
  `clearStoredToken` in `constants/auth.ts` (was scattered raw across 4 files).
- **Access-token TTL raised to 1 hour** (backend) — expiry is transparently
  refreshed anyway, so this just cuts refresh churn; see `../momoto-be`.
- **Verified:** expiry→refresh→retry proven for both HTTP (interceptor) and the
  socket handshake against a live short-TTL backend. `typecheck`/`lint`/`build`/
  `format:check` clean.

## 2026-07-23 — User accounts: login/register/profile + partner linking (activities gated)

Momoto now has **real accounts**. Activities require sign-in — `/activities`,
`/photobooth`, `/room/:roomId`, `/profile` are behind a guard; `/`, `/terms`,
`/privacy`, `/login`, `/register` stay public. Backend work is in `../momoto-be`
(see its PROGRESS). The FE plumbing was already half-there (axios read `auth_token`
+ had `setAuthHandlers`), so much of this filled existing slots.

- **API layer:** `constants/auth.ts` (`AUTH_TOKEN_KEY`, replacing two raw
  `'auth_token'` strings in `axiosClient`); `types/authType.ts`; `AUTH` + `PARTNER`
  groups in `apiRoutes.ts`; `services/authService.ts` (register/login/google/getMe/
  updateProfile/logout) + `services/partnerService.ts`; `errorMessages.ts` entries.
- **`axiosClient.ts`:** `withCredentials: true`; on a 401 it now attempts **one
  silent `POST /auth/refresh`** (deduped) and replays the request, only firing
  `onSessionExpired` if the refresh also fails; surfaces the backend `{ error }`
  code as `ApiError.code`.
- **State + bootstrap:** `store/useAuthStore.ts` (`loading`/`authenticated`/
  `unauthenticated`, user cached; token stays in localStorage). New
  `contexts/AuthProvider.tsx` (in `AppProviders`) registers `setAuthHandlers` and
  hydrates via `getMe()` on load. `AppProviders` also wraps `GoogleOAuthProvider`
  (only when `VITE_GOOGLE_CLIENT_ID` is set).
- **Routing/UI:** `components/auth/ProtectedRoute.tsx` (spinner while loading →
  redirect to `/login?redirect=…` when signed out); `pages/LoginPage`,
  `RegisterPage`, `ProfilePage` (+ shared `authForms.module.scss`); `GoogleButton`
  (Google Identity → `loginWithGoogle`); `PartnerSection` (invite code / accept /
  unlink); `AppBar` gains a `UserMenu` (Login button ↔ avatar dropdown → Profile /
  Logout). Socket handshake now sends the token (`utils/socket.ts` `auth` callback).
- **Env:** `env.googleClientId` (`VITE_GOOGLE_CLIENT_ID`) + `vite-env.d.ts`.
- **Copy/legal (§ required):** gating activities reverses the old "no accounts / no
  sign-up" promise — updated the landing FAQ `install` answer, added an **Accounts**
  section to both Privacy & Terms, and revised `privacy.collect` / `terms.eligibility`
  to describe stored account data. Full `auth.*` copy (login/register/profile/partner/
  errors) in **en + id**.
- New deps: `@react-oauth/google`. `typecheck` / `lint` / `build` / `format:check`
  all clean. **Setup:** run the backend's `prisma migrate dev`, set `JWT_SECRET`
  (and optionally `GOOGLE_CLIENT_ID` both ends) — see `../momoto-be/.env.example`.

## 2026-07-23 — "How it works" is now per-activity (tabbed)

The landing "How it works" section only described the **photobooth** flow (pick /
pose / share). It now carries a 3-step how-to for **every** activity, switchable via
a pill tab bar so the coming-soon activities are teased too.

- **`pages/LandingPage.tsx`** — `STEPS` (a flat photobooth-only array) became
  `ACTIVITY_STEPS: Record<activityKey, Step[]>`, keyed by the `ACTIVITIES` `key` so
  tabs and steps stay in sync. Icons per step: photobooth (Hand/Camera/Share2),
  draw (Lightbulb/Brush/Download), lovematch (DoorOpen/MessageCircleQuestion/Heart),
  spot (Images/Search/Trophy). A `useState(ACTIVITIES[0].key)` drives a
  `role="tablist"` pill row (tab labels reuse `activities.items.<key>.title`); the
  step grid renders the selected activity's steps from
  `landing.steps.<activity>.<step>.{title,desc}`.
- **`LandingPage.module.scss`** — new `.howTabs` / `.howTab` / `.howTabActive`
  (rounded pill segmented control, active = primary fill).
- **Copy** — `landing.step` (flat) replaced by `landing.steps.<activity>.<step>`
  covering all 4 activities, in both en + id.
- **Drive-by fix:** the **id** `activities.items` was stale (`prints/games/rooms/
  gifbooth/quiz` — keys no longer in `ACTIVITIES`), so id activity titles/descs
  (and now the new tab labels) fell back to raw keys. Replaced with the real set
  (photobooth/draw/lovematch/spot) mirroring en.
- `typecheck` / `lint` / `build` / `format:check` all clean.

## 2026-07-22 — Privacy Policy page (`/privacy`, getangie-style)

Added a static **Privacy Policy** page, twin of the Terms page below, modeled on
`getangie.com/privacy` but adapted to Momoto's privacy-by-default reality — **no
accounts, no payments, photos made in-browser and never uploaded, Date-session
video relayed peer-to-peer and never recorded**. getangie's AI-processing and
Payments sections were dropped (neither exists in Momoto).

- **`pages/PrivacyPage.tsx`** (+ `.module.scss`, identical layout to TermsPage):
  title, "last updated", intro, then 9 numbered sections rendered data-driven from
  a `SECTION_KEYS` array; each body is a paragraph array via
  `t(..., { returnObjects: true })`. Sections: Information We Collect · Photos,
  Video & Audio · Cookies & Local Storage · How We Use Information · Who We Share
  Data With · Data Retention & Deletion · Children · Changes · Contact.
- **Routing**: `ROUTES.privacy = '/privacy'` + route in `app/App.tsx`.
- **Footer**: the Privacy Policy nav item (`nav.policy`) previously pointed at
  `ROUTES.home` (placeholder) — now links to `ROUTES.privacy`. Both footer legal
  links (`nav.policy` → `/privacy`, `nav.tnc` → `/terms`) now resolve to real pages.
- Copy under `privacy.*` (title / lastUpdated / intro / 9 `sections.<key>.{title,body}`)
  in both en + id. The media/sharing sections accurately describe the WebRTC
  peer-to-peer model (signaling + optional TURN relay, no recording).
- `typecheck` / `lint` / `build` / `format:check` all clean.

## 2026-07-22 — Terms & Conditions page (`/terms`, getangie-style)

Added a static **Terms & Conditions** page, modeled on the structure of
`getangie.com/terms` but adapted to what Momoto actually is — a **free,
browser-based** photobooth for long-distance couples with **no accounts, no
payments, and photos that never leave the device**. So getangie's premium /
purchase / refund / print-order / subscription sections were intentionally
dropped (inventing pricing that doesn't exist would be misleading); the
remaining sections keep getangie's shape and voice.

- **`pages/TermsPage.tsx`** (+ `.module.scss`): a `max-w-3xl` legal page — title,
  "last updated" line, intro, then 8 numbered sections rendered data-driven from
  a `SECTION_KEYS` array (mirrors the landing FAQ pattern). Each section's body is
  an array of paragraphs read via `t(..., { returnObjects: true })`. Sections:
  The Service · Eligibility & Access · Your Content & Photos · Acceptable Use ·
  Availability & Changes · Limitation of Liability · Governing Law (Indonesia) ·
  Contact.
- **Routing**: `ROUTES.terms = '/terms'` (`constants/routes.ts`) + route in
  `app/App.tsx`.
- **Footer**: the T&C nav item (`nav.tnc`) previously pointed at `ROUTES.activities`
  as a placeholder — now links to `ROUTES.terms`. (The `nav.policy` → home item is
  left as-is; a real Privacy Policy page is a separate follow-up.)
- Copy under `terms.*` (title / lastUpdated / intro / 8 `sections.<key>.{title,body}`)
  in both en + id. The Content section documents the peer-to-peer nature of a Date
  session (video relayed, never recorded), matching the privacy FAQ.
- `typecheck` / `lint` / `build` / `format:check` all clean.

## 2026-07-21 — Fix: booth is exited *immediately* at 0:00 (server-pushed expiry)

Bug: when the session timer reached 0:00, users weren't kicked out of the booth right
away. The end was driven purely by the local 1s `setInterval` tick in `useSessionTimer`,
so it lagged up to ~1s, drifted with the clock-offset estimate, and stalled for up to a
minute if the tab was backgrounded (browsers throttle `setInterval` there).

- The backend now **pushes** a `session:expired` event to both present members the instant
  the window elapses (see `../momoto-be` PROGRESS), instead of leaving each client to
  notice on its own.
- `types/events.ts` — mirror `session:expired`.
- `store/useSessionStore.ts` — new `end()` action forces `{ secondsLeft: 0, ended: true }`.
- `hooks/useSessionTimer.ts` — the date-mode effect listens for `session:expired` → `end()`,
  so the terminal screen renders at once (RoomPage unmounts `CameraStage`, tearing down
  camera + peer). The local countdown stays as a fallback if the event is missed. Solo mode
  (offline, no server) keeps its purely local tick.
- **`pages/RoomPage.tsx` — the real "must reload first" cause.** The terminal "Time's up" /
  "room closed" screens were gated on `!resultShowing`, so a user viewing a *created* strip
  saw nothing at 0:00 — the room only revealed itself as closed after a reload (which drops
  the in-memory `selection` and gets the rejoin refused). Now `keepResult = mode === 'solo'
  && resultShowing`: a **date** room's shared, server-authoritative window closes everyone
  out immediately even mid-result (download before 0:00), while **solo** keeps the finished
  strip viewable past 0:00 as before. Applied to the time's-up gate, the room-closed gate,
  and `shouldConfirmLeave`.
- `typecheck` / `lint` / `build` all clean; e2e (two peers, 1.5s window) both got the
  `session:expired` push within 2 ms of `endsAt`.

**Trade-off:** in a date room the finished strip is no longer downloadable *after* 0:00 (it
is up to 0:00). If you want it back, add a Download button to the "room closed" screen when
a `selection` exists — say the word.

## 2026-07-21 — Ephemeral TURN credentials (backend-minted, fetched at runtime)

Hardened the TURN setup from the previous entry: instead of shipping a **static** TURN
credential in the public bundle, the FE now fetches **short-lived** credentials from the
backend just before each peer connection. The TURN shared secret never leaves the server.

**Backend (`../momoto-be`):**
- `src/turn/turnCredentials.ts` — mints coturn "TURN REST API" (`use-auth-secret`) creds:
  `username = <unix-expiry>:momoto`, `credential = base64(HMAC-SHA1(secret, username))`
  via Node's built-in `crypto` (no new dep). STUN always included; TURN added only when
  `TURN_URLS` + `TURN_STATIC_AUTH_SECRET` are set.
- `src/http/routes/turn.ts` — `GET /turn-credentials` → `{ iceServers, ttl }`, per-IP
  rate-limited (60/min → `429`), sweep wired into the periodic GC in `src/index.ts`.
- `src/config/env.ts` — `STUN_URLS` / `TURN_URLS` / `TURN_STATIC_AUTH_SECRET` /
  `TURN_CREDENTIAL_TTL_SECONDS` (default 3600). `.env.example` + README documented.

**Frontend (`momoto`):**
- `api/apiRoutes.ts` `TURN.CREDENTIALS`, `types/turnType.ts` `IceServersResponse`,
  `api/services/turnService.ts` `fetchIceServers()`, `errorMessages.ts` entry.
- `hooks/usePeerConnection.ts` — the effect now `resolveIceServers()` (backend fetch →
  fallback to build-time `env.iceServers` on any failure) **before** creating the `Peer`;
  Peer construction moved into the async step. `maybeCall` guards a not-yet-created peer
  and is re-run after open + after peer creation (an announce may arrive mid-fetch).
  Cleanup uses a `cancelled` flag + `peer?.destroy()`.

**Verified:** BE unit — recomputed HMAC matches `buildIceServers()` output; live
`GET /turn-credentials` returns STUN + a TURN entry with a valid credential. FE + BE
`typecheck` / `lint` / `build` / `format:check` all clean.

## 2026-07-21 — WebRTC now uses configurable STUN/TURN ICE servers

Closed the launch-blocking gap: the PeerJS media connection was created with **no
`iceServers`**, so it fell back to PeerJS defaults (Google STUN, **no TURN**) — meaning
peers behind symmetric/corporate/mobile NAT (~15–20% of real users) could never connect
video. ICE servers are now env-configurable and always applied.

- `env.ts` — new `iceServers: RTCIceServer[]` built by `buildIceServers()`. STUN defaults
  to Google (`VITE_STUN_URLS` to override, comma-separated). **TURN is opt-in**: enabled
  only when all three of `VITE_TURN_URLS` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL`
  are set. Comment flags that `VITE_*` is inlined into the public bundle → prefer
  server-minted ephemeral TURN credentials in production.
- `usePeerConnection.ts` — `peerOptions()` now always sets `config: { iceServers }`, so
  ICE applies whether the broker is self-hosted (host/port/path/secure) **or** the public
  PeerJS cloud (no host).
- `vite-env.d.ts` — typed the 4 new `VITE_*` vars (strict `ImportMetaEnv`, no index sig).
- `.env.example` — documented STUN/TURN vars (placeholder `turn.example.com` + redacted
  credential). Deployment guide (`../DEPLOYMENT.md`) updated to reflect the closed gap.
- `typecheck` / `lint` / `build` / `format:check` all clean.

## 2026-07-21 — HTTP calls go through a shared AxiosClient (was raw `fetch`)

Introduced a proper API layer under `src/api/`, modeled on the `photobooth-online/api`
reference, replacing the ad-hoc `fetch` calls in `utils/rooms.ts`. All HTTP now flows
through one client with consistent error normalization.

- **`api/client/axiosClient.ts`** — a class wrapping an axios instance with
  `getData`/`postData`/`putData`/`patchData`/`deleteData` helpers. Request interceptor
  attaches a `Bearer` token if one is ever stored (none today — kept for a future
  authed endpoint). Response interceptors normalize **every** failure — a `{ success:
  false }` envelope, a non-2xx (e.g. the backend's `429`), or a network fault — into a
  single `ApiError`. `baseURL` is `env.socketUrl` (the room HTTP endpoints are served
  on the same host as Socket.io). New `axios` dependency.
- **`api/apiError.ts`** — `ApiError` (code / status / errorType / userMessage) +
  `getApiErrorDetails`. **`api/apiRoutes.ts`** — `ROOMS.CREATE` + `ROOMS.BY_ID` (with
  the `route()`/`.pattern` helper). **`api/errorMessages.ts`** — endpoint-specific
  friendly `userMessage` fallbacks (route-pattern matched). **`types/roomsType.ts`** —
  `RoomStatus` + response shapes.
- **`api/services/roomsService.ts`** — `mintRoomCode()` (`POST /rooms`) and
  `lookupRoomStatus()` (`GET /rooms/:id`), each validating the response body.
- **`utils/rooms.ts`** now delegates `requestRoomCode`/`lookupRoom` to the service and
  re-exports `RoomStatus` — its public API and throw-on-failure contract are unchanged,
  so `PhotoboothPage` needed no edit. `localRoomCode` (solo) still local.
- `typecheck` / `lint` / `build` / `format:check` all clean.

## 2026-07-05 — Hand-typed URL to a nonexistent room now shows "Room not found"

The join *form* was validated, but navigating straight to `/room/adad` still went through
the socket `room:join`, which (on the old backend) created a room for any code — dropping
the visitor into a lonely one-member room. The backend now refuses unknown codes with a
new `room:not-found` event; the FE surfaces it:

- `types/events.ts` — mirror `room:not-found`.
- `store/useRoomStore.ts` — `roomMissing` flag (+ setter, initial/reset).
- `hooks/useRoom.ts` — listen for `room:not-found` → `setRoomMissing(true)`.
- `pages/RoomPage.tsx` — `roomMissing` renders a terminal "Room not found" screen (Back
  home) and suppresses the leave-confirm. i18n `room.notFoundTitle/Message` (en + id).
- Backstops all entry paths (form, shared code, hand-typed URL). Host-refresh of an empty
  lobby still resumes (backend re-reserves the emptied room rather than deleting it).
- `typecheck` / `lint` / `build` / `format:check` all clean.

## 2026-07-05 — Join form validates the code (typo / nonexistent → clear error)

Previously the join form only checked length ≥ 4 then navigated; the backend's
`room:join` creates a room for any unknown code, so a **typo** dropped the guest in as
the host of a brand-new empty room, waiting forever. Now the form validates before
entering:

- `pages/PhotoboothPage.tsx` — `joinRoom` is async: a client-side format guard
  (`^[A-Z0-9]{4,12}$` → `codeInvalid`), then a `lookupRoom()` pre-join check. Maps
  `not_found` / `full` / `ended` / server-unreachable to specific messages and only
  navigates on `open`. Buttons/input disabled while checking (`joining`).
- `utils/rooms.ts` — `lookupRoom(code)` hits the backend's new `GET /rooms/:id`
  (`{ status }`); throws if the server is unreachable.
- i18n — added `codeInvalid`, `joining`, `join_not_found`, `join_full`, `join_ended`,
  `joinCheckFailed` (en + id); removed the now-unused `codeTooShort`.
- The socket join still backstops `room:full` / `room:ended` post-navigation.
- `typecheck` / `lint` / `build` / `format:check` all clean.

## 2026-07-05 — Joining a date room now needs a reachable server (no fake local host)

Twin of the create-side fix. `useRoom`'s `connect_error` handler used to call
`setHost(true)`, so entering a date room by code while the server was **down** silently
dropped the user into the room as a local "host" — a dead room where no peer can join
and nothing syncs. (Solo never connects, so this only ever affected date mode.)

- `hooks/useRoom.ts` — `onConnectError` now only sets status `'error'`; it no longer
  fakes a host. Socket.io keeps retrying, so a transient outage still recovers on its own.
- `pages/RoomPage.tsx` — reads `status`; a date-mode `'error'` renders a terminal
  "Can't reach the server" screen (with Back home) instead of an infinite "Connecting…"
  spinner, and suppresses the leave-confirm there. New i18n keys
  `room.connectFailedTitle` / `room.connectFailedMessage` (en + id).
- `typecheck` / `lint` / `build` / `format:check` all clean.

## 2026-07-05 — Date-room creation now requires a reachable backend (no local fallback)

Fixed a robustness gap: if the socket server was down, `requestRoomCode()` silently fell
back to a **local** code, so "Date" mode would create a room that **no guest could ever
join** (no server = no `room:join`, no sync). Solo mode is unaffected — it's offline by
design.

- `utils/rooms.ts` — `requestRoomCode()` no longer catches/falls back; it **throws** if
  the mint fails (server unreachable, non-2xx incl. the backend's `429`, or an invalid
  code). A successful mint doubles as a reachability check. `localRoomCode()` is now
  solo-only.
- `PhotoboothPage.tsx` — `createRoom('date')` wraps the mint in try/catch: on failure it
  shows an error and **stays on the page** (re-enabling the button) instead of navigating
  into a dead room. New i18n key `photobooth.createFailed` (en + id).
- `typecheck` / `lint` / `build` / `format:check` all clean.

## 2026-07-05 — Removed the dev mock server (real backend is now the drop-in)

The local Socket.io **mock server** (`server/mock-server.js`) is gone. The production
backend in `../momoto-be` is now a verified drop-in replacement — full wire-contract
parity (every event this FE emits/listens for) plus an end-to-end parity run against the
real server, so the mock is redundant.

- Deleted `server/mock-server.js` (and the now-empty `server/` dir).
- Removed the `dev:server` npm script and the `socket.io` (server) **devDependency** —
  it was used only by the mock; the app itself uses `socket.io-client`. Lockfile synced.
- README: local dev now runs the app (`npm run dev`) alongside the backend
  (`cd ../momoto-be && npm run dev` on :3001); dropped the mock from Scripts and Known
  limitations. `VITE_SOCKET_URL` still defaults to `http://localhost:3001`, so no code
  change was needed.
- `typecheck` / `lint` / `build` / `format:check` all clean.

> Historical entries below still mention `npm run dev:server`; those are a record of past
> work and are left as-is. A stale `Bash(npm run dev:server …)` allow-entry may remain in
> `.claude/settings.local.json` — harmless, remove at leisure.

## 2026-07-05 — Single-shot retake now syncs the guest back to the camera page

Follow-up to the arrange-step camera split: a **host's per-shot retake** used to run
purely locally (`usePhotosStore.startRetake`), so the guest stayed stuck on the
arrange page while the host re-shot. Now a single-slot retake is broadcast like the
full session, so **both** peers drop back to the camera session page and re-capture
their own frame for that slot together.

- New events `session:retake` (host → server, `{ slot }`) + `session:retake-start`
  (server → both, `{ slot, startAt }`), mirroring `session:start`/`countdown-start`.
  The mock server broadcasts a shared `startAt` (`START_DELAY_MS` buffer) so the two
  retake countdowns line up; a non-numeric slot is ignored. **Restart
  `npm run dev:server`** — the mock server gained the `session:retake` handler.
- `useCountdownSync` gained `retakeShot(slot)`: in a live room it emits
  `session:retake` (the server echoes `retake-start` to both, self included); solo mode
  runs `startRetake(slot)` locally. It also listens for `retake-start` and schedules
  `startRetake(slot)` at the offset-adjusted instant — **guarded** so it won't yank a
  peer who already finalized their strip (`selection.length > 0`) out of their result.
- `StripSelector` takes a new `onRetakeShot` prop (used by the per-slot retake button)
  instead of calling the store directly; `CameraStage` passes `retakeShot`.

**Verified:** integration test against the real mock server — host emits
`session:retake {slot:2}` → **both** host and guest receive `retake-start` with the
**same** `startAt`; a malformed slot is ignored. `tsc`, `eslint`, `prettier --check`,
`vite build`, and `node --check server/mock-server.js` all clean.

## 2026-07-05 — Camera stays live during the arrange step (talk while you decorate)

Per user: keep the booth camera enabled **after** the capture sequence so the two
participants can keep talking (and coordinate) while they pick the filter and place
stickers — instead of the camera disappearing the moment shooting ends.

- **`CameraStage`**: the review/arrange branch no longer renders `StripSelector`
  alone. It now renders a **two-column layout** — the live camera on the **left**
  (stacked in a single **column**, `arrangeVideos`), with `MediaControls` under it,
  and the strip/filters/stickers panel (`StripSelector`) on the **right**. Columns
  stack (camera on top) below `lg` and split side-by-side from `lg` up; the camera
  rail is `lg:sticky` so it stays in view while the arrange panel scrolls.
- **Single-shot retake stays on the camera session page.** The arrange branch matches
  `!isCapturing && reviewing && frames.length >= SHOT_COUNT`, so a per-shot retake
  (which flips `isCapturing` + sets `retakeSlot`) drops out of the split layout and
  back to the **full camera session page** — the 3-2-1 countdown + "Retaking photo N…"
  hint — then returns to the arrange page when the shot lands. The hidden capture
  `canvas` is rendered in the arrange branch so the refs stay warm across the round-trip.
- The result screen (`selection.length > 0`) is unchanged — still final, no camera.
- New styles in `CameraStage.module.scss`: `.arrange`, `.arrangeCamera`,
  `.arrangeVideos`, `.arrangePanel` (all `@apply`, per the styling convention).

**Verified:** `tsc --noEmit`, `eslint`, `prettier --check`, `vite build` all clean.
Live two-camera framing is best confirmed via `npm run dev` + `npm run dev:server`
with a real webcam.

## 2026-07-04 — Fix: hide host "Retake all" once the guest finalized their strip

Regression from the `session:reset` sync: the host's **Retake all** broadcasts a
reset, so if the guest had already **created** their strip, the host retaking
yanked the guest out of their finished result. Now the host can't do that once the
guest has committed.

- New `strip:created` event. `useStripSync` emits it when the local `selection`
  becomes non-empty (a strip was created) and, on receiving it, sets
  `useRoomStore.peerCreated`. Server relays it to the other member only.
- `StripSelector`: **Retake all** now gated by `canRetakeAll = canEdit &&
  !peerCreated` (hidden once the peer finalized). Per-shot retakes are untouched —
  they only re-shoot the host's own slot and don't reset the guest.
- `peerCreated` is cleared when it's no longer valid: on a fresh capture
  (`countdown-start`), on `session:reset`, and when the peer leaves (`room:peer-left`).

**Verified:** integration test against the real server — guest emits `strip:created`
→ host receives it (no self-echo). `tsc`, `eslint`, `prettier`, `vite build`,
`node --check` all clean.

**Reminder:** restart `npm run dev:server` — the mock server gained a `strip:created`
relay.

## 2026-07-04 — Session clock now runs at room level (ticks in the lobby too)

Closed the lobby gap: previously `useSessionTimer` lived in `CameraStage`, so when a
peer left and the host dropped back to "waiting for a friend" the clock stopped
ticking — a room could outlive its 3-minute window until someone re-entered the
booth.

- `useSessionTimer(active)` moved to `RoomPage`, so its 1s tick runs for the whole
  room lifetime (lobby included; the tick is a no-op until a session has started).
- Split "resume/tick" from "fresh start": it always resumes a persisted `endsAt` and
  ticks continuously, but only **starts** the 3 minutes once `active` — `mode ===
  'solo' || peerId !== null` (both present) — so the initial wait for a friend
  doesn't burn the session. Once started/resumed it runs to 0 regardless of `active`
  (a peer leaving no longer pauses or restarts it).
- Removed the `useSessionTimer()` call + import from `CameraStage`.

Net effect: a session that expires while the host waits alone in the lobby now flips
to "Time's up" there (the ended-before-lobby ordering handles the render) and emits
`session:end`, retiring the room code — instead of lingering active.

**Verified:** `tsc`, `eslint`, `prettier --check`, `vite build` all clean.

## 2026-07-04 — Fix: rejoining before expiry resumes the persisted time

Bug: leaving a room before the timer expired and rejoining the same code restarted
the full 3 minutes. Cause: `RoomPage.leaveRoom` (called on Leave / Back home /
confirm-leave) ran `clearSession(roomId)`, wiping the persisted `endsAt` — so the
next mount found nothing and started fresh.

- Removed `leaveRoom`/`clearSession` on leave. The per-room `endsAt` now survives an
  explicit leave, so `useSessionTimer` resumes the **remaining** time on rejoin (the
  end time is an absolute timestamp, so time spent away still counts down). This was
  only safe to drop because expired rooms are now refused **server-side**
  (`endedRooms` + `session:end`), so there's no local state that needs clearing to
  "close" a room.
- Dropped the `clearSession` import and the buttons' `onClick={leaveRoom}` (they were
  the only callers); `clearSession` stays in `sessionPersistence.ts` as an unused
  util. Browser back-entry replace-navigation is unchanged.

**Verified:** `tsc`, `eslint`, `prettier --check`, `vite build` all clean.

## 2026-07-04 — Fix: "Retake all" now sends the guest back to the booth too

Bug: the host's **Retake all** on the arrange screen only called `reset()` locally,
so the guest stayed stuck on the arrange screen (its `reviewing`/frames untouched)
instead of returning to the pre-capture booth with the host.

- New `session:reset` event. `useCountdownSync` exposes `retakeAll()` — resets
  locally and, in a live room, emits `session:reset`; it also listens for the event
  and calls `usePhotosStore.reset()` on the guest. `CameraStage` uses `retakeAll`
  for both the `StripSelector` ("Retake all") and the `StripResult` error-fallback
  retake. Server relays `session:reset` to the other member (`socket.to(room)`), so
  the host doesn't echo itself. Solo mode (no server) just resets locally.
- After the synced reset both sit at the ready booth; the host's next **Start
  Session** runs the countdown for both as usual.

**Verified:** integration test against the real server — host emits `session:reset`
→ guest receives it, host gets no echo. `tsc`, `eslint`, `prettier`, `vite build`,
`node --check` all clean.

**Reminder:** restart `npm run dev:server` — the mock server gained a `session:reset`
relay.

## 2026-07-04 — Stickers now sync live to the guest

Closed the deferred follow-up: stickers were host-only and not synced, so a guest
never saw them. Folded stickers into the existing host-synced `strip:arrange`
event (alongside order + filter).

- `StripArrangePayload` gained `stickers: PlacedSticker[]`. `useStripStore` gained
  `setStickers` (guest replaces its whole set). Positions are strip-relative
  fractions, so the host's stickers map straight onto the guest's own frames.
- `useStripSync`: host now broadcasts `{ order, filter, stickers }` and re-emits
  whenever `stickers` change — including live drag/resize/rotate — so the guest's
  preview updates in real time; on peer-join the re-broadcast catches a late guest
  up. Guest's `onArrange` applies `setStickers(payload.stickers ?? [])`.
- No server change — the mock server already relays the whole `strip:arrange`
  payload verbatim.

**Verified:** integration test against the real server — host emits `strip:arrange`
with a sticker (x/size/rotation) → guest receives it intact. `tsc`, `eslint`,
`prettier`, `vite build` all clean.

## 2026-07-04 — Fix: expired room follow-ups (peer kick + lobby after end)

Two follow-ups to the expired-room fix:
- **"Time's up" now wins over the lobby.** `RoomPage.renderBody` checked
  `isHost && date && peerId === null` (→ lobby) *before* the `ended` check, so a
  member left alone at expiry (e.g. the other person left) saw "waiting for a
  friend" instead of the ended screen. Reordered: ended → lobby → booth.
- **Peer is kicked when the room ends.** The mock server's `session:end` now also
  `socket.to(room).emit('room:ended')`, so the *other* member drops straight to the
  "room closed" screen (not the lobby) while the sender keeps their own end/result
  view. Client gates the closed screen with `!resultShowing`, so a peer viewing a
  finished strip isn't cut off; `shouldConfirmLeave` treats `(ended || roomEnded) &&
  !resultShowing` as terminal.

**Note:** `endedRooms` is in-memory on the dev mock server, so after these server
changes you must **restart `npm run dev:server`** — a stale server process won't
have the `session:end`/refuse logic, which looks like "the expired code still works".

**Verified:** integration test against the real server — A ends session → in-room
peer B receives `room:ended`, and a fresh client C joining the code is refused
(`ended`). `tsc`, `eslint`, `prettier`, `vite build`, `node --check` all clean.

## 2026-07-04 — Fix: expired room codes can no longer be rejoined

Bug: after the master's session expired ("Time's up" → Back home), pasting the same
room code let a guest join a fresh 180s session. Root cause: the session timer is
purely client-side (per-room `endsAt` in localStorage), so a different browser (no
entry) always started fresh — the **server had no idea the room's session ended**.

Made the server authoritative about a room's end-of-life:
- **Mock server**: an `endedRooms` set. New `session:end` handler adds the room;
  `room:join` now refuses a `endedRooms` room with a `room:ended` event (before the
  full/size checks).
- **Client emits** `session:end` (RoomPage effect) the moment the local timed
  session `ended` in a connected **date** room — so the room is retired at 0:00,
  even before the master clicks Back home. (Solo mode has no server → skipped.)
- **Join side**: `useRoom` handles `room:ended` → `useRoomStore.roomEnded`; RoomPage
  renders a terminal **"This room has closed"** screen (like room-full) and excludes
  it from the leave-confirm blocker. New events `session:end` / `room:ended` in the
  typed contract; copy `room.roomClosed{Title,Message}` (en + id).

**Verified:** integration test against the real mock server — master joins →
`session:end` → a second client joining the same code gets **`room:ended`**, while a
different code still `joined`. `tsc`, `eslint`, `prettier`, `vite build`, and
`node --check server/mock-server.js` all clean.

## 2026-07-04 — Fix: session timer now ends on the arrange step too

Bug: when the 3-minute timer expired while the user was on the **arrange** screen,
"Time's up" never fired — the session kept going. Cause: `RoomPage.resultShowing`
was `!isCapturing && frames.length >= SHOT_COUNT`, which is **true during arrange**
(4 shots captured, not capturing), so `ended && !resultShowing` could never be true
once shooting finished. The "keep the finished strip viewable" exception was
swallowing the whole review step.

- `resultShowing` now means the actual finished, downloadable strip is on screen:
  `selection.length > 0` (set only by **Create strip**). So setup, capture, and
  arrange are all subject to the timer — time's up ends the session (unmounts the
  booth) — while a *created* strip still stays viewable/downloadable past 0:00.
- Dropped the now-unused `frames` / `isCapturing` reads and the `SHOT_COUNT` import
  from `RoomPage`. The timer itself (`useSessionTimer`, mounted in `CameraStage`)
  already ticks through every step; only the gating was wrong.

**Verified:** `tsc`, `eslint`, `prettier --check`, `vite build` all clean.

## 2026-07-04 — Fix: arrange-page slot ratio now matches the composed strip

The arrange screen (`StripSelector`) hardcoded every slot to `aspect-[3/4]` +
`object-cover`, so a **duo** cut (two cameras side-by-side = 3:2 landscape) was
cropped into a portrait box and didn't match the downloaded strip, where
`composeStrip` draws each cell at the frame's true aspect.

- Each `CapturedFrame` already carries real `width`/`height` (solo = 3:4 → 0.75;
  duo = 3:2 → 1.5). `StripSelector` now derives `slotRatio = width / height` from
  the first frame and sets it inline (`style={{ aspectRatio }}`) on every slot;
  removed the fixed `aspect-[3/4]` from `.slot`. With slot aspect == frame aspect,
  `object-cover` shows the full, undistorted cut — matching the compose output (and
  tightening sticker WYSIWYG, since the overlay box now shares the strip's aspect).

**Verified:** `tsc`, `eslint`, `prettier --check`, `vite build` all clean.

## 2026-07-04 — FAQ nav item (jumps to the landing FAQ)

Added **FAQ** to the header nav; clicking it scrolls to the FAQ section under
"How it works".

- **AppBar**: new nav entry `{ to: '/#faq', hash: true }`. Hash links render as a
  plain `Link` (not `NavLink`) so they don't steal the active state from Home;
  present in both desktop nav and the mobile menu (closes the menu on click).
- **LandingPage**: FAQ section now has `id="faq"` + `scroll-mt-24` (clears the
  sticky header). A `useLocation` effect smooth-scrolls to `location.hash` on change
  — works both when arriving from another page (`/activities` → `/#faq`) and when
  already on the landing (hash-only change, no remount).
- Copy: `nav.faq` (en + id).

**Verified:** `tsc`, `eslint src/`, `prettier --check`, `vite build` all clean.

## 2026-07-04 — FAQ section on the landing page

Added a collapsible **FAQ** to the landing page, directly **under "How it works"**
(before the CTA banner), getangie-style.

- `LandingPage`: new `.faq` section rendering 5 questions from `FAQ_KEYS`
  (`install`, `free`, `friend`, `privacy`, `need`). Built on native
  `<details>`/`<summary>` — accessible + keyboard-friendly with **no new deps or JS**;
  a lucide `ChevronDown` rotates 180° when open (`.faqItem[open] .faqIcon`), and the
  default disclosure triangle is hidden (`list-none` + `::-webkit-details-marker`).
- Copy under `landing.faq.title` + `landing.faq.items.<key>.{q,a}` (en + id).

**Verified:** `tsc`, `eslint src/`, `prettier --check`, `vite build` all clean.

## 2026-07-04 — Activities page + nav item (replaces Photobooth in header)

Added a dedicated **Activities** listing page and swapped the header nav item from
Photobooth → Activities (getangie-style "Activities" menu).

- **Shared data + component.** `constants/activities.ts` (`ACTIVITIES`: photobooth =
  live/links to `/photobooth`; prints, games, rooms, gifbooth, quiz = coming soon —
  each `key` maps to `activities.items.<key>.*`). `components/activities/ActivitiesGrid`
  (+ scss) renders the grid: live items are wide, clickable cards (lift on hover,
  "Open" CTA); the rest show a "Coming soon" badge. Card/grid styles **moved out of**
  `LandingPage.module.scss` into the shared module (grid class named `.list` — avoids
  the `@apply grid` circular-dep).
- **`pages/ActivitiesPage.tsx`** (+ scss) at `/activities`: page header + `ActivitiesGrid`.
- **LandingPage** now reuses `<ActivitiesGrid />` in its "What you can do" section and
  adds a **Browse all activities** button → `/activities` (hero secondary "Have a
  code? Join" still → `/photobooth`). Dropped the inline card markup/styles + the
  `landing.photobooth`/`landing.soon`/`live`/`comingSoon` keys (now under `activities.*`).
- **AppBar**: nav is now **Home + Activities** (`nav.activities`); `nav.photobooth`
  removed. Mobile menu unchanged.
- **Routing**: `ROUTES.activities='/activities'` + route in `app/App.tsx`.
- Copy: new `activities.*` (title/subtitle/live/comingSoon/open + 6 items) and
  `landing.browseActivities`; `nav.photobooth`→`nav.activities` (en + id).

**Verified:** `tsc`, `eslint src/`, `prettier --check`, `vite build` all clean;
`vite preview` serves `/`, `/activities`, `/photobooth` (all 200). Live visual check
via `npm run dev`.

## 2026-07-04 — Momoto platform landing + Photobooth moved to /photobooth

Reframed the app as the **Momoto platform** (getangie.com-inspired). The old
Solo/Date/join screen became a dedicated Photobooth page; `/` is now a warm,
playful marketing landing with Photobooth as the flagship.

- **Routing** (`constants/routes.ts` + `app/App.tsx`): added `photobooth: '/photobooth'`.
  `/` → new `LandingPage`, `/photobooth` → `PhotoboothPage`, `/room/:roomId` unchanged.
- **`pages/PhotoboothPage.tsx`** (+ scss): the former `LandingPage` verbatim
  (Solo/Date + join-by-code), now keyed under `photobooth.*`.
- **`pages/LandingPage.tsx`** (+ scss): the Momoto landing — gradient hero (badge +
  headline + dual CTAs → `/photobooth`), a **"What you can do" menu grid** (featured
  **Photobooth** card that links to the booth + 3 "Coming soon" cards: prints, party
  games, group booth), a 3-step "How it works", a CTA banner, and a footer. Warm
  pastel gradients (rose→fuchsia→indigo), rounded cards, lucide icons. All styling
  via `@apply` in the co-located module (convention); renamed the products grid class
  to `.menuGrid` (a class literally named `.grid` + `@apply grid` is a Tailwind
  circular-dep error, same gotcha as the earlier `.grid`→`.gridCells`).
- **AppBar** now has real nav: **Home** + **Photobooth** `NavLink`s (active state),
  a mobile hamburger toggling a dropdown menu. This finally uses the `isMenuOpen`
  state — **clearing the long-standing `AppBar` unused-var lint/tsc error** that had
  blocked a clean `tsc`/`build` since 2026-07-01.
- **RoomPage**: leaving a booth (Leave / Back home / confirm-leave) now returns to
  `/photobooth` (the booth's origin) rather than the marketing `/`. The AppBar brand
  still goes to `/`.
- **index.html**: title → "Momoto — Playful photo experiences" + meta description.
- Copy: new `nav.*` + platform `landing.*`, moved `photobooth.*` (en + id).

**Verified:** `tsc`, `eslint src/`, and `prettier --check` are now **fully clean**
(no more AppBar error); `vite build` succeeds; `vite preview` serves `/` and
`/photobooth` (both 200). Live visual polish is best checked via `npm run dev` (no
headless browser installed; didn't add one).

## 2026-07-04 — Stickers: SVG art instead of emoji

Swapped the emoji sticker palette for **bundled SVG images** (per user: prefer
PNG/SVG art; replace emoji entirely). Drag/resize/rotate/remove and the frozen
snapshot are unchanged.

- `src/assets/stickers/*.svg` (new): 10 self-made, square (100×100 viewBox) SVGs —
  heart, star, sparkle, crown, flower, rainbow, bolt, speech bubble, smiley, cloud.
  Each has explicit `width`/`height` so it decodes to a canvas with a known size.
- `constants/stickers.ts`: `StickerOption` now carries `src` (Vite-imported asset
  URL) instead of `emoji`; `PlacedSticker.emoji` → `src`. Kept square-box drawing
  (art is square) so the resize/rotate math is untouched.
- **Canvas-taint note:** stickers are **bundled, same-origin** assets (or inlined
  data URIs for the small ones), so `toDataURL` (the download) never taints. An
  external sticker URL would have broken the download — documented, kept local.
- `useStripStore.addSticker(src)`; `StickerOverlay` renders `<img>` (pointer-events
  off so the parent handles drag) instead of an emoji `<span>`; `StripSelector`
  picker shows `<img>` thumbnails.
- `composeStrip`: preloads the unique sticker images (`loadImage`, in parallel with
  frames; a sticker that fails to decode is **skipped**, not fatal) and `drawImage`s
  each in a square box at the grid-relative center, with the same rotate-about-center
  transform. Dropped the emoji font stack.
- `StripResult`: `stickers` now read as a stable ref from the snapshot (no `?? []`
  in the effect deps — cleared a react-hooks warning).
- Copy: `stickers.*` names updated to the new set (en + id).

**Verified (Node, esbuild bundle of `composeStrip`, stubbed canvas/Image):** 4
frames draw; an unrotated sticker `drawImage`s in a 90px box centered at its
grid-relative point; a 45° sticker draws at `(-half,-half)` after translating to
its center `(162, 1232.25)` with `rotate(π/4)` and balanced save/restore. `tsc`
(only pre-existing AppBar), `eslint src/` (0 warnings), `vite build` (SVGs bundled),
both JSONs clean.

## 2026-07-04 — Stickers: add rotate

Extended the sticker feature (below) with rotation, alongside drag/resize/remove.

- `PlacedSticker` gained `rotation` (degrees, clockwise about center); `addSticker`
  seeds `0`; `updateSticker` accepts `rotation` (unclamped — free spin).
- `StickerOverlay`: new **rotate handle** (top-left corner, `RotateCw` icon). The
  gesture captures the pointer's angle + the sticker's rotation on grab, then adds
  the angular delta — a natural rotate feel independent of handle position. The
  sticker's `transform` moved inline to `translate(-50%,-50%) rotate(<deg>)` (the
  Tailwind translate utilities were dropped so they don't fight the inline rotate).
  Corners now: top-left rotate · top-right ✕ · bottom-right resize.
- `composeStrip`: rotated stickers draw via `save → translate(center) → rotate →
  fillText(0,0) → restore`; unrotated ones keep the plain `fillText(cx,cy)` path.
- Copy: `stickers.rotate` (en + id); tip text mentions rotate.

**Verified (Node, esbuild bundle of `composeStrip`):** a 45° sticker draws at the
origin after translating to its center `(162, 1232.25)` with `rotate(0.785 rad)`
and balanced save/restore; a 0° sticker still draws directly at its center
(unchanged). `tsc` (only the pre-existing AppBar error), `eslint`, `vite build`,
and both JSONs clean.

## 2026-07-04 — Stickers on the strip (pick → place → drag / resize / remove)

New sticker feature on the **arrange screen** (per user). A picker of emoji
stickers sits under the strip; clicking one drops it centered on the strip, then
it can be dragged, resized by its corner handle, or removed with its ✕. Stickers
bake into the downloaded PNG.

- `constants/stickers.ts`: `STICKERS` (16 emoji, each id + emoji glyph + i18n
  label) — emoji so they render identically in the DOM preview (text) and the
  composed PNG (Canvas `fillText`), no image assets. `PlacedSticker` type: `id`
  (per-instance) + `emoji` + `x`/`y` (center, **fractions of the photo-grid
  content box**) + `size` (fraction of grid width). Default/min/max size consts.
- `useStripStore`: `stickers: PlacedSticker[]` + `addSticker(emoji)` (centered,
  new uuid), `updateSticker(id, {x,y,size})` (values clamped), `removeSticker(id)`;
  `reset` clears them. **Local design element** (like filter was originally) — not
  yet broadcast via `useStripSync`, so in a live session a guest doesn't see the
  host's stickers (documented follow-up below).
- `features/capture/StickerOverlay.tsx` (+ module.scss): an absolutely-positioned
  layer over the strip's photo area (`inset: 0.75rem` = `.strip`'s `p-3`, so it
  covers the same region the compose step draws into). The layer is
  `pointer-events:none` (slot drag/retake still work in the gaps); each placed
  sticker is `pointer-events:auto`. Interactions use **pointer capture** (mouse +
  touch): body = drag (offset captured on grab so it doesn't jump), corner handle
  = resize (size from pointer→center distance), ✕ = remove. Sticker size uses
  container-query units (`cqw`) so the em-box tracks the strip width.
- `StripSelector`: renders `<StickerOverlay editable={canEdit}>` inside the strip
  frame (now `position: relative`) + a wrapping emoji picker row under it (host-only;
  disabled for guests). `createStrip` snapshots a **copy** of the stickers into
  `resultConfig` so later edits can't alter a created strip.
- `usePhotosStore.ResultConfig`: added `stickers: PlacedSticker[]`.
- `composeStrip`: new `stickers` option — after the photos + footer, draws each
  emoji with `ctx.fillText` at `(padding + x·gridWidth, padding + y·gridHeight)`,
  font `size·gridWidth` px in an emoji font stack. `StripResult` passes the frozen
  stickers through.
- Copy under `stickers.*` (label / tip / remove + 16 sticker names) in en + id.

**Verified (Node, esbuild bundle of the real `composeStrip` with stubbed
canvas/Image):** a sticker `{x:0.5, y:0.25, size:0.3}` over a 4×(300×400) strip
draws at exactly `(162, 418.75)` with a `90px` emoji font — matching the
grid-relative geometry the live overlay uses (WYSIWYG). `tsc` (only the
pre-existing AppBar error), `eslint` on the touched files, `vite build`, and both
translation JSONs all clean.

**Follow-up (deferred):** sticker editing is host-gated but not yet synced to
guests via `useStripSync` (unlike layout/color/filter/order). Solo mode — the
primary flow — works end to end; live 2-person sticker sync is a separate task.

## 2026-07-04 — Strip is final after "Create strip" (+ confirm dialog)

Per user: the strip should be **finished** once **Create strip** is pressed — no
going back to re-arrange or retake. So the editing actions were pulled off the
result and a confirmation guards the (now irreversible) create.

- **Result is final.** `StripResult` no longer shows **Choose photos** (`onReselect`
  → `backToReview`) or **Retake** (`onRetake` → `reset`) on the finished strip —
  everyone (host + guest) sees only **Share** + **Download**. Dropped the now-unused
  `onReselect` prop + `ImagePlus` import; `CameraStage` stopped passing `onReselect`.
  The compose-**error** fallback keeps a host-only **Retake** (failure recovery — no
  strip was produced).
- **Arrange screen unchanged.** The `StripSelector` (arrange) row already groups
  **Retake all** (`reset`) next to **Create strip**, plus a per-shot retake icon on
  each slot — so the "edit before you commit" affordances already live there. A
  standalone "Choose photos" button on that screen would be a no-op (it *is* the
  review step) with no photo library to choose from, so none was added.
- **Confirm before create.** Clicking **Create strip** now opens the reusable
  `ConfirmDialog` (portal, `alertdialog`, Escape/backdrop = cancel, scroll lock)
  instead of composing immediately. Confirm runs the unchanged `confirmSelection`
  (design-snapshot logic intact); cancel returns to editing. Applies to host + guest.
- Copy under `select.confirm*` (title / description / confirmCreate / confirmCancel)
  in both en + id.

**Verified:** `tsc` (only the pre-existing AppBar error), `eslint` on the touched
files, and `vite build` all clean; both translation JSON files parse.

## 2026-07-03 — Fix: hide "Choose photos" + "Retake" from guests on the result

Those actions re-arrange / re-capture (`backToReview` / `reset`) and would desync a
guest, so they're host-only now. `StripResult` gates them behind
`canEdit = isHost === true` (same rule as `StripSelector`) — in both the normal
actions row and the compose-error fallback. Guests keep **Share** + **Download** of
their own frozen strip. `tsc` (pre-existing AppBar error only), `vite build`, lint,
prettier clean.

## 2026-07-03 — Fix: host filter change mutated a guest's already-created strip

Bug: a guest could press **Create strip** and view their result, but the host was
still on the arrange screen; when the host changed the filter it synced to the
guest (live) and `StripResult` — which read the filter live from `useStripStore` —
recomposed, silently changing the guest's finished strip. Guests keep their own
**Create** action; the finished strip is just frozen.

- `usePhotosStore`: `confirmSelection(selection, config)` now stores a
  `resultConfig: { layout, color, filter } | null` snapshot taken at create time
  (cleared by `reset`/`startCapture`).
- `StripSelector.createStrip` passes the current live `{ layout, color, filter }`.
- `StripResult` reads layout/color/filter from `resultConfig` (not the live store),
  so later host changes can't alter a strip already on screen. Going back via
  **Choose photos** and re-creating re-snapshots (opt-in to the newer design).

**Verified (Node, real stores):** guest creates with filter `none` → snapshot
`none`; host later sets `sepia` (live store updates) → snapshot **stays `none`**,
result unaffected; re-create after backToReview picks up `sepia`. `tsc` (only the
pre-existing AppBar error), `vite build`, lint, prettier clean.

## 2026-07-03 — Guests preview the strip config live during setup (layout + color)

Guests only saw a "host is setting up…" line during the pre-capture layout/color
step. Now they watch the strip config come together live — layout **and** color —
read-only.

- `CameraStage`: the guest's setup branch renders a live `StripPreview` of the
  synced layout + color (with the "host setting up" note) instead of bare text.
- `StripPreview`: added a `size` prop (`sm` default = swatch; `lg` = the guest's
  standalone preview); width moved out of the base class into `.sm`/`.lg`.
- **Confirm flag decouples "picked" from "done".** Color used to double as the
  completion signal (setting it advanced everyone to capture), so it couldn't
  preview live. Added `useStripStore.confirmed`; `CameraStage`'s `configComplete`
  is now `layout !== null && confirmed`. `ColorPicker` commits each swatch click to
  the store immediately (live preview/sync) and only sets `confirmed` on Continue.
- **Incremental + live config sync.** `useStripSync` broadcasts `strip:config` as
  soon as the layout is picked, then the color live as the host browses, then
  `confirmed` on commit. `StripConfigPayload` is now
  `{ layout, color: StripColor | null, confirmed: boolean }`; the guest applies
  layout immediately, color as it changes, and advances only on `confirmed`.

**Verified (Node, real store):** host picking layout then browsing blue→red never
advances (confirmed false); Continue confirms → advance. Guest applying
`{layout, color:null, confirmed:false}` → layout preview; `color` updates live
(blue→red) while still not complete; `confirmed:true` → advance; reset clears
color + confirmed. `tsc` (only the pre-existing AppBar error), `vite build`, lint,
prettier clean.

## 2026-07-03 — Host-only arrange + filter (guests get a synced, read-only strip)

Guests could independently reorder/retake/filter their own strip. Now the **host
is the single source of truth**: it arranges + filters, and the guest's strip
mirrors that design (applied to the guest's own shots) with editing disabled.

- **Order-based arrangement.** `usePhotosStore.frames` now stays in stable capture
  order; a new `order: number[]` (slot → capture index) holds the arrangement.
  `finishCapture` seeds identity order; `swapSlots(a,b)` reorders; `setOrder` applies
  a permutation from the host (ignored unless it matches the frame count). This lets
  a permutation be broadcast and re-applied over a *different* photo set.
- Per-shot retake is now slot-based: `retakeSlot` + `startRetake(slot)`;
  `useCaptureSequence` replaces `frames[order[retakeSlot]]` (position preserved).
  `confirmSelection` composes `order.map(i => frames[i])`.
- **Sync.** New `strip:arrange {order, filter}` event (+ mock-server relay).
  `useStripSync` (host) broadcasts order+filter on change / peer-join; (guest)
  applies `setOrder` + `setFilter`. Filter moved from a local choice to host-synced
  (still lives in `useStripStore`, but now broadcast). Layout/color sync unchanged.
- **StripSelector.** Gated by `canEdit = isHost === true`: guests get no drag, no
  retake buttons, disabled filter picker, a "host is arranging" hint + guest
  subtitle, and no "Retake all" — just **Create strip** to download their own copy.
- Copy: `select.subtitleGuest` + `select.hostArranging` (en + id).

**Verified (Node, real stores):** host finishCapture → identity order; `swapSlots(0,3)`
→ `[3,1,2,0]` and the strip renders reordered; single-retake of slot 0 maps to
capture index 3 via `order`, replaces in place, order unchanged; guest ignores a
mismatched-length order, applies the host's `[3,1,2,0]` to its **own** frames
(`g3,g1,g2,g0`); `setFilter`/reset behave. `tsc` (only the pre-existing AppBar
error), `vite build`, lint, prettier clean.

## 2026-07-03 — Photo filters on the strip (in the arrange step)

A single filter applied to the whole strip, chosen live in the arrange screen
alongside reorder/retake (per user: whole-strip, not per-photo).

- `constants/filters.ts`: `PHOTO_FILTERS` (none / B&W / sepia / vintage / warm /
  cool / vivid / fade / noir) — each an id + i18n label + a CSS/Canvas `filter`
  string. The **same** string drives the live preview (CSS `filter`) and the
  composed download (Canvas `ctx.filter`), so they match. `+ PHOTO_FILTER_MAP`.
- `useStripStore`: added `filter` (default `'none'`) + `setFilter`; `reset` clears
  it. It's a **local, post-capture** choice — deliberately kept out of
  `useStripSync` (each person filters their own strip), unlike host-synced
  layout/color.
- `composeStrip`: new `filter` option — sets `ctx.filter` around the photo
  `drawImage`s only, then resets to `'none'` so the footer text/background stay
  clean. `'none'`/omitted = untouched.
- `StripSelector`: a horizontally scrollable filter picker (radiogroup) below the
  strip; each option previews the filter on a real captured shot, and the strip
  slots update live. `StripResult` passes the chosen filter into `composeStrip`.
- Copy under `filters.*` + `select.filterLabel` (en + id).

**Verified (Node, stubbed canvas/Image over the real `composeStrip`):** with a
filter, all 4 photos are drawn with `ctx.filter` set to that value and it's reset
to `'none'` before the footer text; `filter:'none'` and an omitted filter leave the
photos unfiltered; returns a PNG. `tsc` (only the pre-existing AppBar error),
`vite build`, lint, prettier all clean.

## 2026-07-03 — Arrange the strip: reorder + per-shot retake (review step)

New step between capture and result: after the 4-shot sequence the user arranges
the strip. Shots **can't be deleted** — instead they can be **reordered** (drag)
or **retaken one at a time** in place (per user request, retake beats delete).

- `usePhotosStore`: `frames` is now the ordered strip (reordering mutates it).
  Added `reviewing`, `retakeIndex`, and a confirmed `selection`.
  `finishCapture` → `reviewing`; `swapFrames(i,j)` reorders; `startRetake(i)` leaves
  the camera live for one more countdown and marks the slot; `replaceFrame(i,frame)`
  swaps that slot's image in place; `finishRetake()` returns to review;
  `confirmSelection([...frames])` exits to the result; `backToReview()` returns from
  the result; `startCapture`/`reset` clear the new fields.
- `useCaptureSequence`: `captureOnce` now returns the frame; at countdown-zero it
  **replaces** the `retakeIndex` slot (then `finishRetake`) for a single retake, or
  **appends** during a normal sequence — so one hook drives both flows.
- `features/capture/StripSelector.tsx` (+ module.scss): the arrange screen — a live
  strip preview drawn as numbered, ordered slots matching the chosen layout
  (vertical column / 2×2 grid) tinted with the chosen color. **Drag** a slot onto
  another to reorder (`swapFrames`); each slot has a **retake** button
  (`startRetake`) that re-shoots just that photo. "Create strip" confirms; "Retake
  all" re-runs the whole capture. (No pool/delete — the earlier `stripArrange.ts`
  reducer was removed.)
- `CameraStage`: gates capture → **review** (`reviewing`) → **result**
  (`selection.length > 0`); the capture view shows a "Retaking photo N…" hint when
  `retakeIndex !== null`. `StripResult` composes from `selection` and has a **Choose
  photos** button (`onReselect` → `backToReview`).
- Copy under `select.*`, `capture.retakingPhoto`, `result.choosePhotos` (en + id).

**Verified (Node, esbuild bundle of the real store):** capture 4 → reviewing;
`swapFrames` reorders (`[f4,f2,f3,f1]`), same-index / out-of-range are no-ops;
`startRetake(2)` keeps frames + goes camera-live, `replaceFrame` swaps that slot in
place keeping its position (`[f4,f2,f99,f1]`), `finishRetake` returns to review;
`confirmSelection` mirrors the arranged order; `backToReview` preserves it; `reset`
clears all incl. `retakeIndex`. `vite build` / lint / prettier clean.

**Note:** still blocked from a clean `tsc` by the pre-existing unrelated
`AppBar/index.tsx` `isMenuOpen` unused-var — left untouched.

## 2026-07-02 — Share the photo strip (branded share card + Web Share)

Users can now share their finished strip, not just download it (getangine-style
share preview).

- `utils/composeShareCard.ts`: wraps the already-composed strip in a branded,
  shareable card on a soft pastel gradient — white photo-frame with rounded
  corners + drop shadow, `brand` wordmark + tagline below. Returns a PNG data URL
  (preview) **and** a Blob (for the Web Share API). Canvas-based, mirrors the
  strip's resolution; no new deps.
- `features/compose/ShareStripDialog.tsx` (+ module.scss): portal modal that
  previews the share card with **Share** + **Download** actions, Escape/backdrop
  close, scroll lock.
- `StripResult`: new **Share** button opens the dialog; the card is composed
  lazily on open. Download button saves the branded card; the main-screen Download
  still saves the raw strip.
- **Instagram / social:** Instagram has no direct web-post API and the app is
  frontend-only (no image host), so the actual image can only reach Instagram via
  the mobile native share sheet. The dialog leads with a **Share to Instagram**
  button: on mobile it calls `navigator.share({ files })` (Instagram appears as a
  target); on desktop it saves the card + opens instagram.com with a guidance
  hint/toast. A secondary **More apps** button (native sheet, mobile only) covers
  WhatsApp/others. Skipped link-intent X/Facebook buttons — without hosting they'd
  share text, not the image.
- Copy under `result.share*` / `result.instagram*` + `common.close` in both en + id.

**Note:** still blocked from a clean `tsc`/`build` by the pre-existing unrelated
`AppBar/index.tsx` `isMenuOpen` unused-var — left untouched.

## 2026-07-02 — Leave-confirmation dialog on the room page

Guard against accidentally losing a live session. A confirm dialog now appears on
any in-app attempt to leave the room, and the browser's native prompt covers tab
close / refresh.

- New `components/common/ConfirmDialog` (authored, `@apply` module.scss): portal
  modal, `role="alertdialog"`, Escape / backdrop-click to cancel, body-scroll lock,
  focuses the cancel button. Reusable (title/description/labels/`destructive`).
- `RoomPage` uses React Router's `useBlocker` to intercept **every** in-app
  navigation away from the room — the header **Leave**, "Back home", the AppBar
  **logo**, and browser back — showing the dialog first; confirm clears the
  persisted session then `proceed()`, cancel `reset()`s. Only blocks while a
  session is live (`!roomFull && !(ended && !resultShowing)`) — the terminal
  "time's up" / "room full" screens navigate freely.
- Added a `beforeunload` handler (same live-session condition) so closing/refreshing
  the tab triggers the native browser confirmation.
- Copy under `room.leaveDialog.*` in both en + id.
- **Back-button fix:** leaving pushed `/` on top of `/room/:id`, so browser Back
  returned to the room URL and RoomPage silently re-created/re-joined it. Every exit
  now **replaces** the room's history entry — confirmed leave does
  `blocker.reset()` + `navigate(home, { replace: true })` (a `bypassBlockRef` lets
  that navigation through without re-prompting), and the terminal "time's up" /
  "room full" Back-home links use `<Link replace>`. Back no longer re-enters the room.

**Note:** pre-existing unrelated lint/tsc error in `AppBar/index.tsx` (`isMenuOpen`
declared but never read) still blocks a clean build — left untouched as in-progress.

## 2026-07-01 — WYSIWYG framing: preview tiles match the captured cell

The live preview didn't match the captured image: tiles were 16:9 (`aspect-video` +
`object-cover`) while each captured cell was a half-width (~portrait) cover-crop, so
what you framed wasn't what landed in the strip.

Pinned **one cell ratio** used by both sides — `CELL_ASPECT = 3/4` (portrait):

- `captureCompositeFrame` now sizes each cell as `cellHeight × (cellHeight * 3/4)`
  and lays cells side-by-side (cover-cropped from center), instead of splitting the
  base video's native width. Duo cut = two 3:4 cells (3:2); solo = one 3:4 cell.
- `CameraStage` tiles are now `aspect-[3/4]` (container `max-w-sm` solo / `max-w-2xl`
  `grid-cols-2` paired); `object-cover` + local mirror unchanged — so each tile is the
  exact center-crop of that camera's captured cell.
- `ShotTray` slots follow (`aspect-[3/4]`, `object-contain` so a two-person cut shows
  both people, not a crop).

**Verified (real `captureCompositeFrame` + DOM):** duo cut 1080×720 (cell aspect 0.75,
left=local/red, right=peer/blue), solo 540×720 (0.75); solo tile 384×512 and each paired
tile 330×440 — all ratio 0.75, `object-cover`, local mirrored (`matrix(-1,…)`). Screenshot
shows two portrait tiles side-by-side, no console errors. typecheck/lint/format/build clean.

## 2026-07-01 — Fix: shot tray restored during capture

Regression from the camera-during-config restructure: the shot tray (per-photo
thumbnails) only rendered in the ready state, so during capture only the "Taking
photos… n/4" text showed. `CameraStage` now renders the `ShotTray` whenever config
is complete (both capturing and ready), so each shot's thumbnail appears as it's
taken. Verified: mid-capture shows 2/4 filled thumbnails + the progress hint.

## 2026-07-01 — Session resumes across tab close/reopen

Timer refactored to an end-timestamp model persisted in localStorage.

- `sessionPersistence.ts` (load/save/clear per room); `useSessionStore` now tracks
  `endsAt` and derives `secondsLeft`; `useSessionTimer` resumes from the persisted
  `endsAt` (+ restores layout/color) or starts fresh, ticking each second.
- `RoomPage`: clears the persisted session on explicit Leave / Back home; shows
  "Time's up" only when `ended && !resultShowing`, so a finished strip stays
  viewable/downloadable.

**Verified (localStorage + DOM):** fresh → 180 counting down + stored; reopen with
60s left → resumed at 54 + config (grid/blue) restored; reopen expired → "Time's
up", no camera; Leave → localStorage entry cleared. typecheck/lint/format/build clean.

## 2026-07-01 — 3-minute session timer

- `useSessionStore` (`secondsLeft`, `ended`) + `useSessionTimer` — starts 180s on
  booth mount, ticks each second, **freezes** while a completed strip is shown,
  and ends at 0. Mounted in `CameraStage`.
- `RoomPage` shows a `m:ss` countdown in the header (red under 30s) and swaps the
  booth for a "Time's up / Back home" screen when `ended` — unmounting the booth
  tears down the camera + peer connection.

**Verified:** header showed 3:00 counting down (169s → "2:49"); forcing the timer
to 0 → "Time's up" screen with `videoCount: 0` (camera stopped), red 0:00 in the
header. typecheck / lint / format / build clean.

## 2026-07-01 — Camera live during config (talk while setting up)

Moved the layout/color setup INTO the booth (below the live video) instead of
separate pre-camera screens.

- `CameraStage` opens the camera + peer video immediately (past the lobby), then
  renders the config below the feeds: host → `LayoutPicker` / `ColorPicker`;
  guest → "Your host is setting up…" — with cam/mic controls available. Start
  Session appears once config is complete.
- `RoomPage` simplified: `isHost === null` → Connecting; date host + no peer →
  `RoomLobby`; otherwise → `CameraStage`. Removed the separate picker/waiting gates.

**Verified (DOM, solo booth):** 2 live video tiles + cam/mic controls + "Choose
your layout" render together; once config is set → video + Start Session (picker
gone). typecheck / lint / format / build clean.

## 2026-07-01 — Entry modes: Solo / Date + lobby

Landing now offers **Solo** vs **Date** (plus join-by-code):

- **Solo** (`?mode=solo`): `useRoom` skips the socket (`connect: false`) and acts
  as host; no code shown, no presence badge — straight to layout → color →
  camera. Offline-capable.
- **Date** (`?mode=date`): connects; the host sees a `RoomLobby` (shareable code +
  "waiting for your friend") until a peer joins, then the layout/color pickers.
- `RoomPage` reads `mode` from the URL; gates the lobby (date + host + no peer),
  hides the code + `RoomStatus` for solo. LayoutPicker copy made mode-agnostic.

**Verified (offline):** landing renders both modes; Solo → setup with "Solo
session" header; Date host → lobby with the code + "waiting". typecheck / lint /
format / build clean.

## 2026-07-01 — Fix: guest inherits the host's strip setup (no re-picking)

**Bug:** a guest joining by code could re-pick a layout/color already chosen by
the room master. Now the strip setup is host-controlled and synced.

- `useRoomStore.isHost` — host = first room member; solo/offline = host; the
  remaining member becomes host if the other leaves.
- `useStripSync` — the host broadcasts `strip:config {layout, color}` (once
  chosen + again on peer-join); the guest applies it and never emits. Server
  relays the event.
- `RoomPage` gates by role: host → pickers → camera; guest → "Waiting for the
  host…" → camera; connecting → "Connecting…". The guest never sees the pickers.

**Verified:** a node "host" in a room, then the preview joined as guest →
`isHost: false`, inherited `layout: grid` + `color: blue`, and went straight to
the camera (no pickers); host logged the config push. Zero console errors;
typecheck / lint / format / build clean.

## 2026-07-01 — Strip color picker step

New step after the layout picker, before the camera: choose the strip background
color (white / black / gold / pink / blue / red).

- `features/compose/colors.ts`: palette (id, label, background, readable text).
- `useStripStore` gained `color`; `RoomPage` now gates layout → color → camera.
- `composeStrip` gained a `textColor` option; `StripResult` looks up background +
  text from the chosen color.
- `StripPreview` renders each swatch as a mini mockup of the chosen layout
  (strip or grid) tinted with the color + footer lines in the readable text
  shade — so users see how the strip will look. Reusable component.
  (Note: SCSS class `.grid` renamed to `.gridCells` — `@apply grid` inside a
  class named `grid` is a Tailwind circular-dependency error.)

**Verified:** picker renders after the layout step (screenshots: strip mockups
and grid mockups per color);
deterministic pixel check — red background composes to `#dc2626`. typecheck /
lint / format / build clean.

## 2026-07-01 — Pre-camera layout picker (strip / 2×2 grid)

New step before the camera opens: choose the strip arrangement.

- `useStripStore` (`layout: 'strip' | 'grid' | null`); `RoomPage` shows
  `LayoutPicker` until a layout is chosen, then the camera; resets on leave.
- `composeStrip` generalized to columns (strip = 1 col, grid = 2 cols). Shot
  count unchanged (4 synced shots) → no capture/sync changes; each person
  arranges their own download.
- `StripResult` composes per the chosen layout.

**Verified:** picker renders before the camera (screenshot); deterministic
compose check — grid = 2700×1761 with frames in a correct 2×2
(red / blue / green / orange), strip unchanged at 1382×3277. typecheck / lint /
format / build clean.

## 2026-07-01 — Capture model: side-by-side composite (both cams per cut)

**Supersedes the alternating model** (per user request "2 cams on the same
frame"). Each cut now composites both cameras side-by-side into one frame.

- `captureCompositeFrame(sources, canvas)` draws the cameras side-by-side
  (cover-crop, local mirrored left / peer right). `useCaptureSequence` composites
  local + peer each shot; solo = local full-frame. Removed the alternating
  `activeSource` / per-tile source gating.
- `CountdownOverlay` shows on both tiles simultaneously (shared countdown).

**Verified:** deterministic pixel check on the composite (left half blue
"ME"/local, right half pink "FRIEND"/peer; 1280×720 cut) and the "3" countdown on
both tiles. typecheck / lint / format / build clean.

## 2026-07-01 — Phase 6 complete: polish, resilience & docs

**Done.** Final polish pass — the core app (Phases 0–6) is complete.

**Built:**
- **Toasts** (sonner): friend joined / left, "Strip saved" on download, and a
  "you left the booth" nudge if the tab was hidden mid-capture. `<Toaster>` at
  the app root.
- **Capture resilience**: if the peer's frame is unavailable mid-session
  (disconnect / freeze), that shot falls back to the local camera so the sequence
  still finishes.
- **Responsive**: the two video tiles stack in one column on small screens,
  side-by-side from `sm` up (verified at 375px).
- **Accessibility**: `role="status"` + `aria-live="polite"` on the room-status
  badge and the capture progress hint.
- **README** expanded: features, stack, getting started (dev + dev:server), env
  vars, 2-person testing guide, known limitations.

**Verified:** typecheck / lint / format / build clean. Headless preview:
responsive tiles stack on mobile; result strip renders; toast renders
("Strip saved to your downloads"); zero console errors.

**Final QA vs. success criteria:**
- Image generation — ✅ verified headlessly (composed 1382×3277 PNG, aspect
  preserved, no distortion).
- Media reliability & capture accuracy — logic + error paths verified headlessly;
  live webcam + 2-browser confirmation remains a manual step.

**Status:** all planned phases (0–6) complete. Optional future enhancement:
native-resolution peer shots via frame exchange (deferred).

## 2026-07-01 — Capture model: alternating two-camera strip

**Supersedes the entry below** (per further user feedback). When a peer is
present, shots now alternate local → peer → local → peer (strip = `[you, friend,
you, friend]`); solo stays all-local. The 3-2-1 countdown overlays only the
frame being captured that shot — your tile, then the peer's tile, one at a time —
via `usePhotosStore.activeSource`.

- `useCaptureSequence` now takes both video refs and captures from the active
  source (local mirrored, peer drawn as-is). `CountdownOverlay` takes a `source`
  prop and shows only when it's the active tile. `PeerVideo` takes a `videoRef`.
- Peer shots come from the received stream (stream res), not native webcam res
  (documented trade-off; could exchange native frames later).

**Verified (headless):** overlay on the left tile for `activeSource=local`, moves
to the right tile for `activeSource=peer`. typecheck / lint / format / build clean.

## 2026-07-01 — Countdown placement: on the captured (local) frame only

Reaffirmed the capture model: **each person shoots their own 4 shots** (each
downloads their own strip at native resolution; the peer tile is just for posing
together). So the 3-2-1 countdown belongs only on the frame being captured — the
local tile — not on the peer's tile. (Briefly mirrored it onto both tiles;
reverted per this decision.) Verified: "3" shows only on the local tile, peer
tile clean.

Also clarified during debugging: the countdown fires on both peers correctly
(server broadcasts to both; the non-initiator's browser renders it). The earlier
"only on the master" report was **browser background-tab throttling** — inactive
tabs are throttled and not painted. Test with two *visible* windows (or two
devices), not two tabs in one window.

## 2026-07-01 — Phase 5 complete: WebRTC peer video (PeerJS)

**Done.** Live P2P video/audio between the two participants, wired to the socket
room. "Friend connected" now shows the friend's camera beside yours.

**Built:**
- `features/peer/usePeerConnection.ts`: creates a PeerJS peer once local media is
  ready; exchanges PeerJS ids over the socket room (`peer:announce`); a
  deterministic initiator (higher id) places the call, the other answers (avoids
  glare); attaches the remote stream; relays/reflects peer mic/cam state
  (`peer:media-state`); tears down on peer-left / unmount.
- `store/usePeerStore.ts`: `remoteStream`, `status`, `peerCamEnabled`, `peerMicEnabled`.
- `features/peer/PeerVideo.tsx`: remote feed (not mirrored) + "Camera off" and
  muted-mic overlays.
- `CameraStage`: two-tile layout — local + peer side by side when connected.
- Mock server relays `peer:announce` + `peer:media-state`.
- Broker: public PeerJS cloud by default; env-overridable via `VITE_PEERJS_*`.

**Verified:**
- Two-tile layout renders the peer feed beside the local tile (headless, with a
  stand-in remote stream); peer cam-off → "Camera off" overlay, mic-off → muted badge.
- Signaling relay: two node clients exchanged `peer:announce` and
  `peer:media-state` through the server.
- Zero console errors; typecheck / lint / format / build clean.

**Needs two real browsers + cameras (manual):** the actual PeerJS broker
handshake and live face-to-face video/audio — run `npm run dev` + `npm run
dev:server`, open two tabs (or machines) on the same room code, allow the camera
in both.

**Status:** Core app complete (Phases 0–5). Remaining: Phase 6 — polish,
resilience, responsive/a11y pass, README, final QA vs. success criteria.

## 2026-07-01 — Phase 4 complete: Socket.io + room lifecycle

**Done.** Rooms connect over Socket.io with a synchronized, server-triggered
countdown that fires the capture engine; graceful solo fallback with no server.

**Built:**
- Dev mock server `server/mock-server.js` (Socket.io): room join with a 2-person
  cap, `time:sync` clock handshake, `session:start` → broadcast
  `session:countdown-start { startAt }`, peer-joined/left. Run via `npm run dev:server`.
- Client: `features/room/socket.ts` (shared socket), `events.ts` (typed
  contract), `useRoomStore` (status / room / peer / clockOffset / roomFull),
  `useRoom` (connect + join + presence + clock offset), `useCountdownSync`
  (offset-aware trigger of `startCapture` + `startSession`).
- Landing page: real Create / Join-with-code form (validation) + shadcn `Input`.
- Booth: `RoomStatus` presence badge; **Start Session** replaces the placeholder
  trigger; room-full screen; solo fallback when offline.
- Audio: Web Audio countdown beeps (`countdownAudio` + `useCountdownAudio`).
- `startCapture` made idempotent (guards double triggers from button + broadcast).

**Verified (headless, mock server + a Node peer):**
- Client connects; `time:sync` offset ≈ 0.5 ms; room join assigns `selfId`.
- 2-person presence: a second peer joins → `peerId` matches + "Friend connected";
  leaves → "Waiting for a friend…".
- **Synced countdown**: one Start Session → server logged `countdown-start` and
  BOTH members received the *identical* `startAt` (Node peer log + initiator
  entering capture).
- Offline: no server → "Offline — solo mode" badge; Start Session falls back to
  local capture.
- Zero console errors; typecheck / lint / format / build clean.

**Needs a real webcam / two browsers (manual):** watch actual frames populate on
both peers at once — run `npm run dev` + `npm run dev:server`, open two tabs to
the same room code.

**Next:** Phase 5 — WebRTC peer video (PeerJS): live P2P video/audio between the
two participants.

## 2026-07-01 — Capture UX: per-shot countdown + shot tray

**By user request.** Added a 3-2-1 countdown before each shot and restored the
per-shot preview (which had been removed with Phase 2's debug strip).

- Reworked `useCaptureSequence` into a countdown state machine: countdown ticks
  3→2→1, a frame is captured at 0, brief review, then the next shot. `usePhotosStore`
  now tracks `countdown` (replacing `pendingShots`).
- New `CountdownOverlay` (number with pop animation + a capture flash at zero)
  over the viewport; new `ShotTray` (4 slots that fill per shot, latest ringed).
- `CameraStage` hides controls/Start during capture and shows a `n/4` progress hint.
- Fixed: tray thumbnails are not double-mirrored (frames are already mirrored).

**Verified (headless):** countdown overlay ticks (observed 3→1), the tray fills
with the latest shot highlighted, idle shows the empty tray + Start button. Zero
console errors; typecheck / lint / format / build clean.

**Note:** this is the *visual* countdown. Phase 4 triggers it from the shared
socket timestamp, adds Web Audio beeps, and syncs it across the two peers.

## 2026-07-01 — Phase 3 complete: photo composition & download

**Done.** Captured frames compose into a vertical strip on a solid background,
shown on a result screen with Download PNG + Retake.

**Built:**
- `features/compose/composeStrip.ts`: async — decodes the frame data URLs, draws
  them at the strip content width with aspect preserved (no stretching), adds
  padding/gutters + a footer (title + date), returns a full-res PNG data URL.
- `features/compose/constants.ts`: `STRIP_BACKGROUND` (#fff), `STRIP_TITLE`,
  `STRIP_TEXT_COLOR`.
- `features/compose/StripResult.tsx`: composing / ready / error states; Download
  (anchor + data URL) and Retake.
- `CameraStage`: renders `<StripResult>` once `SHOT_COUNT` frames exist; Retake
  resets. Removed the temporary `CaptureDebugStrip`.
- Dev-only: `main.tsx` exposes stores on `window.__photobooth` (DEV builds only)
  for manual testing.

**Verified (headless, no camera needed):** injected 4 synthetic 1280×720 frames
→ the result screen composed a **1382×3277** PNG (exact expected layout), aspect
preserved (no distortion), Download + Retake render, and Retake returns to the
capture view. Zero console errors. typecheck / lint / format / build clean.

**Next:** Phase 4 — Socket.io + room lifecycle (create/join, 2-person presence,
synced countdown that fires the capture engine).

## 2026-07-01 — Phase 2 complete: canvas capture engine

**Done.** Native-resolution frame capture to a hidden canvas, a 4-shot sequence
orchestrator, and a temporary test trigger + debug thumbnail strip.

**Built:**
- `features/capture/captureFrame.ts`: `captureVideoFrame(video, canvas)` draws
  the frame at native `videoWidth`×`videoHeight` (no scaling) → PNG data URL.
  Mirrors to match the preview (`MIRROR_CAPTURE`).
- `features/capture/constants.ts`: `SHOT_COUNT=4`, `SHOT_INTERVAL_MS`, `MIRROR_CAPTURE`.
- `store/usePhotosStore.ts` (Zustand): `frames`, `isCapturing`, `pendingShots`
  + `addFrame` / `startCapture` / `registerShotTaken` / `reset`.
- `features/capture/useCaptureSequence.ts`: one shot per interval, each shot its
  own effect cycle (local timer cleanup → StrictMode-safe).
- `features/capture/CaptureDebugStrip.tsx`: temporary thumbnails showing each
  frame at its native W×H (proves no distortion).
- `CameraStage` now owns the `<video>` + hidden `<canvas>` refs, renders the test
  button + debug strip, and clears frames on unmount. `VideoPreview` takes the
  video ref as a prop.

**Verified:** typecheck / lint / format / build clean. Headless preview: room
mounts with the new capture hooks/store, no console errors, no regressions (the
hidden canvas + test UI are correctly gated behind the camera-ready state).

**Needs a real webcam (verify via `npm run dev`):** click "Test capture (×4)" →
4 thumbnails appear, each labeled at native webcam resolution, undistorted.

**Next:** Phase 3 — photo composition & download (stitch the 4 frames vertically
onto a solid background → downloadable PNG).

## 2026-07-01 — Phase 1 complete: local media capture

**Done.** Local camera/mic acquisition, live preview, and cam/mic controls wired
into the booth, with loading + error fallbacks.

**Built:**
- `store/useMediaStore.ts` (Zustand): `localStream`, `camEnabled`, `micEnabled`,
  `status`, `error` + actions. Toggles flip the underlying track `.enabled`.
- `features/media/useUserMedia.ts`: requests `getUserMedia` on mount, stores the
  stream, stops tracks on unmount; StrictMode-safe (stops a stream acquired after
  unmount) and exposes `retry`.
- `features/media/media-errors.ts`: maps rejections
  (denied / not-found / in-use / insecure / unknown) to user-facing messages.
- `features/media/VideoPreview.tsx`: mirrored `<video>` (muted, playsInline) via
  `srcObject`; "Camera off" overlay when disabled.
- `features/media/MediaControls.tsx`: cam/mic toggle buttons (shadcn Button +
  lucide icons, `aria-pressed` / labels).
- `features/media/CameraStage.tsx`: loading / error (+ Try again) / ready states.
- `RoomPage` now renders `<CameraStage />`; shadcn `button` base gained svg sizing.
- All authored components follow the `@apply`-in-`.module.scss` convention.

**Verified:** typecheck / lint / format / build all clean. Ran the app in a
headless preview: landing renders and navigates into a room; with no camera
present, `getUserMedia` is denied and the error fallback ("Camera access blocked"
+ Try again) renders correctly; zero console errors.

**Needs a real webcam (verify interactively via `npm run dev`):** live video
render, horizontal mirror, and cam/mic toggle behavior.

**Next:** Phase 2 — canvas capture engine (grab the local `<video>` frame to a
hidden `<canvas>` at native resolution, ×4).

## 2026-07-01 — Styling convention: @apply in SCSS modules

**Convention adopted** (see DECISIONS.md), applies to all future phases:
authored components carry no inline Tailwind in JSX — each gets a co-located
`*.module.scss` with semantic classes using `@apply`, referenced via
`className={styles.*}`. shadcn/ui primitives (`src/components/ui/**`) are exempt.

**Refactored to match:**
- `LandingPage.tsx` / `RoomPage.tsx`: all inline Tailwind utilities extracted
  into `LandingPage.module.scss` / `RoomPage.module.scss` using `@apply`.
- Removed now-redundant `styles/_variables.scss` + `_mixins.scss`.

**Verified:** typecheck / lint / format:check / build all clean; modern Sass API
also silenced the earlier legacy-js-api deprecation warning.

## 2026-07-01 — Phase 0 complete: scaffolding & tooling

**Done.** Scaffolded the app by hand (to avoid Vite's interactive prompt on the
non-empty dir). Full toolchain wired up and verified against the phase DoD.

**Built:**
- Vite + React 18 + TS project; `@` → `src` alias (vite.config + tsconfig).
- Tailwind CSS v3 + PostCSS + autoprefixer; global entry `src/index.scss`
  (Tailwind directives + shadcn slate CSS variables). Vite set to the modern
  Sass API.
- shadcn/ui initialized (`components.json` → `src/index.scss`); `Button` + `cn`.
- Sass authored-styles structure: `styles/_variables.scss` + `_mixins.scss`
  consumed via `@use`; `RoomPage.module.scss` CSS Module proves the path works.
- React Router v6: `/` (LandingPage) and `/room/:roomId` (RoomPage).
- Typed env (`src/env.ts` + `vite-env.d.ts`) and `.env.example`.
- ESLint (flat config) + Prettier; scripts: dev / build / preview / lint /
  format / format:check / typecheck.

**Verified (DoD met):** `typecheck` clean · `lint` clean · `format:check`
clean · `build` succeeds (CSS + JS emitted) · `npm run dev` serves both `/` and
`/room/:id` (HTTP 200, correct HTML).

**Notes / follow-ups:**
- `npm audit`: 2 advisories, both the esbuild/vite **dev-server** issue
  (GHSA-67mh-4wv8-2f99). Fix requires a breaking Vite major bump — deferred; it
  does not affect production builds.
- Git not initialized yet; no commits made. Can `git init` + commit Phase 0 on
  request.

**Next:** Phase 1 — local media capture (getUserMedia, own feed, cam/mic toggles).

## 2026-07-01 — Project kickoff & planning

**What this project is:** A React (TypeScript) single-page app — the client for
a synchronized virtual photobooth. Two users join a shared room, see each other
via live webcams, and take a synchronized four-cut photo strip. Each person
captures their own camera four times in sequence (triggered by a
socket-synced countdown), then composes and downloads a vertical PNG strip.

**Stack:** Vite · React 18 · TS · React Router v6 · Zustand · Tailwind +
shadcn/ui · socket.io-client · PeerJS · HTML5 Canvas · ESLint + Prettier.

**Status:** Planning complete, awaiting plan approval. No code written yet.

**Key decisions locked in** (see DECISIONS.md): frontend-only with
env-configurable endpoints + local Socket.io dev mock; four-cut = 4 sequential
selfies of the local user; room capacity is exactly 2; background is a minimal
themeable solid color; **styling uses Sass (SCSS) with Tailwind v3 + shadcn/ui**
(v3 pinned for Sass interop).

**Phase we're starting with:** Phase 0 — Project scaffolding & tooling
(pending approval).

**First concrete tasks (Phase 0):**
1. Initialize Vite react-ts project and folder structure.
2. Add Sass, then configure Tailwind CSS v3 with `src/index.scss` as the global entry; verify utilities render.
3. Initialize shadcn/ui and add a Button smoke test.
4. Set up ESLint + Prettier with `lint` / `format` / `typecheck` scripts.
5. Add React Router v6 routes: `/` (Landing) and `/room/:roomId` (Booth).
6. Add typed env config + `.env.example`.

**Next up after Phase 0:** Phase 1 — local media capture (getUserMedia).
