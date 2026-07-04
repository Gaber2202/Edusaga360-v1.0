# EduSaga 360 — RLS & Tenant-Isolation Audit

**Date:** 2026-07-04 · **Source:** live database (`mhbfvewkjlfmkqdhxpyg`), read-only
Supabase advisors + `list_tables`. This is authoritative (queried from the running
DB), not inferred from migrations.

## Headline

- **69 tables in `public`. Every one has RLS ENABLED.** ✓ No table is left open.
- **7 tables have RLS enabled but NO policy** → they are **deny-all** to the API
  roles (safe by default; some are functionality notes, not holes — see below).
- Tenant isolation is enforced by two layers: (1) RLS policies scoped by
  `tenant_id` for the `authenticated`/`anon` roles, and (2) the backend, which
  uses the `service_role` key (bypasses RLS by design) and must add explicit
  `.eq('tenant_id', …)` on every query — this is covered by dedicated tests
  (`rf006-tenant-idor`, `tenant-isolation`, `rbac-isolation`).

## Tables with RLS enabled but no policy (deny-all)

| Table | Assessment | Action |
|-------|-----------|--------|
| `tenant_requests` | Backend-only (service_role) — used by subscription/billing. Deny-all to clients is **correct**. | None (verify no client reads it directly). |
| `platform_audit_log` | Platform-owner/audit table, backend-written. Deny-all is **correct**. | None. |
| `app_settings` | Backend-only settings. Deny-all likely correct. | Confirm no client read needed. |
| `roles` | Reference/lookup. If the client needs to render role lists, a **read-only** policy is needed; otherwise fine served via backend. | Verify; add `SELECT` policy only if the client reads it. |
| `countries` | Reference/lookup (dropdowns). | Same as `roles`. |
| `currencies` | Reference/lookup. | Same as `roles`. |
| `public_settings` | Named "public" — if it's meant to be world-readable, it currently is **not** (deny-all). | Confirm intent; add `SELECT USING (true)` if truly public. |

> These are **INFO**-level advisor notices, not vulnerabilities. Deny-all fails
> closed. The only risk is a *functionality* gap if the app expects client-side
> reads of the reference tables — flagged for a 10-minute verification.

## Full RLS matrix (all 69 tables — RLS enabled = ✓ for every row)

Tenant-scoped domain tables (RLS ✓, tenant-scoped policy + app-layer `tenant_id`):
`tenants`, `branches`, `students`, `guardians`, `student_contracts`,
`student_tags`, `applicants`, `applications`, `employees`, `employee_contracts`,
`employee_attendance`, `departments`, `job_titles`, `sections`, `grades`,
`academic_years`, `invoices`, `invoice_batches`, `invoice_discounts`,
`payments`, `payment_plans`, `payment_plan_installments`, `fee_structures`,
`fee_categories`, `fee_types`, `discount_rules`, `special_care_fees`,
`dunning_log`, `cheques`, `cheque_status_history`, `chart_of_accounts`,
`journal_entries`, `journal_entry_lines`, `fiscal_periods`, `cost_centers`,
`expenses`, `vendors`, `purchase_requisitions`, `purchase_orders`,
`fixed_assets`, `pay_runs`, `payslip_lines`, `leave_requests`, `leave_balances`,
`leave_types`, `overtime_requests`, `communications`, `notifications`,
`contract_templates`, `service_tickets`, `vehicles`, `bus_routes`,
`zatca_submissions`, `audit_logs`, `system_errors`, `exec_dashboard_access`,
`exec_brief_cache`, `exec_vitality_weights`, `tenant_user_requests`.

Platform / cross-tenant (RLS ✓, platform-owner or backend policies):
`users`, `registration_requests`, `platform_invitations`, `platform_audit_log`.

Reference / no-policy (RLS ✓, see table above):
`app_settings`, `countries`, `currencies`, `public_settings`, `roles`,
`tenant_requests`.

> Basis: "RLS enabled" and "has policy" are from the live DB (authoritative).
> Per-table tenant-scoping is asserted from the isolation model + the security
> migrations (`20260610_security_hardening.sql`, `20260610_standardize_jwt_tenant_claim.sql`)
> and the isolation test suite. Recommended pre-launch: a scripted spot-check that
> logs in as tenant A and confirms zero rows from tenant B on the top 10 tables
> (students, invoices, payments, employees, journal_entries…).

---

## Performance advisories (live DB) — RLS at scale

These are the findings that matter for "thousands of students, spike loads." All
are from the live performance advisor.

| Finding | Count | Level | What it means | Fix pattern |
|---------|:----:|-------|---------------|-------------|
| `auth_rls_initplan` | **54** | WARN | RLS policies call `auth.uid()`/`auth.jwt()` directly, so Postgres re-evaluates them **per row**. Kills performance at scale. | Wrap in a scalar subquery: `USING (tenant_id = (select auth.jwt() ->> 'tenant_id'))` — evaluates once per query. |
| `multiple_permissive_policies` | **258** | WARN | A table has several *permissive* policies for the same role+action; **every** one is evaluated on every query. | Consolidate into one policy per role+action (use `OR`), or make some `RESTRICTIVE`. |
| `unused_index` | 98 | INFO | Indexes never used — pure write/storage overhead. | Drop after confirming (reversible). |
| `unindexed_foreign_keys` | 10 | WARN | FK columns with no covering index → slow joins & cascade deletes. | Add a b-tree index on each FK column. |
| `duplicate_index` | 1 | INFO | Two identical indexes. | Drop one. |

### Recommended remediation order (Day-2/Day-3 work, not done this pass)

1. **`auth_rls_initplan` (54)** — highest ROI. Rewrite the flagged policies to
   wrap `auth.*()` in `(select …)`. Must be done per-policy in a reversible
   migration, verified against the isolation tests. **Not auto-fixed here** — it
   touches every tenant policy and needs careful review to avoid weakening
   isolation.
2. **`unindexed_foreign_keys` (10)** — add covering indexes (safe, additive).
3. **`multiple_permissive_policies` (258)** — consolidate; large but mechanical.
4. **`unused_index` (98)** + **`duplicate_index` (1)** — drop after a usage window.

> Why not fixed in this pass: each is a schema change to live tenant-security
> objects. Per the sprint's prime directives, these are documented with exact fix
> patterns rather than applied blind. They are the core of the Day-2/Day-3 DB
> performance work.

## Other security-advisor findings

- **SEC-DEF-01 (WARN, FIXED via migration `20260704_revoke_anon_pii_function_execute.sql`):**
  `encrypt_employee_pii()`, `encrypt_guardian_pii()`, `encrypt_student_pii()` were
  executable by `anon`/`authenticated` via RPC. No app code calls them; migration
  revokes EXECUTE from public roles. **Needs to be applied to the DB** (see PR).
- **Schema drift:** those three functions exist in the DB but in **no in-repo
  migration**. Recommend capturing their definition into a migration for
  reproducibility (extends `SCHEMA_DRIFT_REPORT.md`).
- **Auth — leaked-password protection disabled (WARN):** enable the
  HaveIBeenPwned check in Supabase Auth settings (dashboard toggle, 2 minutes).
  Blocks users from choosing known-breached passwords.
