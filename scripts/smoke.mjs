/**
 * Post-deploy smoke test: is the build we just uploaded the one being served?
 *
 * Usage: node scripts/smoke.mjs <staging|production>
 *
 * Runs after `wrangler deploy`, against the live origin, using the local `dist/` as the
 * reference. Retries for up to ~90 s while the new version reaches the edge.
 *
 * 1. `/` serves THIS build's entry script (`/assets/index-<hash>.js`), not a cached one.
 * 2. `/room/SMOKE` still falls back to the SPA shell.
 * 3. The CSP `connect-src` lets the page reach this environment's API.
 * 4. `robots.txt` blocks everything on staging, and does not on production.
 *
 * It cannot see a socket or WebRTC failure — after a staging deploy, still open a booth
 * once by hand.
 */
import { readFile } from 'node:fs/promises'

import { loadEnv } from 'vite'

import { targetFor } from './deploy-targets.mjs'

const name = process.argv[2]
const target = targetFor(name)
const root = new URL('../', import.meta.url)

const builtHtml = await readFile(new URL('dist/index.html', root), 'utf8')
const entry = builtHtml.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1]
if (!entry) {
  console.error('Could not find the entry script in dist/index.html')
  process.exit(1)
}
const apiOrigin = new URL(loadEnv(target.mode, root.pathname, 'VITE_').VITE_API_URL).origin

const TIMEOUT_MS = 90_000
const INTERVAL_MS = 5_000

async function get(path) {
  const res = await fetch(new URL(path, target.origin), {
    headers: { 'cache-control': 'no-cache' },
    redirect: 'manual',
  })
  return { status: res.status, headers: res.headers, body: await res.text() }
}

async function checks() {
  const failures = []

  const home = await get('/')
  if (home.status !== 200) failures.push(`/ returned ${home.status}`)
  else if (!home.body.includes(entry)) failures.push(`/ does not serve ${entry} yet`)

  const room = await get('/room/SMOKE')
  if (room.status !== 200 || !room.body.includes('<div id="root">')) {
    failures.push(`/room/SMOKE returned ${room.status} without the SPA shell`)
  }

  const csp = home.headers.get('content-security-policy') ?? ''
  const connectSrc = csp.match(/connect-src ([^;]+)/)?.[1].split(/\s+/) ?? []
  if (!connectSrc.includes(apiOrigin)) failures.push(`connect-src does not allow ${apiOrigin}`)

  const robots = await get('/robots.txt')
  const blocksAll = /^Disallow: \/\s*$/m.test(robots.body)
  if (robots.status !== 200) failures.push(`/robots.txt returned ${robots.status}`)
  else if (name === 'staging' && !blocksAll) failures.push('staging robots.txt does not block all')
  else if (name === 'production' && blocksAll) failures.push('production robots.txt blocks all')

  return failures
}

const deadline = Date.now() + TIMEOUT_MS
let failures = []
for (;;) {
  failures = await checks().catch((error) => [`request failed: ${error.message}`])
  if (failures.length === 0 || Date.now() >= deadline) break
  console.log(`waiting for ${target.origin}: ${failures.join('; ')}`)
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
}

if (failures.length > 0) {
  console.error(
    `smoke test failed for ${target.origin}:\n${failures.map((f) => `  - ${f}`).join('\n')}`
  )
  process.exit(1)
}
console.log(`smoke ok: ${target.origin} serves ${entry}`)
