# Momoto Frontend — Puzzle Together (jigsaw)

Plan for the frontend half of the second activity: **Puzzle Together**. Two people in
one room see the same jigsaw, scattered around a board, and finish it together while
their cameras stay on. The backend half — typed rooms, the authoritative board, the
wire contract — lives in `../momoto-core/PLAN-puzzle.md`; this doc consumes it.

**Legend:** DoD = Definition of Done.

## Concept

- **Same room, different body.** A puzzle session is the booth's session with the
  capture swapped out: mint a code, share it, wait in a lobby, both arrive, a clock
  starts, the cameras stay live the whole time, the host finishes. All of that already
  exists in `RoomPage` — it just has `CameraStage` hard-wired into the middle of it. The
  first real piece of work is separating the room from the activity.
- **The cameras never leave.** Established rule: the camera rail stays on every screen
  of a running session. In the puzzle that is not decoration — watching each other
  react to a piece landing *is* the activity. The board sits in the main column, the
  two video tiles in a rail beside it (below it on a phone).
- **The server holds the board.** Positions, locks and "is it placed" come from the
  backend, not from the host. This is a deliberate break from the strip's host-
  authoritative sync, and the reason is the peer-drop rule: whoever is left must be
  able to carry on, and under host authority the host's tab closing would take the
  board with it. See the BE plan.
- **Optimistic locally, corrected by the server.** Dragging is local and instant; the
  snap test runs client-side from the same pure rule the server uses, so a piece clicks
  home the moment you let go. The server's `puzzle:placed` is what stands if the two
  ever disagree — and its full `puzzle:state` is the reconcile path after a reconnect.
- **Normalized coordinates, never pixels.** Everything on the wire is relative to the
  finished board rect. A phone and a laptop then render the same board at different
  sizes without either one knowing about the other's viewport.
- **It ships dark.** `VITE_PUZZLE_ENABLED` gates the activity card, the routes and the
  join-by-code routing, the way payments shipped behind their flag. In the closed beta
  the puzzle routes sit behind `ProtectedRoute` with the booth routes.

## Where the pieces live

```
src/pages/PuzzlePage.tsx            entry: solo / duo / join by code (mirrors PhotoboothPage)
src/pages/PuzzleRoomPage.tsx        the room, built on the shared shell
src/components/room/RoomShell.tsx   extracted from RoomPage — join, clock, leave, tips
src/features/puzzle/
  PuzzleBoard.tsx                   board + scatter area, pointer handling
  PuzzlePiece.tsx                   one clipped SVG piece
  PuzzleSetup.tsx                   host picks image + difficulty (pre-start)
  PuzzleResult.tsx                  completion screen
  puzzleGeometry.ts                 seed → edge paths (pure, FE-only)
  puzzleRules.ts                    homeOf / snaps / SNAP_TOLERANCE (mirrors the BE)
src/store/usePuzzleStore.ts         board state + local drag state
src/hooks/usePuzzleSync.ts          socket ↔ store
src/constants/puzzle.ts             difficulties, preset images, PUZZLE_SESSION_SECONDS
src/assets/puzzles/                 preset images
```

## Rendering — one SVG per piece

A piece is an absolutely-positioned `<svg>` whose `viewBox` covers its cell **plus the
tab bleed** on all four sides, containing an `<image>` of the whole puzzle picture
offset so that piece's region shows, clipped by a `<clipPath>` holding the piece's
outline path.

- Scales cleanly: the board is a `%`-sized container and every piece is a fraction of
  it, so a resize is a re-layout, not a re-render of geometry.
- Real jigsaw edges, not a grid of rectangles — the tabs are what make it read as a
  jigsaw at a glance. Edges are generated once from the seed: each interior edge is a
  cubic-bezier tab, its direction (in/out) picked by the seeded PRNG, and neighbouring
  pieces share the *same* edge path mirrored, so they interlock exactly.
- One `<image>` element per piece referencing one URL: the browser decodes the bitmap
  once. 48 pieces is well inside what this handles smoothly; the difficulty ceiling
  stays there.
- `will-change: transform` on the held piece, `transform: translate3d(...)` for motion.
  Never re-layout during a drag.

## Store shape

```ts
interface PuzzleState {
  phase: 'setup' | 'playing' | 'complete'
  seed: number; rows: number; cols: number; imageId: string
  pieces: { x: number; y: number; placed: boolean; heldBy: string | null }[]
  /** Piece this client is dragging — local only, never on the wire. */
  dragging: number | null
  startedAt: number | null; elapsedMs: number | null
}
```

`heldBy` carries the peer's socket id, so a piece the other person is holding renders
with their accent colour and ignores our pointer. That colour is the whole "we are both
here" signal on the board, and it costs nothing extra.

---

## Phase F0 — Extract the room shell *(refactor, no new feature)*

