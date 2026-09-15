# Momoto Frontend — Session GIF

> Supersedes `PLAN-video-recording.md`. The deliverable changed from a recorded video to
> an encoded GIF, which removes `MediaRecorder`, audio and live capture entirely.

Plan for a **looping GIF of the strip assembling itself**: the chosen template's art, each
cut dropping into its true slot at the moment it was taken, offered as a file on the result
screen. **No opt-in and no control anywhere in the booth** — every completed run produces
one, and it simply appears beside the finished strip.

Frontend-only — no backend, no bucket, no new endpoint. Silent, never stored, and built
entirely from data the booth already has.

**Legend:** DoD = Definition of Done.

---

## Concept

- **The subject is the strip, not the cameras.** The frame is the paper: the template's
  art at its own aspect, each cut in its true slot, empty slots holding their numbered
  placeholders, the next one ringed. It is `StripPreview` redrawn onto a canvas — what the
  user watches in the rail while they pose. The faces are in it as the cuts they became,
  never as live tiles.
- **It is a GIF, not a video.** Five frames — empty template, then one per cut — with
  per-frame delays, looping forever. No audio, no codec negotiation, no `MediaRecorder`.
  A GIF loops inline in every chat app and photo roll without a player, and it works in
  every browser this app supports, including the older iOS Safaris with the weakest
  `MediaRecorder` story.
- **Nothing runs during the capture, and nothing is asked of the user.** This falls out of
  choosing GIF: five frames with delays don't have to be *captured in real time*, they have
  to be *drawn*. So the GIF is assembled at `finishCapture` from the same `frames[]` the
  strip composes from — the run itself costs nothing, and since the cuts exist whether or
  not anyone opted in, there is nothing to opt into. **No toggle, no chip, no preference.**
  The booth is unchanged; the only new thing anyone sees is a card on the result screen.
- **What that costs, said once.** Every run now produces a file of everyone's faces on
  every member's device, without anyone choosing it. It never leaves that device, is never
  stored, and is discarded when a person in it leaves the room (see G3) — those three
  together are what make an unasked-for artefact defensible. They also make open question 4
  (telling the room) weigh more than it did when a chip on the stage announced the
  intention.
- **The pacing is real, not invented.** `CapturedFrame.takenAt` is a timestamp, so each
  frame's delay is the actual gap between shots — the count, the pose, the beat after the
  flash. It plays back at the speed the session happened.
- **It is each member's own, like their strip design.** No sync, no host permission, no new
  socket event. Each member picks their own template, so each GIF shows *that member's*
  paper filling with their own copies of the cuts.
- **The file is never stored anywhere.** Not R2, not the cart, not IndexedDB, not the booth
  draft, not `localStorage`. It exists as one `Blob` in memory for as long as the booth is
  open, and the only way it becomes a file is the user pressing Save on the result screen.
  Refresh, leave, or start another run and it is gone — by design.
- **One place to save it, one window to do it in.** The result screen is the only surface
  that offers it, and the offer lasts as long as that strip's result does. There is no
  library to come back to, so the screen says so before the user leaves it.
- **No account required.** Nothing here reaches the API, the cart, or even IndexedDB, so
  there is nothing for a login to protect. The auth wall sits at **printing**. A signed-out
  visitor gets the identical file; `useAuthStore` is not read anywhere in this feature.
- **It ships behind a flag** (`VITE_SESSION_GIF_ENABLED`), off by default, like payments
  and group mode.

## What is in the frame (and what isn't)

The encoder redraws `StripPreview` — nothing screenshots the DOM.

**In each frame**

| Drawn | From |
| --- | --- |
| The template's art, filling the canvas | `template.src`, loaded once |
| Every cut taken *so far*, cover-cropped into its slot (rounded slots clipped) | `frames[]` + `template.slots[]`, via the shared `drawSlotImage` |
| A numbered placeholder in each still-empty slot, on a white-70% plate | mirrors `.placeholder` / `.slot` in `StripPreview.module.scss` |
| A 2px inset ring on the slot that's up next | mirrors `.slotNext` (`ring-primary`) |

