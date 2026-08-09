---
name: testing-multicountry-jurisdiction
description: End-to-end multi-country jurisdiction verification for EduSaga 360 across SA, AE, and QA tenants on Supabase.
---

# Multi-Country Jurisdiction Testing

## When to use
- Verify the `AE` (UAE) and `QA` (Qatar) country packs after applying migrations.
- Run regression checks against `SA` (Saudi) golden snapshots.
- Test cross-border branch groups and issue #202 Saudi-UI leakage.

## Devin Secrets Needed
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_ACCESS_TOKEN`

## One-time environment setup
1. `cd /home/ubuntu/repos/edusaga-360/backend && npm run dev`
2. `cd /home/ubuntu/repos/edusaga-360/frontend && npm run dev`
3. Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present in `frontend/.env`.
4. Confirm AE/QA migrations are applied and `jurisdictions`, `currencies`, `jurisdiction_tax_rules`, `regulatory_register`, and `jurisdiction_features` contain AE/QA rows.

## Seeded test data
- Use `backend/tmp-seed-task11.ts` (or an equivalent) to create `TASK11-` tenants, branches, admin auth users, students, guardians, academic years, and fee categories.
- Every tenant must be created with `is_demo = true`.
- All entity names must be prefixed `TASK11-`.

## Quick tests
- `POST /api/billing/invoices` with a fee line → verify `vat_summary`, `subtotal`, `total_amount` and that `zatca_status` is `not_applicable` for AE/QA.
- `POST /api/payroll/gosi-calculate` and `GET /api/payroll/wps-file` → expect `501 NotImplementedInJurisdiction` for AE/QA.
- `POST /api/payroll/calculate` with active employees → expect `501 NotImplementedInJurisdiction` for AE/QA.
- `GET /api/exec/ceo` and `/api/exec/chro` for a cross-border tenant → may fail with `academic_years.academic_year does not exist` if the metrics query has not been updated.

## Known limitations / workarounds
- The `invoices.currency_code` column defaults to `SAR`; end-to-end invoices for AE/QA may still display `SAR` until the billing route writes the pack currency.
- The frontend invoice details page (`InvoiceDetails.jsx`) and dashboard still render Saudi labels, `SAR`, and Hijri dates for AE/QA tenants — this is issue #202 evidence and should not be “fixed” during testing.
- Login typing can be unreliable; refreshing `/school-login` and using triple-click to select input fields usually works.
- `auth.users` cleanup may require `audit_logs` to be deleted first because of a FK from `audit_logs` to `tenants`.

## Cleanup
1. Run a script that deletes in dependency order:
   - `audit_logs`
   - `moyasar_payments`, `payments`, `invoice_discounts`, `invoices`
   - `fee_structures`, `fee_categories`, `discount_rules`
   - `employee_attendance`, `employees`, `students`, `guardians`
   - `academic_years`, `users`, `branches`, `tenants`
   - `auth.users` with `task11-*` emails
2. Re-run the pre-flight counts and verify they match the baseline.

## Frontend jurisdiction-gating checks
- Log in as a tenant with `jurisdiction_code='AE'` (`is_demo=true`).
- Dashboard: no Hijri date, no `ZATCA Filing`/`ملف زاتكا` quick action, no Saudization/Nitaqat, no GOSI widgets, no nationality split.
- Payroll: no `GOSI Submissions`/`Bank Exports` sidebar items, no Saudi/non-Saudi split, no GOSI cards.
- VATManagement: rate shown should match the jurisdiction tax rule (e.g. 5% for AE, 15% for SA, 0% for QA).

### Common pitfalls
- `jurisdiction_features` may be populated for a service-role query but invisible to the frontend if RLS is not configured, so `JurisdictionFeatureProvider` will load an empty feature set and hide all gated UI for **every** jurisdiction. Verify with an authenticated `fetch` using the anon key + user's access token.
- `frontend/src/lib/vatRate.js` falls back to `0.15` when `tenant.vat_rate` is missing. The `tenants` table currently has no `vat_rate` column, so `VATManagement` will show 15% for AE/QA unless `getVatRate` is updated to read `jurisdiction_tax_rules`.
- Currency labels on Dashboard/Payroll/VAT (`SAR`) are not jurisdiction-aware and will leak on AE/QA screens.
- `frontend/src/pages/Fees.jsx` has `InvoicesTab` and `NewInvoiceDialog` components that reference `tenant` without receiving it as a prop; the page may crash with `ReferenceError: tenant is not defined` before any localization can be verified.
- `frontend/src/components/subscription/ClientSubscriptionPortal.jsx` should use `tenant?.vat_rate ?? 0.15` for add-seat/upgrade order summaries; verify the VAT line reads `5%` for AE, `0%` for QA, and `15%` for SA.
- `frontend/src/pages/CanteenManagement.jsx` previously contained hardcoded Saudi MOE compliance text; verify it now shows generic school policy for AE/QA.
- `frontend/src/pages/Fees.jsx` previously displayed a `ZATCA المرحلة 2` engine card and a `ZATCA` column in the Invoices table for all jurisdictions; verify the card/column are gated behind `einvoicing` features.
- `frontend/src/components/payroll/PayrollSettings.jsx` previously showed Saudi GOSI settings for AE/QA; verify the GOSI tab/content is gated behind `isFeatureEnabled('gosi')`.
- `frontend/src/components/subscription/ClientSubscriptionPortal.jsx` should format plan prices and the footer in the tenant's pack currency and use `tenant?.vat_rate` for add-seat VAT.
- `ExecutiveCommandCenter` can fail for two independent reasons:
  - **Backend:** `MetricsService.computeAndStoreAll` guards `pack.regulatorReports.calculateNitaqat` by presence (`if (pack.regulatorReports?.calculateNitaqat)`) but the AE/QA packs *implement* the method and throw `NotImplementedInJurisdiction` inside it, so `GET /api/exec/{persona}` still returns HTTP 500 for AE/QA. The guard must also catch the thrown error (or check a capability flag) for ECC to load cross-border.
  - **Frontend (fixed in commit 5b13816):** `ExecutiveCommandCenter.jsx` now calls `useTenant()` inside `CEODashboard`, `CFODashboard`, and `COODashboard`, and `CHRODashboard` destructures `nitaqat` as `nationalisation` and uses `isFeatureEnabled` for the nationalisation band card. Saudi ECC CEO/CFO/CHRO now render without `ReferenceError: tenant is not defined`.
- If the Dashboard/Fees/VAT briefly shows currency symbol `XXX` after switching tenants, `getJurisdictionContext` may be returning a stale cached promise. A hard browser refresh (`Ctrl+R`) forces `TenantContext` to re-fetch the pack-derived localization.
- `frontend/src/pages/Payroll.jsx` renders `PayrollSettings` as a tab (`case 'settings'`); there is no standalone `/PayrollSettings` route.

## Regression checks
- `npm run typecheck` (backend)
- `npx madge --circular src/index.ts` (backend)
- `npm test` (backend)
- `python3 .github/scripts/guard_country_literals.py`
- `python3 .github/scripts/guard_jurisdiction_resolution.py`
- `python3 .github/scripts/guard_invoices_balance.py`
- `git diff origin/main -- src/__tests__/golden/snapshots/`
