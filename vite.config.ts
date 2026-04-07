import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'child_process'

import { cloudflare } from "@cloudflare/vite-plugin";

const gitHash = execSync('git rev-parse --short HEAD').toString().trim();

// https://vite.dev/config/
export default defineConfig({
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  plugins: [react(), tailwindcss(), cloudflare()],
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
})