**Not in it:** any live camera; the 3-2-1 countdown and capture flash (chrome on the
tiles, not on the paper); the "STRIP · 2 of 4" caption (it sits *outside* `.strip`);
filters, stickers, the footer date and the watermark (all applied at compose time, after
this animation ends); and the page around it.

**The canvas is the template's shape.** `GIF_HEIGHT` (960) fixes the height and the width
follows `template.aspect`: a 4x1 ribbon gives **320x960**, a 2x2 card **640x960**. Smaller
than the video plan's 1280 on purpose — GIF stores frames, not motion vectors, so pixels
are the whole cost. The template is locked during capture, so the shape is fixed for the
run.

**No audio.** GIF has none. The countdown beeps, the mic and every peer's voice are outside
this feature entirely — no `AudioContext` is created and no microphone is read.

**The span:** the run, from the first countdown to the last shot — about 16 s of playback,
reconstructed from timestamps rather than recorded live. Not the pre-capture booth, the
arrange step, the result screen, or single-slot retakes.

## Decisions worth stating up front

| Question | Decision | Why |
| --- | --- | --- |
| What fills the frame? | **The strip preview** | It is the artefact of the session and reads at thumbnail size in a way four small faces do not. Chosen over the live camera grid and over a split of both. |
| Live camera anywhere in it? | **No** | A live feed inside the next slot was built and removed from the booth UI on request (2026-08-26). This holds to that. |
| Video or GIF? | **GIF** | Silent, five frames, loops inline everywhere, no `MediaRecorder`, no iOS codec story, no per-frame capture during a live call. |
| Captured live or built after? | **Built at `finishCapture`** | Frames + delays need drawing, not capturing. Zero cost during the run, and the output is deterministic rather than dependent on what the browser managed to sample. |
| Opt-in? | **No — every completed run builds one** | With nothing captured live, an opt-in would gate only whether we spend ~300 ms in a worker. A control that guards nothing is a control not worth the room it takes on the stage. |
| Audio? | **None** | GIF has no audio track. Removes the mic, the `AudioContext` and the whole consent surface of a recorded conversation. |
| Frame timing | **Real, from `takenAt`** | The gaps between shots are already recorded on every cut. Inventing a delay would be inventing a session. |
| Single-slot retake? | **Not included; the GIF stands** | It is a record of the take, not of the strip. |
| "Retake all"? | **Discards it; the new run builds a new one** | `usePhotosStore.reset()` already means "this strip never happened". |
| Survives a refresh? | **No** | Nothing is persisted. Named in the UI copy so it isn't a surprise. |
| Uploaded / sold / in the cart? | **No** | Never stored. Note the size argument is now weak — a GIF is comparable to a strip's WebP — so this rests on the promise, not on cost. |
| Where can it be saved? | **The result screen, and nowhere else** | One surface means one piece of copy to get right about it being gone afterwards. |
| Limited to a single press of Save? | **No — one *place*, not one *press*** | A failed download or a cancelled iOS share sheet would otherwise strand the user with a dead button. |
| Signed-out users? | **Yes, identically** | The gate on strips is storage; the gate on the clean copy is payment. This has neither. |
| A peer leaves after the run? | **Discarded**, after a grace window, with a warning on the result screen | Every frame holds their face, and nobody announced that a GIF was being made — so their departure ends its licence to exist. |
| Watermarked? | **No** in v1 | Not a paid deliverable, so there is no free/paid split to defend. |

### Deliberately out of scope

- Upload to R2, the cart, gallery, checkout or share card. Those are strip-shaped
  (thumbnails, print copies, `paid` splits).
- Any client-side persistence: no IndexedDB record beside `guestStripsDb`, no entry in the
  booth draft, no blob URL handed to another route.
- Animating anything but the run — no arrange step, no finished-strip flourish.
- Server-side encoding. The browser does it, once, in a worker.

---

## Files

**New**

