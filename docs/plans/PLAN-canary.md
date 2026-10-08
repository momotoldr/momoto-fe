# Momoto Frontend — Canary Releases

How to release a new frontend build to a share of visitors first, watch it, then ramp it
up or roll it back. It uses Cloudflare Workers **gradual deployments**: a percentage
split between two versions of the same Worker on the same domain (`momotoldr.com`).

**Scope:** the frontend Worker only (`momoto-lab-fe`, `momoto-lab-fe-staging`). Backend
canaries on Railway are out of scope for now (see §9).

**Status (2026-10-08):** code done (T2, T2b, T3), uncommitted. Verified locally: lint,
typecheck, prettier, both workflows parse, a build bakes in
`appVersion:"v16",appCommit:"8212a2d"`, `rollout.mjs status` reads both live Workers, and
`previous`'s pick was dry-checked against staging's real deployment history. Not run yet:
anything that deploys. That starts with the staging drills (T4–T7b), after T1.

> **Revision 4 (2026-10-08):** rollout gets `previous` (undo a release even after it reached
> 100%) and `version` (go back to a named build such as `v14`). See §2.1.
>
> **Revision 3 (2026-10-08):** builds get readable names (`v16`, `staging-v48`) instead of
> a 7-character SHA; the SHA moves to its own `appCommit` field (§5.1).
>
> **Revision 2 (2026-10-08):** §6 rewritten from a list of risks to how each one is
> handled: pipeline guards, the socket-event and browser-storage rules (narrowed after
> confirming PeerJS carries no messages, and with the IndexedDB `VersionError` trap
> spelled out), a `[skip canary]` escape hatch and a PR template.

**Legend:** DoD = Definition of Done.

---

## 1. How Cloudflare does it

- **A version is not a deployment.** `wrangler versions upload` stores a build (script +
  static assets) as a new version and sends it no traffic. `wrangler versions deploy`
  chooses which versions serve traffic, and at what percentage.
- **A deployment holds at most two versions**, for example `old@90% new@10%`. Both serve
  the same routes (`momotoldr.com/*`).
- **Rolling back is just another deploy:** `old@100%`. There is no rebuild and no git
  revert, and it takes effect in seconds.
- **Version overrides:** a request carrying
  `Cloudflare-Workers-Version-Overrides: momoto-lab-fe="<version-id>"` is served by that
  version. This works only if the version is in the current deployment, and 0% counts.
  That lets CI test a new build on the real domain before any visitor gets it.
- **Version affinity:** by default, *every request* is routed to a version on its own. If
  a request carries `Cloudflare-Workers-Version-Key`, Cloudflare hashes it and always
  sends that key to the same version. We set this header with a zone Transform Rule (§3).

Our build is assets-only (no Worker script). Cloudflare supports gradual deployments for
static assets, and documents affinity as the fix for exactly our case (see §3).

## 2. What it looks like day to day

```
push to main
  └─ deploy.yml
       verify (ci.yml)
       build + deploy guard                         (unchanged)
       rollout.mjs upload  → new version, 0 traffic
       rollout.mjs stage   → stable@100%  new@0%
       smoke.mjs --version → tests the new version on momotoldr.com via the override header
       rollout.mjs set $CANARY_PERCENT → stable@90%  new@10%
         ([skip canary] in the commit → set 100 instead)
       (smoke fails → set 0: the new version is dropped, nobody ever saw it)

then, by hand, Actions → rollout → Run workflow (branch main):
       action 25 / 50        → ramp up
       action 100            → promote; old version leaves the deployment
       action 0              → roll back the canary; new version leaves the deployment
       action previous       → after a promotion: put the last fully-live build back (§2.1)
       action version + v14  → put a named build back at 100% (§2.1)
```

- `CANARY_PERCENT` is a **GitHub Environment variable**: `production` = `10`. On
  `staging` it is unset, which means 100. Staging then behaves as it does today, except
  that the smoke test now runs *before* the build goes live, not after.
