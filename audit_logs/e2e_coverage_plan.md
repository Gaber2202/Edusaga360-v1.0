# E2E Coverage Plan — Money Paths (Playwright scaffold)

Scaffold-only. No existing source, `ci.yml`, or dependency manifests were modified.
Target: two critical money paths — (a) attendance check-in, (b) invoice create.

## 1. Investigated flows (source of truth)

### Routing model
- SPA via `react-router-dom` (`frontend/src/App.jsx`). URLs are `createPageUrl(name) = "/" + name.replace(/ /g,"-")` (`frontend/src/utils/index.js`), e.g. page `StudentAttendancePage` → `/StudentAttendancePage`, `Fees` → `/Fees`.
- Auth: login at `/school-login` (`/login` redirects there). Form + "Sign In" button in `frontend/src/pages/SchoolLogin.jsx`. Session is Supabase Auth (stored in `localStorage`) → captured via Playwright `storageState`.

### (a) Attendance check-in
- Route: `/StudentAttendancePage` → `frontend/src/pages/StudentAttendancePage.jsx` (default tab `"mark"`, heading "Student Attendance" / "حضور الطلاب"). Grade/section are Radix `Select` comboboxes; default grade `Grade1`.
- Marker: `frontend/src/components/attendance/BulkAttendanceMarker.jsx`. All students default to **present**; "Mark all" quick buttons ("Present"/"حاضر" etc.); submit `<Button>` text is dynamic: "Submit Attendance — N students" / "حفظ الحضور — N طالب".
- Persistence: **direct Supabase write** from client — `tenantQuery('student_attendances').insert/update(...)`. Does NOT hit the Express backend. Success = green "Saved successfully" panel + sonner toast "Attendance saved...".
- Test dependency: seeded tenant with active students in the selected grade (`students` table, `status='active'`).

### (b) Invoice create
- Route: `/Fees` → `frontend/src/pages/Fees.jsx`. Header button "New Invoice" / "فاتورة جديدة" opens `NewInvoiceDialog` (defined in same file). Title "Create New Invoice" / "إنشاء فاتورة جديدة".
- Fields: student search input (placeholder "Search by student name or number...") → pick a result button; `academic_year`, `due_date`, `installments`, fee lines (amount placeholder "SAR", required to enable submit). Submit button "Create Invoice" / "إنشاء الفاتورة".
- API: `billingPost('/invoices', ...)` → **`POST /api/billing/invoices`** (`backend/src/routes/billing.ts:454`, guarded by `requireRole(FINANCE_ROLES)`). Vite dev proxies `/api` → `http://localhost:3001` (`frontend/vite.config.js`). Student list comes from `GET /api/billing/students`.
- Success = "Invoice Created" panel with `invoice_number` (INV-*) + VAT summary tiles.
- Test dependency: Express backend running, a seeded active student, and a **finance-role** login user.
- Note: a second, unused invoice UI exists (`frontend/src/components/fees/InvoiceForm.jsx`, writes via `tenantQuery` + ZATCA `/invoices/generate-zatca`). The active Fees page path is the backend `POST /api/billing/invoices`, so tests target that.

## 2. Files created (all under `frontend/e2e/`)
- `frontend/e2e/playwright.config.ts` — Chromium project + `setup` dependency; pins `executablePath: /opt/pw-browsers/chromium` only when present; `E2E_BASE_URL` override (default `http://localhost:5173`); commented `webServer` block.
- `frontend/e2e/auth.setup.ts` — logs in via real UI using `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` env vars, writes `e2e/.auth/user.json` storageState. Skips cleanly if creds unset. No secrets hardcoded.
- `frontend/e2e/attendance-checkin.spec.ts` — smoke: mark class present + save, assert success.
- `frontend/e2e/invoice-create.spec.ts` — smoke: open dialog, pick student, add fee line, create, assert "Invoice Created".
- `frontend/e2e/.gitignore` — ignores `.auth/`, `playwright-report/`, `test-results/`.

Selectors use role/text with resilient regex; every guessed assertion is tagged `// TODO(verify-selector)`.

## 3. package.json test script note (NOT applied — do manually)
Add to `frontend/package.json` scripts (requires installing `@playwright/test` as a devDependency — not done here):
```json
"test:e2e": "playwright test -c e2e/playwright.config.ts",
"test:e2e:ui": "playwright test -c e2e/playwright.config.ts --ui"
```

## 4. Proposed CI job (DRAFT — not written into ci.yml)
Add this job to `.github/workflows/ci.yml`. It assumes the runner image already has Chromium at `/opt/pw-browsers` (so no `playwright install`). Both the frontend preview server and the Express backend must be up for the invoice path.

```yaml
  e2e:
    name: E2E (Money Paths)
    runs-on: ubuntu-latest
    needs: [build-frontend, test-backend]
    env:
      PLAYWRIGHT_BROWSERS_PATH: /opt/pw-browsers
      E2E_BASE_URL: http://localhost:4173
      # Provide these via repo/environment secrets — never inline:
      E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
      E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
      E2E_STUDENT_QUERY: ${{ vars.E2E_STUDENT_QUERY }}
      # Backend runtime config (test tenant / service creds) as secrets:
      SUPABASE_URL: ${{ secrets.E2E_SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.E2E_SUPABASE_SERVICE_ROLE_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      # Frontend build + preview
      - run: cd frontend && npm ci
      - run: cd frontend && npm install --no-save @playwright/test   # TODO: move to devDependency + npm ci
      - run: cd frontend && npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.E2E_VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.E2E_VITE_SUPABASE_ANON_KEY }}
      - run: cd frontend && npm run preview -- --port 4173 &
      # Backend (invoice path hits POST /api/billing/invoices on :3001)
      - run: cd backend && npm ci && npm run build
      - run: cd backend && node dist/index.js &   # TODO: confirm backend start cmd/port 3001
      # Wait for both, then run
      - run: npx --yes wait-on http://localhost:4173 http://localhost:3001/api/health
      - run: cd frontend && npx playwright test -c e2e/playwright.config.ts
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: frontend/playwright-report/
          retention-days: 14
```
Then optionally gate merges by adding `e2e` to required status checks (branch protection).

## 5. Remaining TODOs (blocking a green run)
1. **Add `@playwright/test` devDependency** to `frontend/package.json` + lockfile (scaffold does not install deps). Nothing runs without it.
2. **Provision a test-tenant finance user** and wire `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` as CI secrets; `auth.setup.ts` skips (whole suite skips) until set. Invoice create needs a `FINANCE_ROLES` account.
3. **Seed deterministic test data**: active students in grade `Grade1` (attendance) and a known searchable student for the invoice dialog (`E2E_STUDENT_QUERY`); confirm fee categories exist.
4. **Stand up both servers in CI**: frontend preview on 4173 AND Express backend on 3001 (proxy target); confirm backend start command and a health endpoint for `wait-on`. Verify Supabase env for both build (`VITE_*`) and runtime.
5. **Verify guessed selectors / post-login landmark** (all `// TODO(verify-selector)` marks): login redirect URL assertion, attendance submit + saved-panel text, invoice dialog student-result + "SAR" amount + "Invoice Created". Recommend adding `data-testid`s (`attendance-submit`, `new-invoice`, `student-result`, `invoice-submit`) to remove text/i18n fragility.
