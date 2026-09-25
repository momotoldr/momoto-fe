/**
 * Env guard: refuse to build a deployable bundle with missing or crossed-over config.
 *
 * Usage: node scripts/check-env.mjs <staging|production>
 *
 * Runs before `build` and `build:staging`. Without it a build with no `.env.*` file (a CI
 * runner with a variable left unset) does not fail — `src/env.ts` quietly falls back to
 * `localhost` for every backend, and the bundle breaks only once it is live.
 *
 * Values are read the way Vite reads them for the app: the `.env*` files for the mode,
 * with `process.env` winning. In CI an unset GitHub variable arrives as an EMPTY string,
 * which Vite also lets win, so empty counts as missing here.
 *
 * Checks, per variable:
 * - backends (`VITE_API_URL`, `VITE_REALTIME_URL`, `VITE_PEERJS_HOST`): present, https,
 *   named for this environment (see `isStagingHost`), and listed in `public/_headers`
 *   `connect-src` — a host missing there is blocked by the CSP with only a console error.
 * - `VITE_PEERJS_SECURE` is `true`: the page is https, so an insecure broker can't connect.
 * - feature flags, when set, are exactly `true` or `false`. The app treats anything else
 *   as off, so `TRUE` or `yes` would silently ship a feature disabled.
 */
import { readFile } from 'node:fs/promises'

import { loadEnv } from 'vite'

import { isStagingHost, targetFor } from './deploy-targets.mjs'

const name = process.argv[2]
const { mode } = targetFor(name)
const root = new URL('../', import.meta.url)
const env = loadEnv(mode, root.pathname, 'VITE_')

const headers = await readFile(new URL('public/_headers', root), 'utf8')
// Anchored on the header itself: the file's comments mention `connect-src` too.
const connectSrc =
  headers.match(/Content-Security-Policy:.*?\bconnect-src ([^;]+)/)?.[1].split(/\s+/) ?? []

const errors = []
const value = (key) => env[key]?.trim() || ''

function requireKey(key) {
  const v = value(key)
  if (!v) errors.push(`${key} is not set`)
  return v
}

function checkHost(key, host) {
  if (host === 'localhost' || host === '127.0.0.1') {
    errors.push(`${key} points at ${host}`)
    return
  }
  if (isStagingHost(host) !== (name === 'staging')) {
    errors.push(
      name === 'staging'
        ? `${key} = ${host} is not a staging host (expected "-staging." in the name)`
        : `${key} = ${host} is a staging host, in a production build`
    )
  }
  if (!connectSrc.includes(`https://${host}`)) {
    errors.push(`${key}: https://${host} is missing from connect-src in public/_headers`)
  }
}

for (const key of ['VITE_API_URL', 'VITE_REALTIME_URL']) {
  const v = requireKey(key)
  if (!v) continue
  let url
  try {
    url = new URL(v)
  } catch {
    errors.push(`${key} = "${v}" is not a URL`)
    continue
  }
  if (url.protocol !== 'https:') errors.push(`${key} must be https, got ${url.protocol}`)
  checkHost(key, url.hostname)
}

const peerHost = requireKey('VITE_PEERJS_HOST')
if (peerHost) checkHost('VITE_PEERJS_HOST', peerHost)
requireKey('VITE_PEERJS_PORT')
requireKey('VITE_PEERJS_PATH')
if (value('VITE_PEERJS_SECURE') !== 'true') errors.push('VITE_PEERJS_SECURE must be "true"')

const maxItems = requireKey('VITE_STRIP_MAX_ITEMS')
if (maxItems && !(Number(maxItems) > 0)) {
  errors.push(`VITE_STRIP_MAX_ITEMS = "${maxItems}" is not a positive number`)
}

for (const key of [
  'VITE_BETA_MODE',
  'VITE_GROUP_MODE_ENABLED',
  'VITE_PAYMENTS_ENABLED',
  'VITE_BACKDROPS_ENABLED',
  'VITE_PEERJS_SECURE',
]) {
  const v = value(key)
  if (v && v !== 'true' && v !== 'false') errors.push(`${key} = "${v}" must be true or false`)
}

if (errors.length > 0) {
  console.error(`env check failed for ${name}:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  process.exit(1)
}

const flags = ['BETA_MODE', 'GROUP_MODE_ENABLED', 'PAYMENTS_ENABLED', 'BACKDROPS_ENABLED']
  .map((f) => `${f}=${value(`VITE_${f}`) || 'off'}`)
  .join(' ')
console.log(
  `env ok (${name}): api=${value('VITE_API_URL')} realtime=${value('VITE_REALTIME_URL')} peer=${peerHost} ${flags}`
)
