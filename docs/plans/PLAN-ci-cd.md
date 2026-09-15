# Momoto Frontend — CI/CD

Plan for continuous integration and deployment of `momoto-fe` (GitHub:
`momotoldr/momoto-fe`) to Cloudflare Workers. Every pull request is checked. A push to
`staging` deploys `staging.momotoldr.com`. A push to `main` deploys `momotoldr.com`.
Nothing reaches production except through `main`, and nothing is deployed from a laptop.

**Legend:** DoD = Definition of Done.

## Current state (checked 2026-09-15)

| Area | Today |
| :--- | :--- |
| Remote / branches | `origin` = `git@github.com:momotoldr/momoto-fe.git`; `main` (default) and `staging` both exist on the remote. |
| Hosting | Cloudflare Workers static assets via `@cloudflare/vite-plugin` + Wrangler 4.120. `wrangler.jsonc`: top level = prod worker `momoto-lab-fe` on `momotoldr.com/*`; `env.staging` = `momoto-lab-fe-staging` on `staging.momotoldr.com/*`. |
| Deploys | Manual: `npm run deploy` / `npm run deploy:staging` from a local machine. |
| Workflows | None (`.github/` does not exist). |
| Gates | `typecheck` ✅ passes · `lint` ✅ passes · `format:check` ❌ **9 files fail** · no test runner. |
| Build config | `.env.staging` / `.env.production` are gitignored, so they exist **only on your machine**. |
| Node | Local v24.10.0; no `.nvmrc` / `engines` pin. |

## Blockers — fix before any pipeline exists

A pipeline would repeat these bugs on every push, so they come first.

### B1. `deploy:staging` deploys to **production** *(critical, silent)* — ✅ fixed 2026-09-15

> Fixed in `package.json` (`build:staging` + plain `wrangler deploy`) and `wrangler.jsonc`
> (staging uses `"route": { "pattern": "staging.momotoldr.com", "custom_domain": true }`).
> It must be the `route` key, not `routes`: the build flattens the top-level `route` into
> the env, and having both fails validation. Both dry-runs were checked: the staging one
> targets `momoto-lab-fe-staging` with `api-staging.` in the bundle, and the prod one is
> unchanged.

`deploy:staging` runs `npm run build && wrangler deploy --env staging`. With the Cloudflare
Vite plugin, the environment is chosen **at build time** (`CLOUDFLARE_ENV`), not at
deploy time. The build writes a flattened `dist/wrangler.json` plus a redirect in
`.wrangler/deploy/config.json`, and Wrangler deploys that file.

The local `dist/wrangler.json` from the last build has `"name": "momoto-lab-fe"` and
`"route": "momotoldr.com/*"`, with no `targetEnvironment`. Wrangler only rejects `--env`
when `targetEnvironment` is set and differs
(`wrangler-dist/cli.js`: `rawConfig.targetEnvironment && rawConfig.targetEnvironment !== envName`).
When it is unset, Wrangler falls back to the top-level (prod) config.

**So `npm run deploy:staging` today most likely uploads a build to the production worker
and route.** On top of that, B2 means the build carries production API URLs anyway. This
comes from reading the code path; it has not been run. It is the first thing to confirm
in C0.

**Fix:** pick the environment at build time and drop `--env` at deploy time:

```jsonc
"build": "tsc --noEmit && vite build",
"build:staging": "tsc --noEmit && CLOUDFLARE_ENV=staging vite build --mode staging",
"deploy": "npm run build && wrangler deploy",
"deploy:staging": "npm run build:staging && wrangler deploy"
```

