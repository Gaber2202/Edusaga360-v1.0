# EduSaga 360 — Platform Security & QA Findings Log
**Date:** 2026-06-10
**Reviewed by:** Principal Engineering Audit (Phases 0–5)

---

## PHASE 0 — Codebase Orientation

### Summary
- **Monorepo:** `frontend/` (main ERP), `admin-portal/`, `parent-portal/`, `backend/` (Express/Railway), `shared/database/`
- **Stack:** React 18 + TanStack Query v5, Supabase (hosted), Express + TypeScript, Vercel deployments
- **No local Supabase CLI** — migrations run manually via SQL Editor
- **11 migration files** in `shared/database/migrations/`
- **1,023** `tenantQuery()` calls vs 12 raw `supabase.from()` bypasses
- **Gov integrations** (GOSI, Qiwa, Mudad, Muqeem, Absher) are UI stubs only — no live API calls

---

## PHASE 1 — Database Integrity

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| 1A-01 | CRITICAL | Duplicate `fee_structures` table — billing engine schema silently skipped | Open |
| 1C-01 | CRITICAL | `users` table had no RLS — all user records exposed cross-tenant | FIXED |
| 1C-02 | CRITICAL | `tenants` table had no RLS — plan limits writable by any tenant user | FIXED |
| 1B-01 | CRITICAL | `users.tenant_id` nullable — no NOT NULL constraint | Open |
| 1A-02 | HIGH | `tenants.monthly_revenue` missing precision/scale | FIXED |
| 1C-03 | HIGH | `registration_requests` no RLS — `onboarding_token` exposed | FIXED |
| 1C-04 | HIGH | `system_errors` no RLS — stack traces exposed cross-tenant | FIXED |
| 1C-05 | HIGH | 6 tables use `current_setting()` RLS — locks users out and breaks isolation | FIXED |
| 1C-06 | HIGH | `tenant_user_requests` SELECT-only — INSERT/UPDATE silently denied | FIXED |
| 1B-02 | HIGH | `audit_logs.tenant_id` nullable | Open |
| 1B-03 | HIGH | `system_errors.tenant_id` no FK, no RLS | FIXED |
| ENV-01 | HIGH | Railway prod URL hardcoded fallback in `supabaseClient.js` | FIXED |
| 1C-07 | HIGH | `platform_invitations` RLS enabled but zero policies | Open (intentional) |
| 1A-09 | MEDIUM | `20260610` migration references ~30 non-existent tables | Open |
| 1C-08 | MEDIUM | `benchmark_snapshots` FOR ALL USING(TRUE) | FIXED |
| 1C-09 | MEDIUM | `marketplace_vendors` FOR ALL USING(TRUE) | FIXED |
| 1C-10 | MEDIUM | `marketplace_reviews` cross-tenant reads | FIXED |
| 1A-03 | MEDIUM | Dual `created_at`/`created_date` columns | Open |
| 1A-04 | MEDIUM | `payment_plans.student_id` missing FK | FIXED |
| 1A-05 | MEDIUM | `invoice_discounts.invoice_id` missing FK | FIXED |
| 1A-06 | MEDIUM | `dunning_log` FK constraints missing | FIXED |
| INT-01 | MEDIUM | Gov integrations are UI-only stubs | Open |
| 1A-07 | LOW | Mixed UUID generation functions | Open |

---

## PHASE 2 — Authentication & RBAC

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| 2B-1 | CRITICAL | `/SuperAdminDashboard` route had no role guard | FIXED |
| 2B-2 | HIGH | Backend routes lack role enforcement — frontend-only RBAC | Open |
| 2B-3 | MEDIUM | `user_metadata` fallback in auth middleware enables self-escalation | FIXED |
| 2A-3 | MEDIUM | `/api/auth/me` read role/tenant from user-writable `user_metadata` | FIXED |
| 2A-1 | MEDIUM | JWT forwarded as URL query parameter | Open |
| 3B-1 | HIGH | `/api/admin` no router-level auth default | Open |
| 2A-2 | LOW | Dead `checkUserAuth` references in `ProtectedRoute` | Open |