**Goal:** `RoomPage`'s room-ness is reusable, and the booth behaves exactly as it does
today.

This is the riskiest phase in the plan and the reason it goes first, alone.
`RoomPage` currently carries eight interlocking rules that took real incidents to get
right — the peer-drop-keeps-the-booth rule, the rejoin-refusal-vs-join-refusal split,
the leave/finish confirm blockers, the draft lifecycle. None of them are photobooth-
specific, and none of them may change here.

**Tasks**
- `components/room/RoomShell.tsx`: everything in `RoomPage` except `<CameraStage/>` and
  the booth-specific draft hook, taking `{ activity, children }` and rendering the
  terminal screens (connecting / not found / full / ended / time's up) around them.
- Move the booth-only bits behind an `activity === 'photobooth'` guard or into props:
  `useBoothDraft`, `useStripSync`, `keepResult` (which reads `usePhotosStore.selection`
  — the puzzle's equivalent is `phase === 'complete'`, so make it a prop:
  `keepAfterEnd: boolean`).
- `RoomPage` becomes a thin wrapper: shell + `CameraStage`.
- `useSessionTimer(mode)` takes the session length as an argument instead of importing
  the booth's constant.

**DoD:** a full manual booth pass (solo, duo, guest join, host finish, peer drop
mid-capture, refresh mid-session, expiry) behaves exactly as before; the diff touches
no logic, only its location; `typecheck` + `lint` clean.

## Phase F1 — Typed rooms on the client

**Goal:** a code carries its activity, and a pasted code lands in the right place.

**Tasks**
- `types/roomsType.ts`: `RoomActivity = 'photobooth' | 'puzzle'`; `MintRoomRequest`;
  `RoomStatusResponse` gains `activity: RoomActivity | null`.
- `api/services/roomsService.ts` + `utils/rooms.ts`: `requestRoomCode(activity)`,
  `lookupRoom` returns `{ status, activity }`.
- Join-by-code (both entry pages): on `open`, navigate to the route for the **returned**
  activity, not the page you typed it into. Someone handed a code has no idea which
  activity it is, and being told "that code is fine, but not here" would be a bug
  wearing a message.
- `constants/routes.ts`: `puzzle: '/puzzle'`, `puzzleRoom: '/puzzle/room/:roomId'`.
- `app/App.tsx`: add both to `boothRoutes` (rename it `sessionRoutes`) so the beta wall
  covers them identically; wrap in `env.puzzleEnabled`.
- `env.ts`: `puzzleEnabled` (`VITE_PUZZLE_ENABLED`), documented next to `betaMode`.

**DoD:** a puzzle code typed into the photobooth join box opens the puzzle room; a
photobooth code typed into the puzzle join box opens the booth; with the flag off,
neither route exists and the activity card reads "coming soon".

## Phase F2 — Entry page, activity card, i18n

**Tasks**
- `constants/activities.ts`: add `{ key: 'puzzle', Icon: Puzzle, to: ROUTES.puzzle,
  available: env.puzzleEnabled }`. (`ActivitiesGrid` already renders both states.)
- `pages/PuzzlePage.tsx` + module.scss: solo / duo cards and the join form, structurally
  the same as `PhotoboothPage`, with a small animated sample board instead of the strip.
- `locales/en` + `locales/id`: `activities.items.puzzle.*`, plus a `puzzle.*` block
  (entry copy, difficulties, setup, board hints, completion, tips). Both files, same
  keys — a missing `id` key renders the raw path.

**DoD:** `/puzzle` renders and mints a room; the activity card is live on the landing
page and `/activities`; no untranslated key paths in either language.

## Phase F3 — The puzzle engine, offline first

**Goal:** a fully playable **solo** jigsaw with no server involved. Solo is not a
throwaway here — it is how the whole engine gets built and debugged without two tabs,
exactly as solo booth mode works today (it never connects).

**Tasks**
- `constants/puzzle.ts`: difficulties (`easy 3×4`, `medium 4×6`, `hard 6×8`), the preset
  image list (4:3, bundled in `assets/puzzles/`), `PUZZLE_SESSION_SECONDS = 600`
  (**must equal the backend's `PUZZLE_SESSION_DURATION_MS`** — the same hand-matched
  pair as `SESSION_SECONDS` / `SESSION_DURATION_MS`).
- `puzzleRules.ts` (mirrors the BE file exactly) and `puzzleGeometry.ts` (seeded PRNG →
  interlocking edge paths, pure and unit-testable).
- `PuzzlePiece.tsx`: the clipped SVG above.
- `PuzzleBoard.tsx`: board rect + scatter margin, pointer-capture drag, optimistic snap
  on release, a subtle click/land animation, z-ordering (held piece on top, placed
  pieces at the bottom and non-interactive).
- `PuzzleSetup.tsx`: image + difficulty picker, then Start. Picked **before** the board
  exists, the way the strip template is picked before capture.
- `usePuzzleStore.ts` with a local `startSolo()` that mints its own seed and scatter.

**DoD:** at `/puzzle/room/XXXX?mode=solo` a board scatters, pieces drag, correct drops
snap and lock, the last piece completes it; smooth at 48 pieces on a mid-range phone;
resizing the window mid-game moves nothing.

## Phase F4 — Multiplayer sync

**Tasks**
- `hooks/usePuzzleSync.ts`, the puzzle's `useStripSync`:
  - Host relays `puzzle:setup` on change and again on `room:peer-joined` (late-join
    catch-up, same pattern as the strip).
  - Host `puzzle:start` → both apply the server's `puzzle:state`.
  - Pointer-down → optimistic pick-up + `puzzle:grab`. **Roll back if no
    `puzzle:grabbed` arrives within ~400ms** (silence means refused — the other person
    got there first), and put the piece back where it was.
  - Drag → `puzzle:move` throttled to one emit per animation frame.
  - Pointer-up → local snap + `puzzle:drop`; `puzzle:placed` overwrites whatever we
    guessed.
  - `puzzle:moved` from the peer → animate their piece under their accent colour.
  - `puzzle:state` at any time → replace wholesale (reconnect, correction).
- Peer-left: the board keeps working, single-handed. Nothing unmounts, nothing resets —
  the same rule the booth follows.

**DoD:** two tabs; both drag at once without stealing each other's pieces; a
simultaneous grab of the same piece resolves to one holder with no visible flicker on
the loser; killing one tab mid-drag frees the piece within a second and the survivor
finishes alone; reloading rejoins the board mid-game with the clock resumed.

## Phase F5 — The room around the board

**Tasks**
- `PuzzleRoomPage.tsx` = `RoomShell` + setup/board/result, with the camera rail beside
  the board (below it under ~900px). Reuse `useUserMedia`, `usePeerConnection`,
  `PeerVideo`, `MediaControls` untouched.
- Lobby copy for the waiting host (reuse `RoomLobby` with an activity prop).
- `PuzzleResult.tsx`: the finished image, the elapsed time, both names, and a Play-again
  that re-runs setup inside the same room while the window still has time on it.
- Tips (`BoothTips` is stage-driven — add puzzle stages: setup, board, complete).
- Timer: the shell's clock, at `PUZZLE_SESSION_SECONDS`. A completed board stays on
  screen until the window ends or the host finishes.

**DoD:** the full duo flow start to finish with cameras live throughout; expiry closes
both members out exactly as the booth does; the Finish confirm is host-only.

## Phase F6 — Polish, mobile, a11y

**Tasks**
- Phone layout: board fills the width, scatter margin tightens, tiles go to a bottom
  strip. Touch drag with `touch-action: none` on the board only, so the page still
  scrolls elsewhere. Verify at 375px.
- Keyboard path: arrow keys nudge the focused piece, Enter picks up/drops, so the board
  is not pointer-only. Live-region announcement on each placement.
- A "peek" control: press and hold to fade the finished image in behind the board at low
  opacity. Cheap to build, and the thing everyone reaches for.
- Reduced motion: skip the snap animation, keep the state change.
- `DECISIONS.md` entries in both repos: *server-authoritative puzzle state* (and why it
  differs from the strip's host authority), *typed rooms*, *per-activity session length*.

**DoD:** playable one-handed on a phone; keyboard-only completion possible; no layout
shift when a piece lands.

## Phase F7 — Your own photos as the puzzle *(follow-up, not v1)*

The obvious ending: solve a jigsaw of a strip you took together in the booth. It needs
an image both members can load — private-bucket strips would need a signed URL scoped
to the room, and a guest has no server-side strips at all. It also breaks the 4:3
assumption (a strip is 1:3, so the grid must follow the image's aspect — worth building
F3's grid that way from the start even while only presets exist). Left as its own phase
behind the same flag.

## Verification

- Solo at every difficulty, desktop and phone.
- Duo across two devices on the same LAN: simultaneous grabs, one tab killed mid-drag,
  one tab reloaded mid-game, network throttled to 3G.
- Session expiry mid-puzzle and immediately after completion.
- Booth regression pass after F0 — the shell extraction is the only change in this plan
  that can break something that already works.

## Open questions

1. **Session length.** 10 minutes is a guess: long enough for 24 pieces, tight for 48.
   Worth watching in beta before fixing — it is one paired constant in two files.
2. **Difficulty ceiling.** 48 pieces is the point where an SVG-per-piece board stops
   being obviously smooth on a low-end phone. Raising it means a canvas renderer.
3. **Should a completed puzzle leave anything behind?** A shareable "we finished this in
   4:12" card would reuse `utils/composeShareCard.ts` almost as-is. It is the natural
   bridge to the cart, and equally the natural thing to skip in v1.
