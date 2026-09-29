/**
 * Where each environment must land. Written out by hand on purpose: the deploy guard and
 * the smoke test compare the build against THIS table, not against `wrangler.jsonc`, so a
 * wrong edit to the Wrangler config is caught instead of trusted.
 *
 * `hostTag` is the naming rule the env guard holds every backend host to: staging hosts
 * carry `-staging.`, production hosts must not. It catches the likeliest CI mistake — one
 * environment's variables pasted into the other's.
 */
export const TARGETS = {
  staging: {
    worker: 'momoto-lab-fe-staging',
    origin: 'https://staging.momotoldr.com',
    mode: 'staging',
  },
  production: {
    worker: 'momoto-lab-fe',
    origin: 'https://momotoldr.com',
    mode: 'production',
  },
}

export function targetFor(name) {
  const target = TARGETS[name]
  if (!target) {
    console.error(
      `Unknown environment "${name}". Expected one of: ${Object.keys(TARGETS).join(', ')}`
    )
    process.exit(1)
  }
  return target
}

export const isStagingHost = (host) => host.includes('-staging.')
