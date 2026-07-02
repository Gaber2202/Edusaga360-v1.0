import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

/**
 * Playwright config for EduSaga-360 frontend smoke suite.
 *
 * Money-path smoke coverage: attendance check-in + invoice create.
 * Kept intentionally minimal so it can run headless in CI on the
 * preinstalled Chromium at /opt/pw-browsers.
 *
 * TODO(verify-selector): confirm the dev server URL/port. The app is a Vite
 * SPA (default dev port 5173). CI may prefer `vite preview` on 4173 against a
 * production build. Set E2E_BASE_URL to override.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';

// Only pin executablePath when the preinstalled browser exists (CI image).
// Locally, Playwright resolves its own managed Chromium.
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium';
const useSystemChromium = fs.existsSync(PINNED_CHROMIUM);

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // PLAYWRIGHT_BROWSERS_PATH is set in the environment; do NOT run
    // `playwright install`. When the pinned Chromium is present, use it.
    ...(useSystemChromium ? { launchOptions: { executablePath: PINNED_CHROMIUM } } : {}),
  },

  projects: [
    // Auth setup runs first and writes storageState for the smoke specs.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // TODO(verify-selector): enable webServer if CI should boot the app itself.
  // The frontend proxies /api -> http://localhost:3001 (see vite.config.js),
  // so the Express backend must also be running for the invoice-create path.
  // webServer: [
  //   { command: 'npm run dev', url: BASE_URL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
  // ],
});
