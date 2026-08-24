import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'frontend',
  plugins: [react()],
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
