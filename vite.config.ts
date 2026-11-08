import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from '@cloudflare/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Which build a bundle is, in every tracking batch's context — so an error can be pinned
  // to the deploy that introduced it. `APP_VERSION` is the readable name deploy.yml computes
  // from the branch's commit count (`v16`, `staging-v48`; docs/plans/PLAN-canary.md §5.1),
  // and is also the Cloudflare version tag. `GITHUB_SHA` gives the exact commit. Locally
  // (and in CI's verify build) both are `dev`.
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || 'dev'),
    __APP_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) || 'dev'),
  },
  // Staging still builds source maps, for decoding a stack trace from a real phone, but
  // `hidden` and `public/.assetsignore` keep them out of what is served: staging is on a
  // public URL, and a served map publishes the whole frontend with its comments.
  build: { sourcemap: mode === 'staging' ? 'hidden' : false },
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Module workers: the segmentation worker imports MediaPipe, which then `import()`s its
  // own runtime (see `scripts/stage-segmentation.mjs`).
  worker: { format: 'es' },
  css: {
    preprocessorOptions: {
      // Use Dart Sass's modern API (silences the legacy-js-api deprecation).
      scss: {
        api: 'modern',
      },
    },
  },
}))
