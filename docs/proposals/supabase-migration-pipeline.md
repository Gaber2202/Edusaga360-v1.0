# Proposal: Automated Supabase Migration Pipeline

## Problem

Database migrations in `shared/database/migrations/` are applied by hand through the Supabase SQL Editor / Management API. There is no automated step in CI/CD, so:

- 10 repo migrations are unapplied in production, causing 22 live crash-path tables and several missing columns.
- `supabase_migrations.schema_migrations` contains entries whose `name` values do not match current repo filenames, making name-based drift detection unreliable.
- The generated-column invoice-balance migration must run *after* application code is deployed, so a naive "deploy then migrate" pipeline would break production.

This proposal describes an automated, verified pipeline that applies migrations in order, fails CI on drift, and reconciles the existing unapplied migrations.

## 1. How migrations are applied automatically on deploy

### 1.1 Runner

Add `scripts/applyMigrations.mjs` (Node, `tsx`/`tsm`) that runs inside a GitHub Actions job:

1. Load `shared/database/migrations/*.sql` sorted by filename.
2. Read production `supabase_migrations.schema_migrations` via the Management API (`/v1/projects/{ref}/database/query`) to obtain already-applied `name`s.
3. For each repo file not yet applied, execute the SQL through `POST /v1/projects/{ref}/database/migrations` with:
   - `name` = migration filename without `.sql`
   - `query` = the full file contents, with each file automatically wrapped in `BEGIN; SET lock_timeout = '5s'; SET statement_timeout = '120s'; <migration> COMMIT;`
4. On error, stop and report the failing migration name; do not proceed to later files.
5. Record success in a local manifest so the same run is idempotent.

### 1.2 Deployment order

Two migration categories are needed because some schema changes must wait for code:

- **`pre_deploy` (default)** — new tables/columns that the new code needs. Applied before the backend is deployed.
- **`post_deploy`** — changes that break old code, e.g. adding a generated column that old code still tries to write. Marked by a comment in the migration header: `-- post_deploy: true`.

The `deploy-production.yml` workflow is updated to:

1. `verify-migrations` job (dry-run, must pass).
2. `apply-migrations pre_deploy` job.
3. `deploy-backend` and `deploy-frontend` jobs.
4. `apply-migrations post_deploy` job (manual approval or automatic after a smoke test).

`20260801_task3e_invoice_balance_generated.sql` is marked `post_deploy` so it runs after the backend no longer writes `balance`.

### 1.3 Idempotency

Every migration must be written to be re-runnable:

- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `DROP POLICY IF EXISTS ...` / `CREATE POLICY ...`
- `CREATE INDEX IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`

The runner skips files already present in `schema_migrations` by `name`, and a transaction rollback on error means a failed migration is not recorded.

## 2. How CI fails when a repo migration is not applied

Add a `verify-migrations` CI job and a `scripts/verifyMigrations.mjs` script that checks the production schema against every repo migration instead of relying on `name`.

For each repo file the script extracts the SQL objects it is expected to create or alter and queries system catalogs:

