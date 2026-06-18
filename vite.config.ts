import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'
import { execSync } from 'child_process'

import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

const gitHash = execSync('git rev-parse --short HEAD').toString().trim();

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isCapacitorBuild = mode.startsWith('capacitor');

  return {
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  plugins: [
    react(),
    tailwindcss(),
    !isCapacitorBuild && cloudflare(),
    !isCapacitorBuild && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      devOptions: {
        enabled: true
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,woff,woff2,ttf,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5000000,
        // Keep navigations network-first. A cached SPA shell is what makes
        // installed PWAs keep loading stale chunk hashes after deployments.
        navigateFallback: undefined,
        // Do not let the SPA "offline shell" hijack top-level navigations to the API
        // (e.g. Google OAuth start URL /api/auth/google -> must hit the network / worker).
        navigateFallbackDenylist: [/^\/api\//, /^\/ws\//, /^\/v1\//, /^\/health$/],
      },
      manifest: {
        id: '/',
        name: 'construct.computer',
        short_name: 'Construct',
        description: 'AI Agent Platform - Your AI agents run autonomously 24/7',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
    ,
    // Sentry source-map upload + release tracking. Auth via SENTRY_AUTH_TOKEN,
    // SENTRY_ORG, SENTRY_PROJECT env vars (set in CI). No-op locally without
    // the auth token — source maps are still generated (hidden) for the
    // browser devtools, just not uploaded to Sentry.
    //
    // Release name MUST match what the Sentry SDK reports at runtime. In CI,
    // VITE_APP_VERSION is set to github.sha (full hash); the SDK in sentry.ts
    // uses that as the release. Locally, it falls back to __GIT_HASH__ (short
    // hash from `git rev-parse --short HEAD`).
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.VITE_APP_VERSION || gitHash },
      sourcemaps: {
        // Upload JS + source map files from the Vite build output.
        assets: 'dist/assets/*.js*',
        // Delete source maps from the build output after upload so they're
        // not publicly served. Symbolication happens in Sentry.
        filesToDeleteAfterUpload: 'dist/assets/*.js.map',
      },
      // Skip when the auth token is missing (local dev / non-deploy builds).
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    hmr: {
      port: 5173,
    },
    allowedHosts: ['host.docker.internal'],
    // Proxy API and WebSocket requests to wrangler dev (Cloudflare Worker)
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      },
      '/health': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Hidden source maps: generated + uploaded to Sentry by the Vite plugin,
    // but not linked in the bundle (not publicly served). Enables symbolicated
    // production error stacks in Sentry without exposing source maps.
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor';
          if (id.includes('/monaco-editor/') || id.includes('/@monaco-editor/')) return 'editor-vendor';
          if (id.includes('/@xterm/')) return 'terminal-vendor';
          if (id.includes('/xlsx/')) return 'spreadsheet-vendor';
          if (id.includes('/mammoth/') || id.includes('/@jvmr/pptx-to-html/')) return 'document-vendor';
          if (
            id.includes('/react-markdown/')
            || id.includes('/remark-')
            || id.includes('/rehype-')
            || id.includes('/unified/')
            || id.includes('/katex/')
            || id.includes('/highlight.js/')
          ) return 'markdown-vendor';
          if (id.includes('/recharts/')) return 'chart-vendor';
          if (id.includes('/lucide-react/')) return 'icons-vendor';
          return undefined;
        },
      },
    },
  },
  };
})