| File | What |
| --- | --- |
| `src/constants/sessionGif.ts` | Height, colour count, delay clamps, `PEER_LEFT_DISCARD_MS`. |
| `src/utils/sessionGif.ts` | `buildSessionGif({ frames, order, template })` → `Blob`. Draws the five states, hands them to the worker. |
| `src/utils/sessionGif.worker.ts` | Quantise + encode, off the main thread. |
| `src/store/useSessionGifStore.ts` | `status`, `gif`, `error`. No preference — nothing persists. |
| `src/hooks/useSessionGif.ts` | Watches the capture lifecycle; triggers the build; owns discard + cleanup. |
| `src/features/compose/SessionGif.tsx` + `.module.scss` | Result-screen preview + save button. |

**Changed**

| File | Change |
| --- | --- |
| `src/utils/composeStrip.ts` | Export `loadImage` and a new `drawSlotImage(ctx, img, slot, width, height)`, factored out of its photos-into-slots loop, so the GIF and the finished strip crop a cut into a slot by one implementation. |
| `src/env.ts` + `.env.example` | `sessionGifEnabled` flag. |
| `src/features/media/CameraStage.tsx` | Mount `useSessionGif()`. One line — **no markup change**, and `CameraStage.module.scss` is not touched at all. |
| `src/features/compose/StripResult.tsx` | Render `<SessionGif />` under the strip actions, outside every auth branch and on the `saveFailed` screen too. |
| `src/utils/download.ts` | Generalise `saveImageBlob` → `saveFileBlob` (same iOS share-sheet logic, arbitrary mime). |
| `src/locales/{en,id}/translation.json` | New `sessionGif.*` block. |
| `package.json` | `gifenc`. |

### The encoder

**`gifenc`** — small, modern, ESM, MIT, and it exposes quantisation and palette control
per frame, which is what keeps four photographs legible in 256 colours. `gif.js` is the
better-known option, is a decade old, ships its own worker file that Vite has to be told
to copy, and quantises worse.

Two rules for wiring it in:

- **Dynamic `import()`, inside the build path.** The feature is flagged off by default;
  nobody who never records should pay for the encoder in the main bundle.
- **Encode in a Web Worker** — `new Worker(new URL('./sessionGif.worker.ts', import.meta.url), { type: 'module' })`,
  which Vite bundles natively. Quantising five 320x960 frames is tens of milliseconds each
  on a laptop and can be several hundred on a phone; that must not land on the main thread
  while the arrange step is animating in. Transfer the `ImageData` buffers rather than
  copying them.

---

## Phase G0 — Flag, store, i18n

**Goal:** the file has somewhere to live and a flag deciding whether it is built at all.

**Tasks**

- `src/constants/sessionGif.ts`:
  ```ts
  export const GIF_HEIGHT = 960           // width follows template.aspect (4x1 → 320x960)
  export const GIF_MAX_COLORS = 256       // per-frame palette; drop to 128 if size demands
  export const GIF_MIN_DELAY_MS = 400     // floor, if two cuts land oddly close together
  export const GIF_MAX_DELAY_MS = 6_000   // ceiling, so a stalled shot can't freeze the loop
  export const GIF_FINAL_DELAY_MS = 2_500 // the full strip holds before the loop restarts
  export const PEER_LEFT_DISCARD_MS = 10_000 // grace before a departure clears it
  ```
- `src/store/useSessionGifStore.ts` — **nothing persists**; there is no preference to keep:
  ```ts
  type GifStatus = 'idle' | 'building' | 'ready' | 'error'
  interface SessionGifState {
    status: GifStatus
    gif: { blob: Blob; url: string; width: number; height: number } | null
    error: 'failed' | null
    setStatus(s: GifStatus): void
    setGif(gif: Gif | null): void   // revokes the previous object URL
    reset(): void                   // revokes + clears
  }
  ```
  `setGif` and `reset` **must** `URL.revokeObjectURL` whatever they replace — a session can
  produce several, and each pins its blob until revoked. Nothing here touches
  `localStorage`: the store is per-mount state, and the file is per-run.
- `env.ts`: `sessionGifEnabled: import.meta.env.VITE_SESSION_GIF_ENABLED === 'true'`,
  documented the way `paymentsEnabled` is, plus a commented block in `.env.example`.
