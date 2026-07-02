import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Auth setup — logs a test-tenant user in through the real login UI and
 * persists the browser storageState (Supabase session lives in localStorage)
 * so the smoke specs start authenticated.
 *
 * Credentials MUST come from env vars — never hardcode secrets.
 *   E2E_USER_EMAIL / E2E_USER_PASSWORD  — a finance/admin test-tenant account
 *                                         (invoice create needs a FINANCE_ROLES user).
 *   E2E_BASE_URL                        — app origin (default http://localhost:5173)
 *
 * TODO(verify-selector): confirm the login route. Source: frontend/src/App.jsx
 * routes `/school-login` (and `/login` redirects to it). Login form and button
 * live in frontend/src/pages/SchoolLogin.jsx.
 */
const AUTH_FILE = path.join('e2e', '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  // TODO(test-credentials): provision a dedicated test-tenant finance user and
  // supply E2E_USER_EMAIL / E2E_USER_PASSWORD via CI secrets. Skip cleanly if absent.
  setup.skip(!email || !password, 'E2E_USER_EMAIL / E2E_USER_PASSWORD not set');

  await page.goto('/school-login');

  // Login form: email + password inputs, submit button labelled "Sign In".
  await page.getByPlaceholder('admin@yourschool.edu.sa').fill(email!); // TODO(verify-selector): prefer getByLabel once a stable label/testid exists
  await page.getByPlaceholder('••••••••').fill(password!);             // TODO(verify-selector)
  await page.getByRole('button', { name: /sign in|تسجيل الدخول/i }).click();

  // On success the app redirects to the authenticated root (Dashboard).
  // TODO(verify-selector): assert on a stable post-login landmark (e.g. a
  // dashboard heading or nav testid) instead of just URL.
  await expect(page).toHaveURL(/\/(Dashboard)?$/, { timeout: 30_000 });

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
