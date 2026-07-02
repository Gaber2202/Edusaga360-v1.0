-- SC-007 — hot-path performance indexes for the 20k-concurrent-user target.
--
-- The N+1 / query scan (audit_logs/n_plus_one_findings.md) found several
-- frequently-filtered columns with no supporting index. Under load — especially
-- the executive/finance dashboards and the 8 AM billing run — these force
-- sequential scans of a tenant's rows on every request. The worst offender is
-- `expenses`, which had NO index of any kind, so every dashboard call
-- full-scanned it.
--
-- All indexes are tenant-leading composites so they serve the tenant filter
-- (present on every query, since the service-role client bypasses RLS) plus the
-- range/equality column used alongside it. All are additive and idempotent.
--
-- Query shapes these support (file:line from the scan):
--   invoices .eq(tenant_id).gte(date)          exec.ts:168/217/476
--   invoices .neq(status).lte(due_date)        exec.ts:272, billing.ts:1232
--   invoices .eq(tenant_id).eq(academic_year)  billing.ts:1140, ai.ts:406
--   payments .eq(tenant_id).gte(date)          exec.ts:445
--   payments .eq(invoice_id)  (reconciliation lookups)
--   expenses .eq(tenant_id).eq(status).gte(date) exec.ts:169/218/477
--   students .eq(tenant_id).eq(status)         billing.ts:1126, exec.ts:530
--   students .eq(tenant_id).eq(academic_year)  exec.ts:187/188
--   zatca_submissions .eq(invoice_id)          billing.ts:775
--
-- NOTE for production rollout on already-large tables: consider applying these
-- as `CREATE INDEX CONCURRENTLY` (run each statement outside a transaction) to
-- avoid holding a write lock during the build. They are written as plain
-- `CREATE INDEX IF NOT EXISTS` here to match the repo's existing migration style
-- and to remain safe inside a transactional migration runner.

-- invoices — dashboards (date range) + dunning (due_date) + billing (academic_year)
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date          ON invoices (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_due_date      ON invoices (tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_academic_year ON invoices (tenant_id, academic_year);

-- payments — collections dashboard (date range) + reconciliation by invoice
CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON payments (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice     ON payments (invoice_id);

-- expenses — had zero indexes; dashboards filter tenant + approved status + date
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_status_date ON expenses (tenant_id, status, date);

-- students — active-student filters + per-academic-year enrollment counts
CREATE INDEX IF NOT EXISTS idx_students_tenant_status        ON students (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_students_tenant_academic_year ON students (tenant_id, academic_year);

-- zatca_submissions — status lookups keyed by invoice_id (indexed on invoice_number only)
CREATE INDEX IF NOT EXISTS idx_zatca_submissions_invoice ON zatca_submissions (invoice_id);