- i18n `sessionGif.*` in **both** locales: `title`, `building`, `save`, `saving`, `saved`,
  `failed`, `notKept`, `alt`, `peerLeftClearing`, `peerLeftCleared`. Every string belongs to
  the result-screen card now — no chip labels, no tooltip. `notKept` — "this GIF isn't stored anywhere; download it before you
  leave" — is the load-bearing string of the whole feature; write it in Indonesian first
  and check it doesn't read as an error.

**No capability probe.** This is a plain 2D canvas plus an encoder: there is nothing to
feature-detect, and the browsers that would have failed a `MediaRecorder` check are exactly
the ones this now serves. The old `isRecordingSupported()` is gone.

**DoD:** the store round-trips its preference across a reload; both translation files have
the same key set.

---

## Phase G1 — Building the GIF

**Goal:** given a finished run, produce a looping `image/gif` blob.

**Tasks**

- **Factor the slot draw out of `composeStrip.ts`.** Two exports, no behaviour change:
  ```ts
  export function loadImage(src: string): Promise<HTMLImageElement>  // already exists, unexported
  export function drawSlotImage(                                     // the body of the photos forEach
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    slot: PhotoSlot,
    width: number,
    height: number
  ): void
  ```
  `drawSlotImage` carries the rounded-corner clip (`slot.radius` → `roundRect` + `clip`) and
  the cover crop, so a cut is cropped into a slot by **one** implementation and the GIF can
  never disagree with the strip. `composeStrip` calls it inside its existing loop.
- **`buildSessionGif({ frames, order, template, runStartedAt })`:**
  1. Canvas: `height = GIF_HEIGHT`, `width = round(height * template.aspect)`, both even.
  2. `loadImage(template.src)` once; on failure fall back to a white fill, as `composeStrip`
     does — a missing SVG must not cost the animation.
  3. Decode every cut once (`loadImage(frame.dataUrl)`), in slot order.
  4. Draw **five states** — art + the first *n* cuts + placeholders + the ring on slot *n* —
     for n = 0..4, pulling each canvas's `ImageData` as it goes. The n=4 state has no ring:
     the strip is done.
  5. Delays: `clamp(takenAt[n] - takenAt[n-1], GIF_MIN_DELAY_MS, GIF_MAX_DELAY_MS)` for the
     middle beats; `takenAt[0] - runStartedAt` for the opening frame (falling back to
     `COUNTDOWN_SECONDS * 1000` when a restored draft has no start); `GIF_FINAL_DELAY_MS`
     for the last.
  6. Hand the `ImageData` array + delays to the worker. It quantises **per frame** — each
     frame gains a photograph, so one shared palette would be tuned for the wrong picture —
     writes the frames with `loop: 0`, and posts back the bytes.
  7. Return `new Blob([bytes], { type: 'image/gif' })`.
- **`useSessionGif()`** — no arguments — mounted in `CameraStage` beside `useCaptureSequence`:
  - Stamps `runStartedAt` when `isCapturing` goes true — the only thing it needs from the
    start of a run, since there is no preference to read.
  - When `isCapturing` goes false with `frames.length >= SHOT_COUNT` → `setStatus('building')`,
    call `buildSessionGif`, `setGif` on success. A single-slot retake (`retakeSlot !== null`)
    is not a completed run and builds nothing.
  - Any other exit — retake-all, cast change, offline stop, unmount — simply never builds.
    There is nothing to cancel; that is the point of building after the fact.
  - Cleanup on unmount: terminate any live worker, `reset()`.
  - Wrap the build in try/catch → `status: 'error'`, toast `sessionGif.failed`. **A failure
    here must never touch the strip.**

**Timing note.** The build starts at `finishCapture` — for *every* run, including ones the
user then throws away with "Retake all". That is deliberate: it is a worker doing a few
hundred milliseconds of work in the gap while someone chooses stickers, and moving it to the
result screen instead would put it in competition with `composeStrip`, which is the one piece
of work on that screen the user is actually waiting for. It starts exactly as the user is
moved to the arrange step, where they will spend seconds choosing stickers. Encoding in a worker means
that step never stutters, and the GIF is long finished by the time the result screen exists
to show it. If the worker is somehow still going, the card shows `sessionGif.building`
rather than nothing.

