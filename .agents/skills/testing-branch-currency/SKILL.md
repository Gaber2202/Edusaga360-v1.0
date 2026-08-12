---
name: Testing local branch/currency switching
description: How to end-to-end test branch filtering and per-row currency on the EduSaga 360 local dev stack.
---

# Local branch/currency testing notes

## Dev stack
- Backend: `cd /home/ubuntu/repos/edusaga-360/backend && npm run dev` (port 3001)
- Frontend: `cd /home/ubuntu/repos/edusaga-360/frontend && npm run dev` (port 5173)
- Frontend `.env` must contain `VITE_API_BASE_URL=http://localhost:3001` or Vite will log `[supabaseClient] VITE_API_BASE_URL is not set` (non-fatal because Vite proxies `/api`, but the env var should be set).

## Cross-border test tenant
- Admin: `task15-cross-admin-msnoi06c@edusaga360.com` (credentials created per-session; regenerate as needed)
- Branches: TASK15-Riyadh (SAR), TASK15-Dubai (AED), TASK15-Doha (QAR)
- Known invoices: INV-2026-000001 SAR 2,575; INV-2026-000003 AED 2,525; INV-2026-000004 QAR 2,500 (plus one Riyadh credit note).

## Saudi-only regression tenant
- Admin: `task15-saudi-admin-msnoi06c@edusaga360.com` (credentials created per-session; regenerate as needed)
- Single branch (TASK15-Riyadh) and SAR-only totals.

## UI navigation
- After login, go to `/fees`.
- Tabs: `لوحة التحكم` = Dashboard, `الفواتير` = Invoices.
- Global branch selector is the first button in the top header.
- Recent invoices / invoice tables show row-level currency. Totals-by-currency appear under the Invoices tab for multi-currency tenants.

## Console checks
- Clear localStorage (delete `erp_selected_branch`) to test cold load.
- Search console for `[localization] formatCurrency called without a resolved currencyCode`; there should be none.
- Pre-existing warnings (`React Router Future Flag`, `tenantQuery('notification_recipients'): tenantId is not set`) are unrelated to branch/currency.

## Devin Secrets Needed
- None for UI login (create demo credentials per-session; do not commit or signpost them).