- `CREATE TABLE` → `information_schema.tables`
- `ALTER TABLE ... ADD COLUMN` → `information_schema.columns`
- `CREATE INDEX` → `pg_indexes`
- `CREATE POLICY` → `pg_policies`
- `CREATE OR REPLACE FUNCTION` → `pg_proc`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` → `pg_class.relrowsecurity`
- Generated columns → `information_schema.columns.is_generated`
- Foreign keys → `information_schema.table_constraints` / `pg_constraint`

If an expected artifact is missing, CI fails with the migration filename and missing object. This protects against manual migrations that were never recorded, migrations applied under the wrong `name`, and future drift.

The same verification is run in two modes:

- **PR mode**: only verify that the *new* migration files in the PR can be reconciled with the current production state (i.e. the next apply will succeed). Does not write to production.
- **Pre-deploy mode**: full verification that every repo migration is reflected in production before any deploy proceeds.

## 3. Reconciling the 10 unapplied migrations

The current 10 unapplied migrations need to be inspected for conflicts before they are applied. Proposed reconciliation:

| Migration | Conflict / note | Reconciliation |
|---|---|---|
| `20260606_attendance_policy.sql` | Creates `attendance_policies`; adds `employee_attendance.late_minutes` | Apply as-is; `attendance_policies` is a core payroll dependency. |
| `20260606_benchmarks_marketplace.sql` | Creates `benchmark_snapshots`, `marketplace_reviews`, `marketplace_vendors`, `procurement_requests` | Apply as-is; hide behind feature flags until used. |
| `20260606_communications_payment.sql` | Adds `communications.reference_id` | Apply as-is. |
| `20260606_leave_approval_chains.sql` | Creates `holidays`, `leave_approval_chains`, `leave_balance_audits`; adds `leave_requests.current_level` | Apply as-is; core for leave. |
| `20260622_hr_module_jisr_enhancements.sql` | Creates 11 HR/employee tables (`announcements`, `card_transactions`, etc.) | Apply as-is; the 18 non-core crash-path features should be hidden behind flags. |
| `20260701_gl_branch_dimension.sql` | Adds `branch_id` to `journal_entries`, `journal_entry_lines`, `payments` | `payments.branch_id` already exists; rewrite to add the column only to `journal_entries` and `journal_entry_lines`, or use `ADD COLUMN IF NOT EXISTS` for all three. |
| `20260702_tenant_ai_config.sql` | Creates `tenant_ai_providers` | Apply as-is; hide AI config behind feature flag until Yamen AI is enabled. |
| `20260712_ats_connectors.sql` | Creates `ats_connectors`, `hr_candidates` | Apply as-is; hide recruitment module. |
| `20260712_email_connectors.sql` | Creates `email_connectors`, `email_messages` | Apply as-is; hide email-connectors module. |
| `20260801_task3e_invoice_balance_generated.sql` | Converts `invoices.balance` to generated; must run after code no longer writes `balance` | Mark `post_deploy`; run after `guard_invoices_balance.py` passes in CI and backend is deployed. |

Extra conflict: `20260611_schema_cleanup.sql` was flagged as partially unapplied because it tries to add `fee_structures.currency`. Production now has `fee_structures.currency_code` (renamed by `20260801_task3_category_b_c.sql`). That part is superseded and should be skipped; the rest of the migration (`is_mandatory`, `amount`, `academic_year_label`, etc.) is already present.

Reconciliation workflow:

1. Create a `migrations_manifest.json` in `shared/database/` that records `applied`, `superseded`, and `pending` states, plus rewrite notes.
2. For each conflicting migration, create a new PR that either:
   - updates the SQL to be safe against the current schema, or
   - marks it `superseded_by` another migration and records a no-op `name` in `schema_migrations`.
3. Apply the reconciled migrations through the new runner in a maintenance window.

## 4. Verifying the 48 "applied or DDL-only" files

Yes — they can and should be verified by artifact, not by filename.

`scripts/verifyMigrations.mjs` parses every repo migration and checks the matching PostgreSQL catalog entries. For the 9 DDL-only files (indexes, RLS, functions, seed data) the parser uses the specific object type:

- `20260610_security_hardening.sql` → verify `users_self`, `users_platform_owner`, `tenants_read_own`, etc. policies exist.
- `20260704_rls_initplan_wrap.sql` → verify the expected `initplan` policies/functions.
- `20260702_performance_indexes.sql` / `20260728_exec_dashboard_indexes.sql` → verify each `CREATE INDEX` name exists in `pg_indexes`.
- `20260701_atomic_journal_posting.sql` → verify `post_journal` function exists in `pg_proc`.
- `20260612_demo_seed_data.sql` → seed data only; either mark as `manual` with a row-count check, or exclude from automated verification because it is not schema.
- `20260801_task1_set_is_demo_true.sql` → data-only; verified by checking the demo tenant `is_demo=true`.

For applied migrations whose `schema_migrations.name` differs from the repo filename (e.g. `tenant_files_bucket_rls_policies` → `20260629_tenant_files_bucket_rls.sql`, `rls_initplan_wrap_batch1`/`batch2` → `20260704_rls_initplan_wrap.sql`), the verification script matches by content hash or artifact list and records the mapping in `migrations_manifest.json`.

The manifest becomes the single source of truth:

```json
{
  "migrations": [
    {
      "file": "20260629_tenant_files_bucket_rls.sql",
      "applied_names": ["tenant_files_bucket_rls_policies"],
      "verify": { "policies": ["..."] }
    },
    {
      "file": "20260704_rls_initplan_wrap.sql",
      "applied_names": ["rls_initplan_wrap_batch1", "rls_initplan_wrap_batch2"],
      "verify": { "policies": ["..."] }
    }
  ]
}
```

## 5. Required pattern: expand-contract for column renames

Column renames (e.g. `currency` → `currency_code`, `amount_halala` → `amount_minor`) must use an expand-contract sequence, not a hard `ALTER TABLE ... RENAME COLUMN`. The `20260801_task3_category_b_c.sql` migration worked only because production had no real users at the time; with a live school, a hard rename creates an outage window between the migration and the deployed code.

The pipeline must enforce this pattern:

1. **Add the new column** — `ALTER TABLE t ADD COLUMN new_name TYPE;`.
2. **Backfill and dual-write** — update application code to write both old and new columns (or use a trigger/view to keep them in sync), and migrate existing rows.
3. **Move reads to the new column** — update all `SELECT` references to the new column.
4. **Drop the old column** — only after the previous steps have been deployed and verified.

For the `invoices.balance` generated-column change, the same principle applies in reverse: the migration must be marked `post_deploy` and run only after the application code no longer writes the column.

## Outcome once implemented

- Every push to `main` automatically applies pending migrations.
- CI blocks deploys when production schema does not match the repo.
- The 10 unapplied migrations are reconciled and applied in a controlled order.
- `invoices.balance` becomes generated only after the backend code that writes it is deployed.
- The pipeline is reversible: failed migrations roll back and stop the deploy.
