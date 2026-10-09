import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 700 }, // three.js is lazy-loaded in its own chunk
  // Relative asset paths: the build works from any sub-path (GitHub Pages).
  base: './',
  test: {
    // Pattern grids are integrated numerically.
    testTimeout: 30000,
  },
})
