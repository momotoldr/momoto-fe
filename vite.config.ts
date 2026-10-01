import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from '@cloudflare/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // The commit a bundle was built from, in every tracking batch's context — so an error
  // can be pinned to the deploy that introduced it. CI sets GITHUB_SHA; locally it's `dev`.
  define: {
    __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) || 'dev'),
  },
  // Staging ships source maps so a crash on a real phone points at a line of source
  // instead of `index-8wBdRz6U.js:53`. Production does not: the maps publish readable
  // source to anyone who opens devtools, and staging is where debugging happens.
  build: { sourcemap: mode === 'staging' },
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
