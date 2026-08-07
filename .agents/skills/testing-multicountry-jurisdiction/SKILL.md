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

## Regression checks
- `npm run typecheck` (backend)
- `npx madge --circular src/index.ts` (backend)
- `npm test` (backend)
- `python3 .github/scripts/guard_country_literals.py`
- `python3 .github/scripts/guard_jurisdiction_resolution.py`
- `python3 .github/scripts/guard_invoices_balance.py`
- `git diff origin/main -- src/__tests__/golden/snapshots/`
