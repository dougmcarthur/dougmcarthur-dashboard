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
      // Three documents. The app is one page that routes on the hash; the
      // privacy policy and the terms of service are their own, so each is a
      // real page that reads without JavaScript and has an address a
      // regulator, a search engine or Google's app review can fetch. The
      // Worker's static assets serve dist/privacy/index.html for /privacy/ and
      // dist/terms-of-service/index.html for /terms-of-service/, with no route
      // of their own.
      input: {
        main: page('./frontend/index.html'),
        privacy: page('./frontend/privacy/index.html'),
        terms: page('./frontend/terms-of-service/index.html'),
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
