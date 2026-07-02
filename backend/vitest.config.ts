import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Allow top-level await in test files (needed for dynamic imports after vi.mock)
    pool: 'forks',
    // A handful of tests render a real PDF, which launches Chromium via Puppeteer.
    // A cold browser start can take 10s+ on constrained runners, so the 5s default
    // times them out even though the code is fine. 30s comfortably covers the
    // cold start (subsequent renders reuse the shared browser instance).
    testTimeout: 30_000,
  },
});
