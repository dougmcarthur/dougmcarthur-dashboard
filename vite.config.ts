import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  // Which build is running, for the feedback form's context. GitHub Actions
  // sets GITHUB_SHA on every run, so a deployed build carries its commit and a
  // local one says so.
  define: {
    __APP_BUILD__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      // Two documents. The app is one page that routes on the hash; the
      // privacy policy is its own, so it is a real page at /privacy/ that
      // reads without JavaScript and has an address a regulator, a search
      // engine or Google's app review can fetch. The Worker's static assets
      // serve dist/privacy/index.html for /privacy/ with no route of its own.
      input: {
        main: page('./frontend/index.html'),
        privacy: page('./frontend/privacy/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
    // shared/ sits outside `root`, so the dev server needs explicit permission
    // to serve it. Production builds bundle it without this.
    fs: { allow: ['..'] },
  },
})
