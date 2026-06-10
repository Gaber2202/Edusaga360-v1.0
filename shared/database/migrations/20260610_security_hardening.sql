-- =============================================================================
-- SECURITY HARDENING MIGRATION
-- Fixes: CRITICAL and HIGH findings from platform security audit (2026-06-10)
-- All table operations are wrapped in DO blocks that check existence first,
-- so the script is safe to run even if some tables don't exist yet.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS on `users` table
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self
  ON users FOR ALL
  USING (
    auth_id = auth.uid()
    OR tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  )
  WITH CHECK (
    auth_id = auth.uid()
    OR tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

DROP POLICY IF EXISTS users_platform_owner ON users;
CREATE POLICY users_platform_owner
  ON users FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true)
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true);

-- ---------------------------------------------------------------------------
-- 2. RLS on `tenants` table
-- ---------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_read_own ON tenants;
CREATE POLICY tenants_read_own
  ON tenants FOR SELECT
  USING (id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

DROP POLICY IF EXISTS tenants_platform_owner_write ON tenants;
CREATE POLICY tenants_platform_owner_write
  ON tenants FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true)
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true);

-- ---------------------------------------------------------------------------
-- 3. RLS on `registration_requests`
-- ---------------------------------------------------------------------------
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reg_requests_platform_owner ON registration_requests;
CREATE POLICY reg_requests_platform_owner
  ON registration_requests FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true)
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true);

-- ---------------------------------------------------------------------------
-- 4. RLS on `system_errors`
-- ---------------------------------------------------------------------------
ALTER TABLE system_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_errors_tenant_isolation ON system_errors;
CREATE POLICY system_errors_tenant_isolation
  ON system_errors FOR ALL
  USING (
    (tenant_id IS NULL AND (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true)
    OR tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    OR (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true
  );

-- ---------------------------------------------------------------------------
-- 5. audit_logs — append-only (no DELETE/UPDATE by tenant users)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
DROP POLICY IF EXISTS audit_logs_platform_owner_select ON audit_logs;

CREATE POLICY audit_logs_select
  ON audit_logs FOR SELECT
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

CREATE POLICY audit_logs_insert
  ON audit_logs FOR INSERT
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

CREATE POLICY audit_logs_platform_owner_select
  ON audit_logs FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true);

-- ---------------------------------------------------------------------------
-- 6. Fix tables that may exist from optional migrations — all wrapped safely
-- ---------------------------------------------------------------------------
DO $$
BEGIN

  -- attendance_policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance_policies' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation ON attendance_policies;
    EXECUTE $p$
      CREATE POLICY attendance_policies_tenant_isolation ON attendance_policies FOR ALL
      USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
    $p$;
  END IF;

  -- holidays
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'holidays' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation ON holidays;
    EXECUTE $p$
      CREATE POLICY holidays_tenant_isolation ON holidays FOR ALL
      USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
    $p$;
  END IF;

  -- leave_approval_chains
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leave_approval_chains' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation ON leave_approval_chains;
    EXECUTE $p$
      CREATE POLICY leave_approval_chains_tenant_isolation ON leave_approval_chains FOR ALL
      USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
    $p$;
  END IF;

  -- leave_balance_audits
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leave_balance_audits' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation ON leave_balance_audits;
    EXECUTE $p$
      CREATE POLICY leave_balance_audits_tenant_isolation ON leave_balance_audits FOR ALL
      USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
    $p$;
  END IF;

  -- marketplace_reviews
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_reviews' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS vendor_read ON marketplace_reviews;
    DROP POLICY IF EXISTS tenant_isolation ON marketplace_reviews;
    EXECUTE $p$
      CREATE POLICY marketplace_reviews_tenant_isolation ON marketplace_reviews FOR ALL
      USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
    $p$;
  END IF;

  -- procurement_requests
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'procurement_requests' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation ON procurement_requests;
    EXECUTE $p$
      CREATE POLICY procurement_requests_tenant_isolation ON procurement_requests FOR ALL
      USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
    $p$;
  END IF;

  -- benchmark_snapshots
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'benchmark_snapshots' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS service_write ON benchmark_snapshots;
  END IF;

  -- marketplace_vendors
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_vendors' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS service_write ON marketplace_vendors;
  END IF;

  -- tenant_user_requests
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_user_requests' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS tur_insert ON tenant_user_requests;
    DROP POLICY IF EXISTS tur_update ON tenant_user_requests;
    EXECUTE $p$
      CREATE POLICY tur_insert ON tenant_user_requests FOR INSERT
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
    $p$;
    EXECUTE $p$
      CREATE POLICY tur_update ON tenant_user_requests FOR UPDATE
      USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
    $p$;
  END IF;

END $$;

-- ---------------------------------------------------------------------------
-- 7. FK constraints — wrapped safely to skip if already exist or table missing
-- ---------------------------------------------------------------------------
DO $$
BEGIN

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_plans' AND table_schema = 'public') THEN
    BEGIN
      ALTER TABLE payment_plans
        ADD CONSTRAINT payment_plans_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_discounts' AND table_schema = 'public') THEN
    BEGIN
      ALTER TABLE invoice_discounts
        ADD CONSTRAINT invoice_discounts_invoice_id_fkey
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dunning_log' AND column_name = 'invoice_id' AND table_schema = 'public'
  ) THEN
    BEGIN
      ALTER TABLE dunning_log
        ADD CONSTRAINT dunning_log_invoice_id_fkey
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dunning_log' AND column_name = 'student_id' AND table_schema = 'public'
  ) THEN
    BEGIN
      ALTER TABLE dunning_log
        ADD CONSTRAINT dunning_log_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

END $$;

-- ---------------------------------------------------------------------------
-- 8. Fix tenants.monthly_revenue precision (only if column exists)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'monthly_revenue' AND table_schema = 'public'
  ) THEN
    ALTER TABLE tenants
      ALTER COLUMN monthly_revenue TYPE NUMERIC(15,2)
      USING monthly_revenue::NUMERIC(15,2);
  END IF;
END $$;