After `build:staging`, `dist/wrangler.json` must show `"name": "momoto-lab-fe-staging"`
and `"targetEnvironment": "staging"`. CI asserts this (see [Deploy guard](#deploy-guard)).

### B2. Staging builds use production env values

This is defect #1 from `PLAN-staging.md`, and it is still present. Plain `vite build` runs
in `production` mode, so `.env.staging` is never read. Adding `--mode staging` in B1 fixes it.

### B3. CSP does not allow the staging hosts — ✅ fixed 2026-09-15

`public/_headers` → `connect-src` lists only `api.momotoldr.com` and `peer.momotoldr.com`.
A staging bundle calls `api-staging.` / `peer-staging.`, so the CSP blocks the socket, and
the only symptom is a console error. Add the four staging origins (`https://` + `wss://`
for `api-staging.` and `peer-staging.`), as recommended in `PLAN-staging.md` §5.2.

### B4. Formatting is red

`prettier --check` fails on 9 files (`stripsService.ts`, `UnverifiedEmailBanner.tsx`,
`TemplatePicker.module.scss`, `EmailRow.tsx`, `PasswordRow.tsx`, `RoomStatus.tsx`,
`VerifyEmailPage.tsx`, `composeStrip.ts`, `vite.config.ts`). Run `npm run format` once
in a separate formatting-only commit so the CI gate starts green.

### B5. Build-time config lives only on your machine

Covered by `PLAN-staging.md` §9. A CI build with no `.env.*` file does not fail. It
produces a bundle with an **empty** `VITE_SOCKET_URL`, which breaks at runtime. The
values must move into GitHub (see [Configuration](#configuration)), and the build must
refuse to run without them (see [Env guard](#env-guard)).

Also reconcile the variable list. The source reads 15 `VITE_*` keys, but `.env.production`
sets 9 of them. `VITE_GOOGLE_CLIENT_ID`, `VITE_STUN_URLS`, `VITE_TURN_*` and
`VITE_STRIP_PRINT_PRICE_IDR` are not set there. Confirm each one is either intentionally
defaulted in `src/env.ts` or set somewhere else, before choosing what CI requires.
`.env.staging` still sets the removed `VITE_VIRTUAL_BACKGROUND_ENABLED`.

### B6. Staging is indexable

Out of scope for CI itself, but the first automatic staging deploy makes it public.
Put `staging.momotoldr.com` behind Cloudflare Access before the staging workflow goes
live (`PLAN-staging.md` §5.3).

## Branch and environment model

```
feature/*  ──PR──▶  staging  ──PR──▶  main
   │                   │                │
   CI checks           CI + deploy      CI + deploy
                       staging          production (approval)
```

- **`staging`** is the integration branch. Feature PRs target it. Merging deploys
  `staging.momotoldr.com`.
- **`main`** is production. The only way in is a PR from `staging`, so the exact commit
  tested on staging is what ships. Merging deploys `momotoldr.com`.
- **Hotfix:** branch from `main`, PR to `main`, then merge `main` back into `staging`.
  This is the only exception to the flow above.
- Use **merge commits** (not squash) for `staging → main`. Squashing gives `main` a new
  SHA that is not in `staging`, and the branches drift apart.

### Branch protection (GitHub → Settings → Rules)

| Rule | `staging` | `main` |
| :--- | :---: | :---: |
| Require PR before merging | ✅ | ✅ |
| Required status check: `ci / verify` | ✅ | ✅ |
| Require branch up to date | ✅ | ✅ |
| Block force pushes and deletion | ✅ | ✅ |
| Restrict who can push | — | ✅ (you) |

## Workflows

Three files in `.github/workflows/`.

### `ci.yml` — verify every change

Runs on `pull_request` to `staging`/`main`, and on push to any other branch.

```yaml
name: ci
on:
  pull_request:
    branches: [staging, main]
  push:
    branches-ignore: [staging, main]   # those are covered by deploy.yml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck
      # Build both targets with placeholder values. This proves the bundle and the
      # Cloudflare config compile for each env. Real values are only used in deploy.yml.
      - run: npm run build
        env: { VITE_SOCKET_URL: https://ci.invalid, VITE_PEERJS_HOST: ci.invalid }
      - run: npm run build:staging
        env: { VITE_SOCKET_URL: https://ci.invalid, VITE_PEERJS_HOST: ci.invalid }
```

The placeholder list grows to cover whatever the [Env guard](#env-guard) requires.

### `deploy.yml` — build and ship one environment

A single reusable workflow, so staging and production cannot drift apart.

```yaml
name: deploy
on:
  workflow_call:
    inputs:
      environment: { type: string, required: true }   # staging | production
      cloudflare_env: { type: string, default: "" }   # "" = top level (prod)
      site_url: { type: string, required: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment:
      name: ${{ inputs.environment }}
      url: ${{ inputs.site_url }}
    concurrency:
      group: deploy-${{ inputs.environment }}
      cancel-in-progress: false        # never kill a deploy halfway through
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run format:check && npm run lint
      - name: Build
        run: npm run ${{ inputs.cloudflare_env && 'build:staging' || 'build' }}
        env:
          VITE_SOCKET_URL: ${{ vars.VITE_SOCKET_URL }}
          VITE_PEERJS_HOST: ${{ vars.VITE_PEERJS_HOST }}
          VITE_PEERJS_PORT: ${{ vars.VITE_PEERJS_PORT }}
          VITE_PEERJS_PATH: ${{ vars.VITE_PEERJS_PATH }}
          VITE_PEERJS_SECURE: ${{ vars.VITE_PEERJS_SECURE }}
          VITE_STRIP_MAX_ITEMS: ${{ vars.VITE_STRIP_MAX_ITEMS }}
          VITE_BETA_MODE: ${{ vars.VITE_BETA_MODE }}
          VITE_GROUP_MODE_ENABLED: ${{ vars.VITE_GROUP_MODE_ENABLED }}
          VITE_PAYMENTS_ENABLED: ${{ vars.VITE_PAYMENTS_ENABLED }}
          VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}
          VITE_STUN_URLS: ${{ vars.VITE_STUN_URLS }}
          VITE_TURN_URLS: ${{ vars.VITE_TURN_URLS }}
          VITE_TURN_USERNAME: ${{ secrets.VITE_TURN_USERNAME }}
          VITE_TURN_CREDENTIAL: ${{ secrets.VITE_TURN_CREDENTIAL }}
          VITE_STRIP_PRINT_PRICE_IDR: ${{ vars.VITE_STRIP_PRINT_PRICE_IDR }}
      - name: Deploy guard
        run: node scripts/assert-deploy-target.mjs "${{ inputs.cloudflare_env }}"
      - name: Deploy
        run: npx wrangler deploy --message "${{ github.sha }}"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - name: Smoke test
        run: node scripts/smoke.mjs "${{ inputs.site_url }}"
```

Vite gives real process env variables priority over `.env` files and exposes the
`VITE_*` ones to the bundle, so no `.env` file needs to be written in CI. The Cloudflare
plugin reads `CLOUDFLARE_ENV` the same way.

Build and deploy run in **one job** on purpose. The deploy needs `dist/` *and* the
generated `.wrangler/deploy/config.json`. Passing both between jobs as artifacts adds
work without adding safety.

`VITE_TURN_*` sits in `secrets` for hygiene, but it is **baked into a public JS bundle**.
It is not really secret. Short-lived TURN credentials minted by the backend are the real
fix (`DEPLOYMENT.md` §4).

### `release.yml` — the triggers

```yaml
name: release
on:
  push:
    branches: [staging, main]
  workflow_dispatch:                   # manual redeploy of the current branch head
jobs:
  staging:
    if: github.ref == 'refs/heads/staging'
    uses: ./.github/workflows/deploy.yml
    with: { environment: staging, cloudflare_env: staging, site_url: "https://staging.momotoldr.com" }
    secrets: inherit
  production:
    if: github.ref == 'refs/heads/main'
    uses: ./.github/workflows/deploy.yml
    with: { environment: production, site_url: "https://momotoldr.com" }
    secrets: inherit
```

## Configuration

### Cloudflare API token

Create a **custom** token (not the Global API Key) in Cloudflare → My Profile → API Tokens:

- **Account** → Workers Scripts: Edit
- **Zone** `momotoldr.com` → Workers Routes: Edit
- **Account** → Account Settings: Read (Wrangler looks up the account)
- Optional: restrict the client IP range; set a TTL and add a reminder to rotate it

Save it as a **repository secret** `CLOUDFLARE_API_TOKEN`, along with
`CLOUDFLARE_ACCOUNT_ID`. The token is the same for both environments because both workers
live in one account.

### GitHub Environments

Create `staging` and `production` under Settings → Environments.

| Setting | `staging` | `production` |
| :--- | :--- | :--- |
| Deployment branches | `staging` only | `main` only |
| Required reviewers | — | you *(see note)* |
| Variables | copy of `.env.staging` | copy of `.env.production` |
| Secrets | `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | same, prod values |

Once an Environment's variables exist, **they become the source of truth**. Local
`.env.staging` / `.env.production` turn into dev conveniences that can go stale. Record
this in `README.md` next to the paired-value table (`PLAN-staging.md` §9). Changing a
flag such as `VITE_PAYMENTS_ENABLED` becomes "edit the Environment variable, then
re-run the deploy workflow" — it does not need a commit.

> **Note — private repo on GitHub Free:** required reviewers and branch-restricted
> environments are only available for private repos on paid plans. Without them,
> production is protected by branch protection on `main` alone (PR + required checks),
> which is acceptable for a one-person team. Environment variables and secrets still work.

## Env guard

Fails the build when a required value is missing, which turns the silent B5 failure into a
red build. Add it to `vite.config.ts` using `loadEnv(mode, process.cwd(), 'VITE_')`, and
throw when `command === 'build'` and a required key is empty:

- Always required: `VITE_SOCKET_URL`, `VITE_PEERJS_HOST`, `VITE_STRIP_MAX_ITEMS`.
- Also check that `VITE_SOCKET_URL` contains `-staging.` **exactly when** `mode === 'staging'`.
  That catches a staging build carrying prod URLs, and the reverse.

`vite dev` is left alone, so local development never needs a full `.env`.

## Deploy guard

`scripts/assert-deploy-target.mjs` reads `dist/wrangler.json` before any upload and exits
non-zero unless:

- staging: `name === "momoto-lab-fe-staging"`, `targetEnvironment === "staging"`, route `staging.momotoldr.com/*`
- production: `name === "momoto-lab-fe"`, route `momotoldr.com/*`, and **no** `targetEnvironment`

This is the check that would have caught B1. It costs about 20 lines.

## Smoke test

`scripts/smoke.mjs <url>` runs right after deploy. It retries for about 60 s while the
edge propagates.

1. `GET /` → 200, HTML contains the new bundle's hashed `assets/index-*.js` (proves the new version is live, not a cached one).
2. `GET /room/ABCD` → 200 (SPA fallback survives).
3. Response `content-security-policy` `connect-src` includes the environment's own API host (proves B3 stays fixed).
4. `GET /robots.txt` → 200.

The smoke test cannot see a WebRTC or socket failure. After each staging deploy, check
by hand once that the booth connects, until automated E2E exists (see Later).

## Rollback

Cloudflare keeps previous Worker versions, so rollback does **not** rebuild.

- **Fast path:** `npx wrangler rollback --name momoto-lab-fe` (or the dashboard → Deployments). Takes seconds.
- Then `git revert` the bad commit on `main` so the next deploy does not bring it back.
- Optional: a `rollback.yml` with `workflow_dispatch` (input: environment, optional version id) running the same command with the CI token, so rollback works from a phone.

## Phases

### C0 — Fix the blockers *(half a day)*
Scripts (B1/B2), CSP (B3), a formatting-only commit (B4), `.nvmrc` = `24`, variable
inventory and `.env.staging` cleanup (B5), Cloudflare Access on staging (B6).
**DoD:** from your machine, `npm run build:staging` gives a `dist/wrangler.json` naming
`momoto-lab-fe-staging`. `npm run deploy:staging` updates **only** staging (check the prod
worker's "last deployed" time in the dashboard has not changed). `format:check`, `lint`
and `typecheck` all pass.

### C1 — CI on pull requests *(1–2 hours)*
Add `ci.yml`, the env guard, and branch protection on `staging` and `main` requiring `ci / verify`.
**DoD:** a PR with a Prettier violation is blocked, and a clean PR goes green.

### C2 — Automatic staging deploy *(2–3 hours)*
Cloudflare token, the `staging` Environment and its variables, `deploy.yml` + `release.yml`
(staging job only), deploy guard, smoke test.
**DoD:** merging to `staging` deploys, the smoke test passes, the booth connects on
staging, and prod is untouched.

### C3 — Automatic production deploy *(1 hour)*
`production` Environment and variables, enable the `production` job, first release through a
`staging → main` PR.
**DoD:** the first production deploy from CI serves the same bundle hash that staging
served for that commit's build. The Wrangler deployment message shows the commit SHA.
Stop running `npm run deploy` locally.

### C4 — Hardening *(optional, ~half a day)*
`rollback.yml`. Dependabot for `npm` + `github-actions` targeting `staging`, weekly. Pin
actions to commit SHAs. A failure notification (GitHub's email default is enough to start).

## Later — not in this plan

- **Tests.** There is no test runner. Vitest for pure logic (`composeStrip`, session
  timer math, env parsing) plugs in as one extra `npm test` step in `verify`.
- **E2E.** A Playwright smoke test against staging with two fake-media browser contexts
  would cover the socket and WebRTC path that the HTTP smoke test cannot.
- **Per-PR preview deploys** (`wrangler versions upload` gives a preview URL). Deferred:
  previews would need their own CSP entries and backend CORS origins, and they would reach
  the staging backend with unreviewed code.
- **`momoto-admin`** can use the same pipeline once it has a staging env
  (`PLAN-staging.md` §6). `deploy.yml` can be copied almost unchanged.

## Rejected alternatives

- **Cloudflare Workers Builds (dashboard Git integration).** Builds on push with no YAML.
  Rejected because lint and typecheck gating would have to live in a separate GitHub
  check anyway. Build variables would live in the Cloudflare dashboard, away from the
  checks. It has no deploy guard hook for B1, and no approval step for production. One
  place for CI and CD beats two.
- **Committing `.env.staging` / `.env.production`.** The values are all public once
  bundled, so it would work. But it puts the TURN credential in git history, and it
  undoes the `.gitignore` decision. GitHub Environment variables are about as convenient
  and can change without a commit.
- **Deploy from tags instead of `main`.** It adds a manual step and gives no safety for
  a one-person team. It is worth revisiting if releases ever need to be batched.

## Risks and watch-items

- **Variable drift.** The paired values (`VITE_STRIP_MAX_ITEMS` ↔ `STRIP_MAX_ITEMS`,
  session duration, Google client id) now live in GitHub for the FE and Railway for the
  BE. Nothing enforces the pairing. The env guard catches *missing* values, not
  *mismatched* ones.
- **Cloudflare plugin upgrades.** B1 depends on how `@cloudflare/vite-plugin` and Wrangler
  handle redirected configs. The deploy guard is the safety net, so keep it even if a
  future version makes `--env` work.
- **Token scope.** The CI token can deploy any Worker in the account, including a future
  `momoto-admin`. Keep it in repository secrets (not org-wide) and rotate it when
  someone leaves.