---

## PHASE 3 — API Security

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| 3A-1 | HIGH | SQL injection in `billing.ts:657` — `req.params.id` in raw `.filter()` subquery | FIXED |
| 3A-2 | MEDIUM | `ADMIN_LINK_SECRET` defaults to `change-me-in-production` | Open |
| 3A-3 | MEDIUM | `/api/registration/resend/:id` unauthenticated | FIXED |
| 3A-4 | LOW | `error.message` forwarded verbatim in 500s — leaks internals | Open |
| 3C-3 | MEDIUM | No Content-Security-Policy headers on frontend SPA | Open |

---

## PHASE 4 — Data Security

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| 4A-1 | CRITICAL | PII plain TEXT — `national_id`, `iqama_number`, `passport_number`, `bank_iban` unencrypted | Open |
| 4B-1 | CRITICAL | `/api/files/upload` endpoint missing — 11 call sites broken | FIXED |
| 4C-1 | CRITICAL | `audit_logs` FOR ALL policy allowed DELETE by tenant users | FIXED |
| 4A-2 | HIGH | `employees` SELECT * exposes PII/salary in 8+ non-payroll components | Open |
| 4B-2 | HIGH | Files use `getPublicUrl` — permanent public URLs, no bucket RLS | FIXED |
| 4B-3 | HIGH | File type validation is client-side only | FIXED |
| 4C-2 | HIGH | `AuditService.jsx` wrote to non-existent columns — all audit writes silently failing | FIXED |
| 4C-3 | HIGH | `ip_address` hardcoded to `'client'` — real IP never captured | Partial |
| 4C-4 | HIGH | Missing audit logging: payroll runs, login, role changes, exports | Open |
| 4B-4 | MEDIUM | No file size limits on upload forms | FIXED |

---

## PHASE 5 — Functional Modules

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| 5B-1 | HIGH | Invoice line amounts accept negative values | FIXED |
| 5B-2 | HIGH | Discount can exceed invoice total — negative balance stored | FIXED |
| 5C-1 | MEDIUM | Journal entries: negative debit/credit accepted | FIXED |
| 5A-1 | MEDIUM | Admissions: no pagination on applications query | Open |
| 5B-3 | MEDIUM | Invoice: no due_date >= issue_date validation | Open |
| 5C-2 | MEDIUM | Journal entries: no role check before approve | Open |
| 5C-3 | LOW | Journal entries: no pagination | Open |
| 5D-1 | HIGH | PayRunsList: all employee PII fetched without LIMIT | Open |
| 5D-2 | MEDIUM | Pay run duplicate check client-side only — race condition | Open |
| 5D-3 | MEDIUM | No role check before creating pay run | Open |
| 5F-1 | MEDIUM | Gov integration forms: no role check | Open |

---

## Totals

| Severity | Found | Fixed | Open |
|----------|-------|-------|------|
| CRITICAL | 8 | 6 | 2 |
| HIGH | 18 | 12 | 6 |
| MEDIUM | 17 | 5 | 12 |
| LOW | 5 | 0 | 5 |
| **Total** | **48** | **23** | **25** |

> **Update 2026-06-29:** File-upload security cluster closed — `4B-1` (server-side
> `/api/files/upload` with magic-byte + size validation), `4B-3`, `4B-4`, and
> `4B-2` (signed URLs + `tenant-files` bucket RLS policies, migration
> `20260629_tenant_files_bucket_rls.sql`). Platform-owner uploads and HEIC/CSV
> types also fixed.

---

## Open Critical Items (Must Fix Before Production)

1. **PII encryption** — pgcrypto / Supabase Vault for `national_id`, `iqama_number`, `passport_number`, `bank_iban`
2. **`users.tenant_id` NOT NULL** — backfill nulls then enforce constraint
3. **Duplicate `fee_structures`** — reconcile schema conflict in new migration

✅ ~~**File upload endpoint** — create `/api/files/upload` with server-side validation~~ — done 2026-06-29.
