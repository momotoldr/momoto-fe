/**
 * Deploy guard: prove the built `dist/` is for the environment about to receive it.
 *
 * Usage: node scripts/check-deploy-target.mjs <staging|production>
 *
 * Runs between build and `wrangler deploy`. With `@cloudflare/vite-plugin` the target
 * worker is fixed at BUILD time (`CLOUDFLARE_ENV`), and `wrangler deploy --env` is
 * silently ignored when the build didn't set one — it falls back to the top-level config,
 * which is production. That is how `deploy:staging` once aimed a staging build at prod.
 * So this reads what Wrangler will actually deploy and checks it against
 * `deploy-targets.mjs`, not against `wrangler.jsonc`:
 *
 * - the redirected config's worker `name`, `targetEnvironment` and route host, and
 * - the bundle itself: the environment's API host must be inlined in `dist/assets`, which
 *   proves the build ran in the right Vite `--mode` (a plain `vite build` reads
 *   `.env.production` whatever `CLOUDFLARE_ENV` says).
 */
import { readdir, readFile } from 'node:fs/promises'

import { loadEnv } from 'vite'

import { targetFor } from './deploy-targets.mjs'

const name = process.argv[2]
const target = targetFor(name)
const root = new URL('../', import.meta.url)

const redirect = JSON.parse(
  await readFile(new URL('.wrangler/deploy/config.json', root), 'utf8').catch(() => {
    console.error('No .wrangler/deploy/config.json — run the build first.')
    process.exit(1)
  })
)
const configUrl = new URL(redirect.configPath, new URL('.wrangler/deploy/', root))
const config = JSON.parse(await readFile(configUrl, 'utf8'))

const errors = []

if (config.name !== target.worker) {
  errors.push(`worker name is "${config.name}", expected "${target.worker}"`)
}
const expectedEnv = name === 'production' ? undefined : name
if (config.targetEnvironment !== expectedEnv) {
  errors.push(
    `targetEnvironment is ${JSON.stringify(config.targetEnvironment)}, expected ${JSON.stringify(expectedEnv)}`
  )
}
const routes = [config.route, ...(config.routes ?? [])].filter(Boolean)
const routeHosts = routes.map((r) => (typeof r === 'string' ? r : r.pattern).replace(/\/.*$/, ''))
const expectedHost = new URL(target.origin).hostname
if (routeHosts.length !== 1 || routeHosts[0] !== expectedHost) {
  errors.push(`routes are [${routeHosts.join(', ')}], expected [${expectedHost}]`)
}

const apiHost = new URL(loadEnv(target.mode, root.pathname, 'VITE_').VITE_API_URL).hostname
const assetsDir = new URL('dist/assets/', root)
const scripts = (await readdir(assetsDir)).filter((f) => f.endsWith('.js'))
let inlined = false
for (const file of scripts) {
  if ((await readFile(new URL(file, assetsDir), 'utf8')).includes(apiHost)) {
    inlined = true
    break
  }
}
if (!inlined) errors.push(`no script in dist/assets mentions ${apiHost} — wrong --mode?`)

if (errors.length > 0) {
  console.error(`deploy guard failed for ${name}:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  process.exit(1)
}
console.log(`deploy guard ok: ${target.worker} → ${expectedHost}, bundle calls ${apiHost}`)