**DoD:** a solo run produces a GIF that opens on an empty template, gains a cut per beat in
the right slot and order, ends on the full strip, and loops; playback timing matches the
session (stopwatch, ±1 s); a 4x1 gives 320x960 and a 2x2 640x960; file size recorded in
`PROGRESS.md`; no long task on the main thread (Performance panel).

---

## Phase G2 — Delivering the file (result screen only)

**Goal:** the user gets the GIF, from one place, while they still can.

**The rule:** `SessionGif` is rendered by **`StripResult` and nothing else**. The booth has
nothing to show yet, and the arrange step deliberately doesn't get it either — offering the
animation next to a strip the user hasn't created invites them to take it and abandon the
strip. It appears when the strip does.

**Tasks**

- Generalise `download.ts`: `saveImageBlob` → `saveFileBlob(blob, filename)` with the
  identical iOS branch (non-Safari iOS → `navigator.share({ files })`, everything else →
  `<a download>`); keep `saveImageBlob` as a thin alias so existing call sites don't churn.
  A GIF *is* an image, so iOS "Save Image" puts it in Photos, where it animates.
- `SessionGif.tsx`, rendered beneath the existing action row:
  - Nothing when `gif === null` and `status !== 'building'`.
  - **`<img src={gif.url} alt={t('sessionGif.alt')} />`** — a GIF animates and loops in an
    `<img>` on its own. No `<video>`, no controls, no autoplay policy to satisfy.
  - A **Save GIF** button → `saveFileBlob(blob, \`momoto-${resultId ?? Date.now()}.gif\`)`.
  - Size in the meta line, so a chunky file is not a surprise on mobile data.
  - **`sessionGif.notKept` is not fine print.** It is what makes the no-storage decision
    honest — "this GIF isn't stored anywhere; download it before you leave" — beside the
    button, not under a fold. It stays after a successful save: the file is theirs, the blob
    in the page still isn't.
  - The button stays live after a save. Pressing it twice is not a bug worth guarding
    against; a cancelled iOS share sheet with no way to retry is.
  - **The peer-left warning** (see G3): while the grace timer runs, the card shows
    `sessionGif.peerLeftClearing` in place of `notKept` and the Save button takes visual
    priority. When it fires, the card is replaced by `sessionGif.peerLeftCleared` rather than
    vanishing — a card that disappears mid-read looks like a bug.
- **A leave guard, one line of it.** While an unsaved GIF exists, a `beforeunload` handler
  asks before a refresh or tab close — the same protection `capture.leftBooth` gives a
  running sequence. In-app navigation (Leave, cart, gallery) is *not* intercepted: the user
  chose to go, and a modal between them and the door costs more than a lost bonus.
- **Render it on the `saveFailed` screen too** (`StripResult` line ~424), not only the ready
  one. The GIF is finished and correct whether or not `POST /strips` — or the guest IndexedDB
  write — worked; hiding it there spends a good animation on an unrelated failure, on the
  screen where the user has least to show for the session.
- **No auth branch anywhere.** `StripResult` forks on `isAuthenticated` for the cart copy
  (`savedToCart`/`savedOnDevice`, `leadSignedIn`/`leadGuest`, `signInToSave`). `SessionGif`
  sits outside every one of those and reads identically for both. A future edit writing
  `isAuthenticated &&` around it is the bug.

**Lifetime.** The GIF outlives the result screen only as far as the same strip:
`backToReview()` → Create again returns to the same result with the same file, because that
is one run being re-arranged. Anything meaning "this run is over" revokes it — see G3.

**DoD:** it animates in Chrome, Safari and Android Chrome; Save produces a correctly named
`.gif` on desktop and Android; on Chrome for iOS the share sheet opens and "Save Image" lands
an animating GIF in Photos; no save affordance exists anywhere but the result screen;
back-to-arrange and forward again keeps the same file; **a signed-out guest gets the identical
card and file**, including on `saveFailed`.

