import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.js'],
    include: ['**/*.{test,spec}.{js,mjs}'],
    exclude: ['node_modules', 'dist'],
  },
})
