/**
 * Staging-only post-build step: keep `staging.momotoldr.com` out of search indexes.
 *
 * `public/` is copied verbatim into every build and `_headers` ships to both workers, so
 * neither file can differ per environment on its own. Production must stay indexable, so
 * the override happens here, after `vite build --mode staging`, and touches only `dist/`.
 *
 * Belt and braces, because they fail differently: `robots.txt` asks a well-behaved crawler
 * not to fetch, while `X-Robots-Tag` tells one that fetched anyway not to index. A staging
 * copy of the marketing pages competing with production in search results is the thing
 * being prevented; it is slow to happen and slow to undo.
 */
import { appendFile, writeFile } from 'node:fs/promises'

const dist = new URL('../dist/', import.meta.url)

await writeFile(
  new URL('robots.txt', dist),
  `# Staging — deliberately excluded from search engines. See scripts/staging-noindex.mjs.
User-agent: *
Disallow: /
`,
)

await appendFile(
  new URL('_headers', dist),
  `
# Staging only, appended by scripts/staging-noindex.mjs.
/*
  X-Robots-Tag: noindex, nofollow
`,
)

console.log('staging: robots.txt set to Disallow, X-Robots-Tag: noindex appended to _headers')
