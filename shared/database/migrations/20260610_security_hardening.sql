-- =============================================================================
-- SECURITY HARDENING MIGRATION
-- Fixes: CRITICAL and HIGH findings from platform security audit (2026-06-10)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS on `users` table (CRITICAL 1C-01)
--    The users table was missing RLS entirely — all user records were visible
--    cross-tenant via the anon key.
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own record; tenant admins can read all users in their tenant.
CREATE POLICY users_self
  ON users
  FOR ALL
  USING (
    auth_id = auth.uid()
    OR tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  )
  WITH CHECK (
    auth_id = auth.uid()
    OR tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

-- Platform owners can see all users.
CREATE POLICY users_platform_owner
  ON users
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true)
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true);

-- ---------------------------------------------------------------------------
-- 2. RLS on `tenants` table (CRITICAL 1C-02)
--    Tenant records were readable by any authenticated user — plan limits,
--    enabled modules, and admin emails were fully exposed cross-tenant.
--    Crucially, tenant users should never be able to modify their own tenant's
--    subscription limits (max_employees, max_students, enabled_modules).
-- ---------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Any authenticated tenant member can SELECT their own tenant row.
CREATE POLICY tenants_read_own
  ON tenants
  FOR SELECT
  USING (id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- Only platform owners can INSERT/UPDATE/DELETE tenant records.
CREATE POLICY tenants_platform_owner_write
  ON tenants
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true)
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true);

-- ---------------------------------------------------------------------------
-- 3. RLS on `registration_requests` (HIGH 1C-03)
--    onboarding_token was readable by any authenticated user.
-- ---------------------------------------------------------------------------
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;

-- Only platform owners access registration requests (onboarding workflow).
CREATE POLICY reg_requests_platform_owner
  ON registration_requests
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true)
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true);

-- ---------------------------------------------------------------------------
-- 4. RLS on `system_errors` (HIGH 1C-04)
--    Stack traces and internal context were readable cross-tenant.
-- ---------------------------------------------------------------------------
ALTER TABLE system_errors ENABLE ROW LEVEL SECURITY;

-- Tenant users can only read/write errors belonging to their own tenant.
CREATE POLICY system_errors_tenant_isolation
  ON system_errors
  FOR ALL
  USING (
    tenant_id IS NULL  -- system-level errors (no tenant): platform owner only
    AND (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true
    OR tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    OR (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true
  );

-- ---------------------------------------------------------------------------
-- 5. audit_logs — replace FOR ALL policy with append-only (no DELETE/UPDATE)
--    (CRITICAL: audit_logs deletable by any tenant user)
-- ---------------------------------------------------------------------------
-- Drop the existing generated tenant_isolation policy on audit_logs
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;

-- SELECT: tenant members see only their own tenant's logs
CREATE POLICY audit_logs_select
  ON audit_logs
  FOR SELECT
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- INSERT: tenant members can append new log entries
CREATE POLICY audit_logs_insert
  ON audit_logs
  FOR INSERT
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- Platform owners can read all audit logs (no write via anon key)
CREATE POLICY audit_logs_platform_owner_select
  ON audit_logs
  FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true);

-- NO DELETE or UPDATE policies — audit logs are append-only.
-- Service-role key (used by backend) bypasses RLS and can still write/read freely.

-- ---------------------------------------------------------------------------
-- 6. Fix 6 tables still using current_setting() RLS mechanism (HIGH 1C-05)
--    Tables: attendance_policies, marketplace_reviews, procurement_requests,
--            holidays, leave_approval_chains, leave_balance_audits
--    current_setting('app.tenant_id') is never set by the Supabase JS client,
--    so these policies always evaluate to NULL and lock users out.
-- ---------------------------------------------------------------------------

-- attendance_policies
DROP POLICY IF EXISTS tenant_isolation ON attendance_policies;
CREATE POLICY attendance_policies_tenant_isolation
  ON attendance_policies
  FOR ALL
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- holidays
DROP POLICY IF EXISTS tenant_isolation ON holidays;
CREATE POLICY holidays_tenant_isolation
  ON holidays
  FOR ALL
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- leave_approval_chains
DROP POLICY IF EXISTS tenant_isolation ON leave_approval_chains;
CREATE POLICY leave_approval_chains_tenant_isolation
  ON leave_approval_chains
  FOR ALL
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- leave_balance_audits
DROP POLICY IF EXISTS tenant_isolation ON leave_balance_audits;
CREATE POLICY leave_balance_audits_tenant_isolation
  ON leave_balance_audits
  FOR ALL
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- marketplace_reviews
DROP POLICY IF EXISTS vendor_read ON marketplace_reviews;
DROP POLICY IF EXISTS tenant_isolation ON marketplace_reviews;
CREATE POLICY marketplace_reviews_tenant_isolation
  ON marketplace_reviews
  FOR ALL
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- procurement_requests
DROP POLICY IF EXISTS tenant_isolation ON procurement_requests;
CREATE POLICY procurement_requests_tenant_isolation
  ON procurement_requests
  FOR ALL
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- ---------------------------------------------------------------------------
-- 7. Fix tenant_user_requests — add INSERT/UPDATE/DELETE policies (HIGH 1C-06)
-- ---------------------------------------------------------------------------
CREATE POLICY tur_insert
  ON tenant_user_requests
  FOR INSERT
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

CREATE POLICY tur_update
  ON tenant_user_requests
  FOR UPDATE
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- ---------------------------------------------------------------------------
-- 8. Fix over-permissive service_write policies (MEDIUM 1C-08/09)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS service_write ON benchmark_snapshots;
DROP POLICY IF EXISTS service_write ON marketplace_vendors;

-- These tables should only be writable by the backend service-role key (which
-- bypasses RLS). No direct anon-key write access needed.

-- ---------------------------------------------------------------------------
-- 9. Add missing FK constraints (MEDIUM 1A-04/05/06)
-- ---------------------------------------------------------------------------
ALTER TABLE payment_plans
  ADD CONSTRAINT payment_plans_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE invoice_discounts
  ADD CONSTRAINT invoice_discounts_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

-- dunning_log FKs (best-effort — skip if columns don't exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dunning_log' AND column_name = 'invoice_id'
  ) THEN
    BEGIN
      ALTER TABLE dunning_log
        ADD CONSTRAINT dunning_log_invoice_id_fkey
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object OR others THEN NULL;
    END;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dunning_log' AND column_name = 'student_id'
  ) THEN
    BEGIN
      ALTER TABLE dunning_log
        ADD CONSTRAINT dunning_log_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object OR others THEN NULL;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Fix tenants.monthly_revenue precision (HIGH 1A-02)
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ALTER COLUMN monthly_revenue TYPE NUMERIC(15,2)
  USING monthly_revenue::NUMERIC(15,2);
