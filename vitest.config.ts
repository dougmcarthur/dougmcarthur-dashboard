import { defineConfig } from 'vitest/config'

// Standalone config so Vitest does NOT inherit vite.config.ts, whose
// `root: 'frontend'` would break resolution of the API tests under test/.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
