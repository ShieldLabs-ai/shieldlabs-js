import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: { url: 'https://shop.example.com/signup' },
    },
    include: ['test/**/*.test.ts'],
    // Chromium tests run separately: `npm run test:browser` (see vitest.browser.config.ts).
    exclude: [...configDefaults.exclude, 'test/browser/**'],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
