import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