- **Mid-rollout guard:** `stage` refuses while a deployment is still split (neither
  version at 100%). A push to `main` during a canary fails fast with
  "finish it or roll it back first", instead of silently replacing the canary or adding a
  third version. A 0% leftover from a failed smoke test does not count, and `stage`
  replaces it.
- **Next release after a promotion needs nothing.** "Stable" and "canary" are not fixed
  slots: they are worked out from the deployment each time (older = stable). After
  `100`, only the new build is left, so it *is* the stable one, and the next push stages
  the next build at 0% next to it:

  | Step | Deployment |
  |---|---|
  | v15 fully live | `v15@100%` |
  | push v16 → stage → canary | `v15@100% v16@0%` → `v15@90% v16@10%` |
  | rollout `100` | `v16@100%` (v15 leaves) |
  | push v17 → stage → canary | `v16@100% v17@0%` → `v16@90% v17@10%` |

- **Hotfix during a canary:** run rollout `0` (or `100` if the canary is fine), then
  re-run the deploy workflow.
- **Skip canary** (for releases that can't run next to the previous build, §6.4): put
  `[skip canary]` in the PR title. The squash commit's subject is the PR title, and
  `deploy.yml` checks the head commit message. The build is still uploaded, staged at 0%
  and smoke-tested, but then goes straight to 100%. A manual run of `deploy.yml` has the
  same option as a `skip_canary` checkbox.
- Both workflows share the concurrency group `deploy-<branch>`, so a ramp can never run at
  the same time as a deploy.

### 2.1 Undoing a release after it reached 100%: `previous` and `version`

Once a build is promoted, the old one is no longer in the deployment, so `0` has
nothing to go back to. The old build still exists as an uploaded version (Cloudflare
keeps the last 100), and two rollout actions bring it back:

- **`previous`:** puts back the build that was fully live (100%) **immediately before**
  the current one.
  - It reads `wrangler deployments list --json` (the 10 most recent deployments), walks back
    from the newest, and takes the first version other than the current one that was at
    100%. Every release's `stage` step records the old build at 100% (`v15@100% v16@0%`),
    so the build before a promotion is always within the last 3–5 deployments.
  - It refuses while a canary is in flight, telling you to use `0` instead.
  - It refuses if no earlier fully-live build is in the last 10 deployments, telling you to
    use `version` instead.
  - **Running it twice toggles back:** after `previous` takes v16 → v15, the build fully live
    before v15 is v16 again. That makes it a one-step undo, not a walk back through history.
    To go further back, use `version`.
- **`version`** with a version input such as `v14`: puts that named build back at 100%.
  - It resolves the tag through `wrangler versions list --json`, newest first. A re-run
    deploy can give two versions the same tag, and the newest wins.
  - It refuses while a canary is in flight, like `previous`.

Both deploy a single version at 100%, with no smoke test: the build has already served
real traffic. Neither touches git. The broken build stays on `main` until a fix is
pushed, and that fix goes out as a normal canary next to the restored build. **Storage
rules (§6.3) apply in full here:** this moves *every* visitor back at once.

## 3. Version affinity (Transform Rule, set up by hand)

**Why it is required:** `index.html` references `/assets/index-<hash>.js`. Without
affinity, a visitor can get the HTML from the old version and the JS from the new one,
which doesn't have that file. The result is a 404 and a blank page, for around 10% of
first loads at 10% canary.

**Key choice: `ip.src` (the visitor's IP).**
- Login is not a cookie: the access token is in localStorage, and the refresh cookie is
  scoped to `api.momotoldr.com`. Guests have no identity at all. So there is no cookie on
  `momotoldr.com` to hash.
- `ip.src` is the real visitor IP at Cloudflare's edge. (The `CF-Connecting-IP` problem
  only exists at Railway, behind the proxy.)
- Known limits: everyone behind one NAT, VPN or office gets the same version, which is
  fine. A phone switching from Wi-Fi to cellular can change version, but only between page
  loads, and the next load is consistent again.
- A side benefit: two friends in the same home who share a room land on the same version.

**Setup** (dashboard → zone `momotoldr.com` → Rules → Transform Rules → **Modify Request
Header** → Create rule). This is for you to click: the CI token only has Workers
permissions.

| Field | Value |
|---|---|
| Rule name | `workers-version-affinity` |
| When incoming requests match | Custom: `(http.host eq "momotoldr.com") or (http.host eq "staging.momotoldr.com")` |
| Then | **Set dynamic** · header `Cloudflare-Workers-Version-Key` · value `ip.src` |

It does nothing while only one version is deployed, so it is safe to add before
anything else ships. **DoD:** with a 50/50 split on staging, 20 reloads from one machine
all return the same entry script (`T5`).

## 4. Changes

| File | Change |
|---|---|
| `scripts/rollout.mjs` | **New (drafted).** `upload` / `stage` / `set` / `status`, plus `previous` and `restore <tag>` (§2.1). Calls wrangler with `--json` and the upload record (`WRANGLER_OUTPUT_FILE_PATH`), not by scraping text. It treats the older version in the deployment as stable and the newer as canary, so ramping needs no ids. Writes a traffic table to the job summary. |
| `scripts/smoke.mjs` | **Edited (drafted).** `--version <id>` adds the override header to every request. Checks are unchanged. |
| `.github/workflows/deploy.yml` | Checkout with `fetch-depth: 0`. A new step computes `APP_VERSION` (`v<n>` on main, `staging-v<n>` on staging, §5.1) for the build and the version tag. The `Deploy` step becomes upload → stage → smoke `--version` → `set <percent>`. The percent is `100` when the head commit message contains `[skip canary]` or the manual `skip_canary` input is ticked; otherwise `vars.CANARY_PERCENT`, or `100` if unset. A final `if: failure()` step runs `set 0` when anything after `stage` failed. The header comment's rollback note is updated. |
| `vite.config.ts` | `__APP_VERSION__` from `APP_VERSION` (was the SHA); new `__APP_COMMIT__` from `GITHUB_SHA` (§5.1). |
| `src/analytics/tracker.ts`, `src/vite-env.d.ts` | Add `appCommit: __APP_COMMIT__` to the batch context and declare it. |
| `.github/pull_request_template.md` | **New.** A "Release safety" checklist for the rules in §6 (socket events, browser storage, skip canary). |
| `.github/workflows/rollout.yml` | **New.** `workflow_dispatch` with an `action` choice input (`10`, `25`, `50`, `100`, `0`, `previous`, `version`) and a `version` text input, used only with `version`. The target follows the branch it runs on (`main` = production), in the same GitHub Environment as deploy. Concurrency group `deploy-<branch>`. Prints status before and after. |
| `package.json` | `deploy` / `deploy:staging` (local, by hand) stay as plain `wrangler deploy` (100% at once). Add `rollout:status` for a quick look. |
| `README.md` | Short "Releasing" section: how to ramp, roll back, and what to watch. |
| GitHub `production` env | Variable `CANARY_PERCENT=10`. (Your click.) |
| Cloudflare zone | The Transform Rule from §3. (Your click.) |

Rollback outside CI still works: `npx wrangler versions deploy <old-id>@100% --name
momoto-lab-fe --yes`, or dashboard → Deployments. Avoid `wrangler rollback`: it returns to
the previous *deployment*, which after a ramp is a split (for example `v15@50% v16@50%`),
not the previous build. `previous` (§2.1) is the safe version of it.

## 5. What to watch during a canary

- **momoto-analytics:** every tracking batch carries `appVersion`
  (`src/analytics/tracker.ts`), which becomes a readable number with §5.1. Compare error
  events and booth funnel completion (created → captured → strip saved) for the canary's
  version against the stable one's, for example `v16` vs `v15`.
- **Cloudflare dashboard** → Worker → Metrics: rollouts are drawn as bands (changelog
  2026-09-25), so a 4xx spike can be matched to a step.
- **Suggested hold:** at least one full evening of real sessions at 10% before going to
  100%. At beta traffic, 10% is a handful of sessions, so the main value right now is
  *instant rollback* and the *pre-traffic smoke test*, not statistics. When traffic
  grows, use 10 → 50 → 100.

### 5.1 Version names: `v16`, not `8212a2d`

Today `appVersion` is the first 7 characters of the commit SHA, which is hard to read in a
rollout table or an analytics query. It becomes a **build number**: the count of commits
on the branch being deployed, following only the branch's own line of history.

| Build | `appVersion` | `appCommit` | Cloudflare tag | Cloudflare message |
|---|---|---|---|---|
| production (`main`) | `v16` | `8212a2d` | `v16` | `v16 8212a2d [fix] confirm dialog focus` |
| staging (`staging`) | `staging-v48` | `c0ffee1` | `staging-v48` | `staging-v48 c0ffee1 …` |
| local (`npm run dev` / `deploy`) | `dev` | `dev` | (none) | |

- **Computed in CI:** `git rev-list --count --first-parent HEAD`. Production is **`v15`
  today** (main has 15 first-parent commits on 2026-10-08), so the first canaried build is
  around `v16`.
- **`--first-parent` keeps the step at +1 per push of one commit.** A promotion done as a
  merge commit (like the `merge -s ours` promotions) counts once, not once for every staging commit it
  brings along. A push carrying several direct commits still jumps by that many, which is
  harmless: higher always means newer.
- **`actions/checkout` needs `fetch-depth: 0`** in `deploy.yml`. With the default
  shallow clone the count is always `1`, so every build would be `v1`. The deploy guard
  should fail the build if the count is below 10, as a tripwire.
- **Deterministic:** re-running a deploy for the same commit gives the same number. Only
  rewriting `main`'s history would renumber, and the ruleset already blocks force-pushes.
- **Staging has its own count**, prefixed so the two can never be confused in one table
  or query.
- **The SHA stays, as `appCommit`,** in the analytics context and the Cloudflare message,
  so any version can still be traced to its exact code.
- **Analytics history:** batches sent before the switch have a SHA in `appVersion`;
  batches after it have `v…`. Queries that span the switch date need to handle both.

**Wiring:** `deploy.yml` computes `APP_VERSION` once, before the build, and passes it to
both the build and `rollout.mjs upload` (as the tag). `vite.config.ts` reads
`process.env.APP_VERSION || 'dev'` for `__APP_VERSION__` and adds `__APP_COMMIT__` from
`GITHUB_SHA`. The rollout status table shows the tag plus the commit from the message:

```
momoto-lab-fe:
   90%  v15  a3de506  5f1c2e7a-0b9d-4c1e-9a43-2d7e8f6b1c90
   10%  v16  8212a2d  e2a8d4f1-6c3b-47a0-b5d2-91f0c7e3a456
```

## 6. Risks and how each is handled

Three kinds of handling: **guards** the pipeline enforces by itself (§6.1), **rules** for
how code is written, kept visible by the PR template (§6.2–6.3), and an **escape hatch**
for releases that can't follow the rules (§6.4).

### 6.1 Guarded by the pipeline

| Risk | Handling |
|---|---|
| A broken build reaches visitors | Smoke test pinned to the new version while it has **0%** of traffic. On failure, `set 0` drops it, so no visitor ever sees it. |
| A bug that the smoke test can't see (socket, WebRTC, capture) | Exposure is capped at `CANARY_PERCENT`. Rollout `0` restores the old build in seconds, with no rebuild or revert. |
| HTML from one version, hashed JS from the other (blank page) | Affinity Transform Rule (§3). |
| A push stacks a new build on an unfinished canary | `stage` refuses while the deployment is split (§2). |
| Not seeing that the canary is worse | `appVersion` is on every analytics event; Cloudflare Metrics shows the rollout bands (§5). |
| Version overrides may not work on an assets-only Worker | Staging drill `T4` checks it first. Fallback: stage at 1% and smoke-test without pinning. |
| The version metadata binding needs a Worker script | Not needed: `appVersion` comes from the build. |

### 6.2 Mixed-version rooms → socket events change in two releases

Two people in one room can be on different builds. At 10% canary, about 18% of
two-person rooms are mixed (2 · 0.1 · 0.9). Fewer in practice, because two people on one
home network share an IP and so share a version, but plan for 18%.

**Checked 2026-10-08:** the two frontends exchange no data directly. PeerJS carries only
the camera media streams, and every message between them is a **realtime socket event**.
So the rule covers socket event names and payloads only:

- **Adding** an event or an optional field is safe. The old build ignores what it
  doesn't know.
- **Renaming, removing, or changing the meaning of** an event or field takes **two
  releases**. Release 1 sends both the old and new forms and accepts both. Release 2,
  after release 1 is at 100%, stops sending the old form. (`strip:arrange` →
  `strip:shots` done in one step would have broken every mixed room.)
- Backend-coupled changes are no different. Realtime has always had to tolerate tabs
  left open across a deploy.
- If a change truly can't be done in two steps, use the escape hatch (§6.4).

### 6.3 Browser storage → the old build must read what the new build writes

Raising the percentage moves visitors from stable to canary, and a rollback moves them
all back. So for a while the **old build reads what the new build wrote**.

- **IndexedDB:** `boothDraftDb` and `guestStripsDb` are both `DB_VERSION = 1`. If the
  canary bumps either to `2`, the database is upgraded on disk. After a rollback, the old
  build's `indexedDB.open(name, 1)` then fails with `VersionError`: booth drafts and
  not-yet-synced guest strips break for that visitor until the canary returns. **Rule:**
  never bump an existing `DB_VERSION` in a canaried release. Add a new database name or
  a new object store instead, or use the escape hatch.
- **localStorage** (auth token, landing stats cache, tracker ids): new keys and new
  optional fields are fine. Renaming a key or changing the format of a stored value
  follows the same two-release pattern as §6.2.

### 6.4 Escape hatch: `[skip canary]`

For a release that can't be made compatible with the previous build, a canary would
*create* the mixed rooms and rollbacks it is meant to protect against. Such a release
goes out with `[skip canary]` in the PR title (§2). It is still smoke-tested at 0%, then
goes to 100% at once, which is today's behaviour. The old build has then already left
the deployment, so undo is `previous` (§2.1), not `0`. §6.3 applies in full, so look
twice before undoing a release that changed storage.

### 6.5 Open tabs during a ramp (no action now)

A visitor whose key moves to the canary while their tab is open later fetches files of
the *other* version. Today the only file loaded after the first page is the segmentation
worker (`/assets/segmentation.worker-<hash>.js`, plus `/segmentation/*`), which only runs
behind `VITE_BACKDROPS_ENABLED` (off in prod). Normal deploys have the same issue. **When
backdrops ship:** a failed worker load should show a "please reload" message, not fail
silently.

### 6.6 PR template

`.github/pull_request_template.md` (new) carries the rules where they are needed:

```markdown
## Release safety (canary)
- [ ] No socket event or payload renamed/removed — or it is step 1 of 2 (sends and accepts both)
- [ ] No IndexedDB `DB_VERSION` bump, no localStorage key/format rename
- [ ] If either box can't be ticked: PR title contains `[skip canary]`
```

## 7. Tasks

| # | Task | DoD |
|---|---|---|
| T1 ✅ | Transform Rule (§3) — **you** (done 2026-10-08) | Rule live on both hosts; site still loads |
| T2 ✅ | Finish `rollout.mjs` + `smoke.mjs --version` | `node scripts/rollout.mjs status staging` prints the split locally (needs `wrangler login`) |
| T2b ✅ | Version names (§5.1): `vite.config.ts`, tracker context, version step in `deploy.yml` | A staging deploy's Cloudflare table and analytics batches show `staging-v<n>` and `appCommit` |
| T3 ✅ | `deploy.yml` (incl. `[skip canary]` / `skip_canary`) + `rollout.yml` + PR template + README + `package.json` | CI green on a PR; YAML lint passes; the PR shows the template |
| T4 | **Staging drill, pinned smoke:** set staging `CANARY_PERCENT=50`, push to staging | Job log shows `stage` → `smoke ok … (pinned to version …)` → 50/50 table |
| T5 | **Staging drill, affinity:** with the 50/50 split, reload `staging.momotoldr.com` 20× and run a booth with two browsers | Same entry script on every reload; booth completes; no asset 404s in the console |
| T6 | **Staging drill, ramp and rollback:** rollout `0`, deploy again, rollout `100` | Old version back within seconds; then new at 100% and old gone from the table |
| T7 | **Staging drill, guard:** push to staging while split 50/50 | Deploy fails at `stage` with the "mid-rollout" message, and nothing changes |
| T6b | **Staging drill, undo after promotion:** after T6 (new at 100%), rollout `previous`, then `previous` again, then `version` with the build before both | Old build at 100% → toggles back → named build at 100%; each in seconds |
| T6c | **Staging drill, refusals:** with a 50/50 split, rollout `previous`; then `version` with a tag that doesn't exist | Both fail with a clear message and change nothing |
| T7b | **Staging drill, skip canary:** with staging `CANARY_PERCENT=50`, merge a PR titled `… [skip canary]` | Smoke pinned at 0%, then straight to 100%; one version in the table |
| T8 | Unset staging `CANARY_PERCENT`; set production `CANARY_PERCENT=10` — **you** | — |
| T9 | First production canary on the next `staging → main` promotion | 10% live; ramp to 100 after watching §5 |

## 8. Decisions taken in this plan (change any of them)

- Canary is **automatic at 10%** on every push to `main`. Ramping up is **manual**: there
  is no time-based auto-promotion. With beta traffic there is too little signal to
  automate it.
- The ramp steps offered are **0 / 10 / 25 / 50 / 100**.
- **`previous` is a one-step undo that toggles.** Running it twice goes back to where you
  started; going further back is the job of `version`. It doesn't run a smoke test, because
  the build it restores has already served real traffic.
- The escape hatch is a **PR-title token** (`[skip canary]`), not a label: the squash
  commit carries it into `deploy.yml` with no GitHub API call. If the token is forgotten,
  running rollout `100` straight after the deploy does the same, with a few minutes of
  mixed traffic in between.
- **Version names are per-branch commit counts** (`v16`, `staging-v48`), chosen by the
  owner on 2026-10-08 over workflow run numbers, dates and semver. No manual bumping,
  and nothing extra to store.
- The rules in §6.2–6.3 are held by the **PR template checklist**, not by an automated
  check. A lint rule could catch a `DB_VERSION` bump later, if it is ever missed.
- **No separate `canary.momotoldr.com`** for now. A fixed canary URL for dogfooding needs
  CORS + Google OAuth origin changes on the backends; revisit together with §9.
- Staging keeps going straight to 100% (`CANARY_PERCENT` unset). It is set only for the
  drills.

## 9. Later: backend canary

Railway has no traffic split, so it needs separate `-canary` services. The cleanest way
is for the canary *frontend* version to be built against them, which turns this plan's
percentage into the backend percentage too. Constraints already known: canary realtime
must share production Redis; peer must never be split; core migrations must only add
things, never rename or drop. Not planned yet.
