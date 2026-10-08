/**
 * Gradual (canary) rollout of the frontend Worker: a new build goes out to a share of
 * visitors first, and the rest stay on the version they already had.
 * Plan and reasoning: docs/plans/PLAN-canary.md.
 *
 * Usage:
 *   node scripts/rollout.mjs upload   <env> <tag> <message>  upload dist/ as a version, no traffic
 *   node scripts/rollout.mjs stage    <env> <version-id>     add it to the deployment at 0%
 *   node scripts/rollout.mjs set      <env> <percent>        give the newer version <percent>%
 *   node scripts/rollout.mjs previous <env>                  restore the build fully live before this one
 *   node scripts/rollout.mjs restore  <env> <tag>            restore a named build (e.g. v14) at 100%
 *   node scripts/rollout.mjs status   <env>                  print the current split
 *
 * deploy.yml runs upload → stage → smoke (pinned to the new version) → set to the
 * environment's CANARY_PERCENT. rollout.yml runs the rest by hand: `set` ramps up (100
 * drops the old version) or rolls back (0 drops the new one); `previous` and `restore`
 * undo a release that already reached 100%.
 *
 * A deployment holds at most two versions. "Stable" is the older one, "canary" the newer
 * one (by upload time), so `set` needs no ids. `stage` refuses while a rollout is still
 * split — finish it (`set 100`) or roll it back (`set 0`) first, so a push to main can
 * never silently stack a third build on top of a half-done rollout. `previous` and
 * `restore` refuse while two versions are deployed, for the same reason.
 *
 * Visitors stay on one version thanks to the `Cloudflare-Workers-Version-Key` Transform
 * Rule on the zone (plan §3). Without it, `index.html` and its hashed chunks can come
 * from different versions and 404.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { targetFor } from './deploy-targets.mjs'

const [command, envName, ...rest] = process.argv.slice(2)
const target = targetFor(envName)

function wrangler(args, { env } = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

/** `--json` output, skipping anything Wrangler prints before it (e.g. a proxy warning). */
function wranglerJson(args) {
  const out = wrangler([...args, '--name', target.worker, '--json'])
  return JSON.parse(out.slice(out.search(/[[{]/)))
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
}

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
}

/** Newest first. */
function deployments() {
  return wranglerJson(['deployments', 'list']).sort((a, b) =>
    b.created_on.localeCompare(a.created_on)
  )
}

function deployment() {
  return wranglerJson(['deployments', 'status'])
}

/**
 * A version's readable name: the tag (`v16`) and the commit. deploy.yml writes the message
 * as `v16 8212a2d <subject>`; builds from before version names wrote `8212a2d <subject>`
 * and were tagged with the SHA — hence "the first SHA-looking word".
 */
function label(version) {
  const message = version.annotations?.['workers/message'] ?? ''
  return {
    id: version.id,
    tag: version.annotations?.['workers/tag'] ?? '(no tag)',
    commit:
      message
        .split(' ')
        .slice(0, 2)
        .find((word) => /^[0-9a-f]{7}$/.test(word)) ?? '',
    createdOn: version.metadata?.created_on ?? '',
  }
}

function describe(versionId) {
  return label(wranglerJson(['versions', 'view', versionId]))
}

function deploy(specs, message) {
  const args = specs.map(([id, percent]) => `${id}@${percent}%`)
  console.log(`versions deploy ${args.join(' ')}`)
  wrangler(['versions', 'deploy', ...args, '--name', target.worker, '--message', message, '--yes'])
}

/** The current deployment's versions, oldest first, with their traffic share. */
function currentSplit() {
  return deployment()
    .versions.map((v) => ({ ...describe(v.version_id), percent: v.percentage }))
    .sort((a, b) => a.createdOn.localeCompare(b.createdOn))
}

function printSplit(split) {
  const lines = split.map(
    (v) => `  ${String(v.percent).padStart(3)}%  ${v.tag}  ${v.commit}  ${v.id}`
  )
  console.log(`${target.worker}:\n${lines.join('\n')}`)
  summary(
    `### ${target.worker}\n\n| traffic | version | commit | version id |\n|---|---|---|---|\n` +
      split.map((v) => `| ${v.percent}% | ${v.tag} | ${v.commit} | \`${v.id}\` |`).join('\n') +
      '\n'
  )
}

/** The single version serving everything, or a refusal while a rollout is in flight. */
function soleLiveVersion(action) {
  const live = deployment().versions
  if (live.length > 1) {
    fail(
      `A rollout is in flight on ${target.worker} (${live.map((v) => `${v.percentage}%`).join(' / ')}). ` +
        `${action} only undoes a finished release — to drop the canary, run the rollout with 0.`
    )
  }
  return live[0].version_id
}

function restore(versionId, why) {
  deploy([[versionId, 100]], why)
  printSplit(currentSplit())
}

switch (command) {
  case 'upload': {
    const [tag, message] = rest
    if (!tag) fail('Usage: rollout.mjs upload <env> <tag> <message>')
    const outputFile = join(mkdtempSync(join(tmpdir(), 'wrangler-')), 'output.ndjson')
    // Uploads with the build's own redirected config (dist/wrangler.json), like `deploy` does.
    wrangler(['versions', 'upload', '--tag', tag, '--message', message ?? tag], {
      env: { WRANGLER_OUTPUT_FILE_PATH: outputFile },
    })
    const entry = readFileSync(outputFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((e) => e.type === 'version-upload')
    if (!entry?.version_id) fail('Wrangler did not report the uploaded version id.')
    if (entry.worker_name && entry.worker_name !== target.worker) {
      fail(`Uploaded to ${entry.worker_name}, expected ${target.worker}.`)
    }
    console.log(`uploaded ${tag} as ${entry.version_id}`)
    output('version_id', entry.version_id)
    break
  }

  case 'stage': {
    const [versionId] = rest
    if (!versionId) fail('Usage: rollout.mjs stage <env> <version-id>')
    const live = deployment().versions
    const stable = live.find((v) => v.percentage === 100)
    if (!stable) {
      fail(
        `${target.worker} is mid-rollout (${live.map((v) => `${v.percentage}%`).join(' / ')}). ` +
          'Finish it or roll it back with the rollout workflow (100 or 0), then re-run this deploy.'
      )
    }
    if (stable.version_id === versionId) fail(`${versionId} is already serving all traffic.`)
    // A 0% leftover from an earlier failed smoke test is simply replaced.
    deploy(
      [
        [stable.version_id, 100],
        [versionId, 0],
      ],
      `stage ${versionId.slice(0, 8)} at 0%`
    )
    printSplit(currentSplit())
    break
  }

  case 'set': {
    const percent = Number(rest[0])
    if (rest[0] === undefined || !Number.isInteger(percent) || percent < 0 || percent > 100) {
      fail('Usage: rollout.mjs set <env> <percent 0-100>')
    }
    const split = currentSplit()
    if (split.length < 2) {
      if (percent === 100) {
        console.log('Nothing to ramp: one version already serves all traffic.')
        printSplit(split)
        break
      }
      fail(
        `No rollout in progress on ${target.worker}: only ${split[0]?.tag} is deployed. ` +
          'To undo a finished release, use previous or version.'
      )
    }
    const [stable, canary] = split
    if (percent === 100) deploy([[canary.id, 100]], `promote ${canary.tag}`)
    else if (percent === 0) deploy([[stable.id, 100]], `roll back ${canary.tag}`)
    else {
      deploy(
        [
          [stable.id, 100 - percent],
          [canary.id, percent],
        ],
        `${canary.tag} at ${percent}%`
      )
    }
    printSplit(currentSplit())
    break
  }

  case 'previous': {
    const current = soleLiveVersion('previous')
    // The first other version that served 100% before now. Every release's `stage`
    // step records the old build at 100%, so it is never more than a few deployments
    // back. Run twice, this toggles back (plan §2.1) — `restore` goes further.
    const previous = deployments()
      .slice(1)
      .flatMap((d) => d.versions)
      .find((v) => v.percentage === 100 && v.version_id !== current)
    if (!previous) {
      fail(
        `No earlier fully-live build in the last 10 deployments of ${target.worker}. ` +
          'Run the rollout with version and a tag (e.g. v14) instead.'
      )
    }
    const from = describe(current)
    const to = describe(previous.version_id)
    console.log(`previous: ${from.tag} → ${to.tag}`)
    restore(to.id, `previous: ${from.tag} → ${to.tag}`)
    break
  }

  case 'restore': {
    const [tag] = rest
    if (!tag) fail('Usage: rollout.mjs restore <env> <tag>')
    const current = soleLiveVersion('version')
    // The 10 most recent uploads, newest wins: a re-run deploy can upload a tag twice.
    const recent = wranglerJson(['versions', 'list'])
      .map(label)
      .filter((v) => v.tag === tag)
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn))[0]
    if (recent?.id === current) fail(`${tag} is already serving all traffic.`)
    const why = `restore ${tag}`
    if (recent) {
      restore(recent.id, why)
      break
    }
    // Older than the last 10 uploads: let Wrangler search every deployable version.
    // It refuses (and lists the ids) if the tag matches more than one.
    console.log(`versions deploy --version-tag ${tag}@100%`)
    wrangler([
      'versions',
      'deploy',
      '--version-tag',
      `${tag}@100%`,
      '--name',
      target.worker,
      '--message',
      why,
      '--yes',
    ])
    printSplit(currentSplit())
    break
  }

  case 'status':
    printSplit(currentSplit())
    break

  default:
    fail('Usage: rollout.mjs <upload|stage|set|previous|restore|status> <env> ...')
}
