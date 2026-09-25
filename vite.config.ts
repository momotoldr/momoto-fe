import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from '@cloudflare/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Staging ships source maps so a crash on a real phone points at a line of source
  // instead of `index-8wBdRz6U.js:53`. Production does not: the maps publish readable
  // source to anyone who opens devtools, and staging is where debugging happens.
  build: { sourcemap: mode === 'staging' },
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The package's default `webgpu` entry is a bundle that points at its 25.5 MiB WASM
      // with `new URL(…, import.meta.url)`, which Vite would copy into `dist/assets` —
      // over Cloudflare's 25 MiB per-asset limit. This build loads nothing on its own; the
      // segmentation worker hands it the WASM staged in parts by
      // `scripts/stage-segmentation.mjs`.
      'onnxruntime-web/webgpu': fileURLToPath(
        new URL('./node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs', import.meta.url)
      ),
    },
  },
  // Module workers, so the segmentation worker can code-split onnxruntime's dynamic import.
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
