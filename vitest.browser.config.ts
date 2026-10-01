import { defineConfig } from 'vitest/config';

// Real-browser tests of the built package (`npm run test:browser` builds first). They need a local
// Chromium for the pinned playwright-core version: `npx playwright-core install chromium`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/browser/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