### Interaction with the beta gate

`VITE_BETA_MODE=true` puts the whole booth behind the login wall, so during the closed beta
there are no signed-out users in a room to test with — the guest path is exercised with the
flag off. Nothing here reads `betaMode`; that gate is upstream at the route.

---

## Phase G3 — Lifecycle edges

Shorter than the video plan's: with nothing running during the capture, most "abort" paths
are simply "never build".

| Event | Build | File |
| --- | --- | --- |
| Run completes (`finishCapture`) | runs in the worker, every time | held in memory; surfaced once the strip is created |
| Arrange step (`reviewing`) | — | held, but **not offered** — no save button here |
| Result screen | — | offered; the only exit |
| Back to arrange then Create again | — | same file, same run |
| Single-slot retake | never runs | kept as-is |
| "Retake all" (`photos.reset()`) | — | discarded + URL revoked |
| A fresh run starts (`startCapture`) | — | previous file revoked before the new build, so two blobs are never resident |
| Cast change / offline stop mid-run | never runs | none |
| Tab hidden mid-run | irrelevant — nothing is sampling anything | unaffected |
| User navigates away from the room | — | discarded + revoked (unmount) |
| Session timer expires | — | discarded + revoked with the booth |
| **Someone in the GIF leaves the room** | — | **discarded** — see below |
| Encoder throws | — | none; `status: 'error'`, toast, strip untouched |

**The rule underneath all of them:** a GIF failure must never affect the strip. The strip is
the product; this is a bonus.

### Someone in the GIF leaves the room → the GIF goes with them

Every frame holds the other people's faces, and — since nothing in the booth announces it —
they do not know it exists. So their departure takes it: **when the room's
membership drops below the cast the run was shot with, the file is discarded and its URL
revoked**, on the result screen as much as anywhere else.

The measure is the one the booth already uses, `captureMembers` — the cast pinned when the run
started:

```ts
const castBelow = peerIds.length + 1 < usePhotosStore.getState().captureMembers
```

Not live streams, and not "any membership change": someone **joining** later is not in it and
takes nothing away. Solo never trips it (`captureMembers === 1`).

**It must not fire on a blip, and the server gives it no help.** `roomHandlers.ts` emits
`room:peer-left` straight from the socket's `disconnect` — no server-side grace, only a check
that the slot wasn't already reclaimed by a reconnect. A peer's three-second hiccup shrinks
`peerIds` on our side and would, unguarded, destroy a finished file. Gate it behind
`PEER_LEFT_DISCARD_MS` (10 s), cancelled if they come back. And never key it off `roomStatus`:
our own socket dropping leaves `peerIds` stale rather than shrinking it.

**The cost of this rule, stated plainly.** People do not leave in lockstep. The common shape
is: both finish, one saves and closes the tab, the other is still looking at their strip — and
loses their GIF to their friend's exit. So on the **result screen** the discard is announced
before it happens (`peerLeftClearing`), with the grace window as the chance to press Save;
elsewhere it is silent, because the file isn't reachable there.

**DoD:** each row exercised by hand; after ten runs in one session the devtools heap snapshot
is flat — no retained blobs, no retained canvases, no orphaned workers.

---

## Phase G4 — Design + measurement pass

- Skin `SessionGif` to the result screen's language. It is the only surface this feature
  has, so it carries all of the design work — and it must not compete with the strip: the
  strip is what the screen is for, the loop is what you take away from it.
- **Measure the file.** This is the number that decides whether the feature ships as designed:
  five 320x960 frames of quantised photography. If a 4x1 comes back much over ~1.5 MB, spend
  `GIF_MAX_COLORS` (256 → 128) before spending `GIF_HEIGHT` — banding in a looping thumbnail
  costs less than a strip nobody can read. Record both in `PROGRESS.md`.
- Measure encode wall-time on a real mid-range Android and an iPhone, and confirm the arrange
  step does not stutter while it runs.
