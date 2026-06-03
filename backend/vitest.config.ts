import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Allow top-level await in test files (needed for dynamic imports after vi.mock)
    pool: 'forks',
  },
});
