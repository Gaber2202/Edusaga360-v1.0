# Tenant Isolation Scan — backend/src/routes/*.ts

**Context:** Every route builds its Supabase client with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses Postgres RLS. Multi-tenant isolation therefore depends entirely on each query explicitly constraining by `tenant_id` (or by a parent id already proven to belong to the caller's tenant). Any SELECT/UPDATE/DELETE on a tenant-scoped table without such a guard is a potential cross-tenant leak; any INSERT that omits `tenant_id` writes an unscoped row.

Scan date: 2026-07-02 · Files scanned: 23 · Query chains (`.from(...)`) scanned: ~359

## Summary

| Severity | Count |
|----------|-------|
| HIGH     | 4     |
| MED      | 10    |
| Intentionally-global (noted, not a finding) | many |

### HIGH findings (select/update/delete on tenant-scoped table with NO tenant scope)

| # | file:line | table | operation | notes |
|---|-----------|-------|-----------|-------|
| 1 | backend/src/routes/parents.ts:115 | students | UPDATE | `.update({ guardian_id }).eq('id', d.student_id)` — `student_id` taken straight from request body; no `tenant_id`. Cross-tenant write. |
| 2 | backend/src/routes/intake.ts:301 | applications | SELECT | verify-documents: `.select('*').eq('id', applicationId)` — `applicationId` from URL param, no `tenant_id`. Staff of tenant A can read tenant B's application (IDOR). |
| 3 | backend/src/routes/intake.ts:328 | applications | UPDATE | verify-documents: `.update({...}).eq('id', applicationId)` — no `tenant_id`. Cross-tenant write (docs/status/pipeline). |
| 4 | backend/src/routes/intake.ts:338 | students | UPDATE | verify-documents: `.update({...}).eq('application_id', applicationId)` — no `tenant_id`. Cross-tenant write. |

### MED findings (ambiguous / partial guard / conditional tenant_id)

| file:line | table | operation | notes |
|-----------|-------|-----------|-------|
| intake.ts:118 | applications | SELECT | duplicate check `.match({ national_id, branch_id, academic_year })` — no explicit `tenant_id`; `branch_id` (tenant-bound) gives partial scope but is unverified against the caller's tenant. |
| intake.ts:161 | applications | INSERT | `tenant_id` set only `if (tenantId)` (public intake, tenant may be absent) → can insert an unscoped row. |
| intake.ts:208 | students | INSERT | same conditional `tenant_id` guard. |
| intake.ts:174 / 180 | parent_intake_links | SELECT / UPDATE | by `id` only (from body), no `tenant_id`; public flow, only mutates a submission counter. |
| subscription.ts:417 / 453 | subscription_orders | SELECT / UPDATE | `/orders/:id/verify` fetches + marks verified by `id` only; gated by tenant `FINANCE_ROLES`, no `tenant_id` filter and no platform-owner gate → a tenant's finance user could verify another tenant's order. |
| subscription.ts:491 | subscription_orders | UPDATE | `/orders/:id/reject` updates by `id` only, no `tenant_id`. |
| subscription.ts:247 | tenant_requests | SELECT | `/orders/:id` fallback reads by `id` only. |
| subscription.ts:278 | tenant_requests | SELECT | `/orders/:id/payment-link` fallback reads by `id` only. |
| subscription.ts:382 / 388 | tenant_requests | SELECT / UPDATE | `/orders/:id/upload-proof` fallback by `id` only. |
| billing.ts:1417 | invoices | UPDATE | moyasar webhook updates by `id` only — but the invoice was just fetched by `id`+`tenant_id` (line 1402), so `id` is already tenant-proven; low risk, listed for completeness. |

### Intentionally-global tables (correct by design — NOT findings)
`tenants`, `registration_requests`, `platform_invitations`, `platform_audit_log`, `tenant_user_requests` (platform-owner views), `platform_settings` (key-scoped, e.g. `bank_details`, `intake_required_docs_<tenant>`), `benchmark_snapshots` (anonymised cross-tenant network pool by design), `marketplace_vendors` / `marketplace_reviews` (shared vendor catalog). All of `admin.ts` is gated by `requirePlatformOwner` and is legitimately cross-tenant. Webhook endpoints (`subscription.ts` moyasar webhook, `billing.ts` moyasar webhook) derive tenant from payment metadata and are system-scoped.

---

## Per-file detail

### exec.ts — CLEAN
All dashboard/data helpers filter `.eq('tenant_id', tenant_id)`. `tenant_id` resolved via `resolveTenantId` (own JWT tenant, or platform-owner query override only). `audit_logs`, `exec_dashboard_access`, `exec_vitality_weights`, `exec_brief_cache` inserts/upserts all carry `tenant_id`. `/tenants` list is platform-owner-only (global `tenants`).

### fees.ts — CLEAN
`invoices`, `payments`, `journal_entries`, `journal_entry_lines`, `chart_of_accounts`, `students` all scoped by `tenant_id`; every INSERT includes `tenant_id`.

### journalEntries.ts — CLEAN
`journal_entries` + `journal_entry_lines` inserts both set `tenant_id`.

### attendancePolicy.ts — CLEAN
`attendance_policies`, `employee_attendance`, `employees` all `.eq('tenant_id', ...)`; upserts/inserts set `tenant_id`; the default-unset UPDATE is scoped by `tenant_id`.

### invoices.ts — CLEAN
`zatca_invoices`, `invoices` scoped by `tenant_id`; upsert sets `tenant_id`. Parent download path additionally checks `linked_student_ids`. `tenants` read by `id` (global profile).

### benchmarks.ts — CLEAN (network pool intentionally cross-tenant)
`computeSnapshot` scopes every source query by `tenant_id`; `benchmark_snapshots` upsert sets `tenant_id`. The `GET /` pool query intentionally reads other tenants' snapshots (anonymised aggregate) — by design.

### notifications.ts — CLEAN
`communications`, `notifications` inserts set `tenant_id`; all reads/updates scoped by `tenant_id` (+ `user_id`).

### marketplace.ts — CLEAN
`procurement_requests` scoped by `tenant_id` (GET/POST/PUT); `marketplace_reviews` upsert sets `tenant_id`. `marketplace_vendors`/`marketplace_reviews` are the shared vendor catalog (global by design).

### payroll.ts — CLEAN
`employees`, `attendance_policies`, `employee_attendance`, `payslip_lines` scoped by `tenant_id`; `tenants` read by `id`.

### payslipPdf.ts — CLEAN
`employees`, `payslip_lines` scoped by `id`+`tenant_id`; `branches` by `id`+`tenant_id`; `tenants` by `id`.

### parents.ts — 1 HIGH
`/invite` (service endpoint, tenant_id from body): `users` and `guardians` reads scoped by `tenant_id`; `users`/`guardians` inserts set `tenant_id`; `users` update at line 67 is by `id` from an already-tenant-scoped row (OK). **HIGH line 115:** `students` UPDATE `.eq('id', d.student_id)` with no `tenant_id` — body-supplied student id, cross-tenant write.

### files.ts — CLEAN (no tenant-table DB queries)
Storage-only; tenant isolation enforced via `storageScope()` path prefix + `/sign` ownership check.

### cheques.ts — CLEAN
`cheques`, `cheque_status_history`, `invoices`, `payments` all scoped by `tenant_id`; inserts set `tenant_id`; updates by `id`+`tenant_id`.

### registration.ts — CLEAN (platform onboarding; global by design)
Operates on `registration_requests` and `tenants` (pre-tenant, global signup flow). `users` insert sets `tenant_id` from the approved request. Actions gated by HMAC signature or platform-owner/creator session.

### intake.ts — 3 HIGH, 4 MED
`platform_settings` key-scoped per tenant (OK). `pending-verifications` GET scoped by `tenant_id`. Notification inserts set `tenant_id`; `platform_audit_log` global.
- **MED line 118:** `applications` SELECT duplicate check, no `tenant_id` (branch_id partial scope).
- **MED line 161 / 208:** `applications` / `students` INSERT set `tenant_id` only `if (tenantId)`.
- **MED line 174/180:** `parent_intake_links` SELECT/UPDATE by `id` only.
- **HIGH line 301:** `applications` SELECT by `id` only (verify-documents IDOR).
- **HIGH line 328:** `applications` UPDATE by `id` only.
- **HIGH line 338:** `students` UPDATE by `application_id` only.

### tenantUsers.ts — CLEAN
Tenant-admin routes scope `users`/`tenant_user_requests` by `tenant_id`. Platform-owner routes (`/pending`, approve/reject) are gated by `is_platform_owner` and act by request `id` (global by design). `users` insert sets `tenant_id` from the request row.

### tenantRequests.ts — CLEAN
`tenant_requests` insert sets `tenant_id`; GET scoped by `tenant_id` unless platform owner.

### auth.ts — CLEAN (no tenant-table queries)
Only `supabase.auth` calls.

### leave.ts — CLEAN
`leave_types`, `leave_requests`, `leave_balances`, `leave_approval_chains`, `holidays`, `leave_balance_audits` all scoped by `tenant_id`. The few `.eq('id', bal.id)` balance updates use ids from prior tenant-scoped selects (OK). Inserts set `tenant_id`.

### subscription.ts — 6 MED
Primary `subscription_orders` paths (POST /orders insert, GET /orders list, payment-link primary, upload-proof primary) are properly scoped by `tenant_id`. MED items: verify (417/453) and reject (491) act on `subscription_orders` by `id` only under tenant `FINANCE_ROLES` with no tenant filter or platform gate; `tenant_requests` fallback reads/updates (247, 278, 382/388) are by `id` only. `platform_settings` bank_details is global. Webhook derives tenant from metadata (system-scoped).

### billing.ts — CLEAN (1 low note)
All invoice/payment/discount/plan/dunning/zatca/fee tables scoped by `tenant_id`. `id`-only updates (zatca sub.id, payment_plans planId, invoice line 804/1417) all follow a prior `tenant_id`-scoped fetch that proves the id belongs to the tenant. `resolveTenantId` honours query/header override only for platform owners. Webhook is system-scoped.

### admin.ts — CLEAN (platform-owner, cross-tenant by design)
Every endpoint calls `requirePlatformOwner`. `tenant_ai_providers` operations are scoped by the target `tenant_id` path param.

### ai.ts — CLEAN
Every `runTool` query filters `.eq('tenant_id', tenantId)`; `tenant_ai_providers` loaded scoped by `tenant_id`; `tenants` quota read by `id`.