- Record the decision in `DECISIONS.md`, including why this is a GIF and not a video.

---

## Verification

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Manual matrix — solo / date / group x Chrome desktop / Safari desktop / Android Chrome / iOS
Safari / iOS Chrome, with the flag on:

1. **The booth is visually unchanged** with the flag on — no new control anywhere on the
   stage, in the rail, or in the phone action bar. Diff the booth against `main` at 375 px
   and 1280 px if in doubt.
2. Run → the GIF opens on the **empty template**, gains a cut per beat in the right slot and
   order, ends on the full strip, and loops. Last frame vs. the composed strip: same cuts,
   same slots, minus filter/stickers/footer.
3. Playback timing tracks the real run within ~1 s end to end.
4. One peer's camera off → their cell is black inside each cut, exactly as on the paper.
   With the flag **off**: no card on the result screen and no encoder chunk in the network
   tab (proves the dynamic import didn't ship eagerly).
5. Single-slot retake after a run → GIF unchanged, strip updated.
6. Retake all → old file revoked, new run builds a new one.
7. Refresh mid-arrange → shots restored, GIF gone, no dangling card.
8. **Nothing offers it outside the result screen** — booth, arrange, cart, gallery, and a
   reload of `/cart` afterwards show no trace.
9. Save, then Save again → a second file, no dead button. Cancel an iOS share sheet → the
   button is still there.
10. Two runs in one room → the first blob is revoked (one resident, not two).
11. **Signed out, `VITE_BETA_MODE=false`** → full run start to finish; nothing prompts for an
    account, and the file is byte-comparable to a member's from the same run.
12. Signed out **and** the strip save fails (block `POST /strips`) → the `saveFailed` screen
    still shows and saves the GIF.
13. **Peer leaves after a run** (close their tab from the result screen) → warning appears,
    Save still works during the window, card and file clear after `PEER_LEFT_DISCARD_MS`, URL
    revoked.
14. **Peer blips** (~3 s offline, then back) → the warning may appear but the file
    **survives**; the grace timer is cancelled on their return.
15. Our own socket drops while a peer stays → nothing is discarded.
16. Group room of 4: one of three peers leaves → discarded. A fifth person joining after the
    run → nothing happens.
17. **Result screen at 375 px and 1280 px:** the card sits under the strip actions without
    pushing Save/Share off the fold, and a 1:3 loop doesn't stretch the column on a phone.

## Open questions

1. **Condense the loop?** Real timing gives a ~16 s loop, which is long for a GIF; a fixed
   ~1.2 s per beat would give a snappy ~6 s one that reads better in a chat thread. Against: it
   stops being a record of the session and becomes a montage. Default stays real.
2. **Should the countdown be visible?** It is a `fillText` into the ringed slot per frame and
   the store holds `countdown`. My read: no — the numbers are UI, and a clean loop of four
   photos landing ages better than one with a HUD burnt in.
3. **Pad to a social aspect?** A 4x1 encodes as 320x960 (1:3), which no platform crops kindly.
   Letterboxing onto 540x960 with the template's background behind it would post cleanly for
   one extra `fillRect`, at the cost of no longer being a faithful recording of the preview.
4. **Should the room be told a GIF gets made?** This is the question the discard-on-leave rule
   stands in for, and removing the toggle sharpened it: there is no longer any moment where a
   person sees that this is happening. Nobody's copy leaves their own device, so this is not a
   recording being distributed — but every member ends the run holding an animation of
   everyone else's faces, and none of them were told. Cheapest honest fix is a line in the
   booth's tips or on the result card ("everyone in the room gets one of these"), which needs
   no socket event at all; the fuller one is a `recording:state` relay and a way to refuse.
   Worth deciding before the flag goes on in production.
5. **Should it carry a mark?** It is the one free, unwatermarked, account-less artefact the
   booth gives away — arguably the point (a keepsake, and a reason to tell a friend), arguably
   a small hole. One `drawImage` per frame if the answer changes. My read: leave it clean in
   v1; adding a watermark later is a one-liner, removing one from a released feature is not.
