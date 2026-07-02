import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    // Playwright specs live in e2e/ and import @playwright/test — they are run
    // by Playwright, not Vitest. Keep Vitest from collecting them.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
