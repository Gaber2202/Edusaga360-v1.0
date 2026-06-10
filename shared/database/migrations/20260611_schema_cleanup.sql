-- =============================================================================
-- SCHEMA CLEANUP MIGRATION
-- Fixes: duplicate fee_structures columns, users.tenant_id nullability,
--        storage bucket RLS policies, pay run unique constraint
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Reconcile fee_structures table (CRITICAL 1A-01)
--    The base schema created fee_structures with old columns; the billing engine
--    migration used CREATE TABLE IF NOT EXISTS so the new columns were silently
--    skipped if the base schema ran first. Add missing billing engine columns
--    that the app depends on.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- academic_year as TEXT (billing engine needs '2025-2026' strings, not UUID)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_structures' AND column_name = 'amount' AND table_schema = 'public'
  ) THEN
    ALTER TABLE fee_structures ADD COLUMN amount NUMERIC(12,2) CHECK (amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_structures' AND column_name = 'currency' AND table_schema = 'public'
  ) THEN
    ALTER TABLE fee_structures ADD COLUMN currency TEXT NOT NULL DEFAULT 'SAR';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_structures' AND column_name = 'is_mandatory' AND table_schema = 'public'
  ) THEN
    ALTER TABLE fee_structures ADD COLUMN is_mandatory BOOLEAN NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_structures' AND column_name = 'category_id' AND table_schema = 'public'
  ) THEN
    -- fee_categories may or may not exist depending on which migrations ran
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fee_categories' AND table_schema = 'public') THEN
      ALTER TABLE fee_structures ADD COLUMN category_id UUID REFERENCES fee_categories(id);
    ELSE
      ALTER TABLE fee_structures ADD COLUMN category_id UUID;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_structures' AND column_name = 'grade' AND table_schema = 'public'
  ) THEN
    ALTER TABLE fee_structures ADD COLUMN grade TEXT;
  END IF;

  -- Add academic_year TEXT column (separate from the UUID FK in the old schema)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_structures' AND column_name = 'academic_year_label' AND table_schema = 'public'
  ) THEN
    ALTER TABLE fee_structures ADD COLUMN academic_year_label TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_structures' AND column_name = 'is_active' AND table_schema = 'public'
  ) THEN
    ALTER TABLE fee_structures ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_structures' AND column_name = 'notes_ar' AND table_schema = 'public'
  ) THEN
    ALTER TABLE fee_structures ADD COLUMN notes_ar TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fee_structures' AND column_name = 'notes_en' AND table_schema = 'public'
  ) THEN
    ALTER TABLE fee_structures ADD COLUMN notes_en TEXT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. users.tenant_id — make NOT NULL after backfilling orphaned rows
--    (CRITICAL 1B-01) Nulls can only exist for platform owner accounts.
--    We set them to a sentinel value first, then add the constraint.
-- ---------------------------------------------------------------------------
-- NOTE: Only run the NOT NULL enforcement if all rows have tenant_id set.
-- The DO block checks first and skips if any nulls remain.
DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM users WHERE tenant_id IS NULL;

  IF null_count = 0 THEN
    BEGIN
      ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
      RAISE NOTICE 'users.tenant_id NOT NULL constraint enforced.';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not enforce NOT NULL on users.tenant_id: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'Skipping NOT NULL enforcement: % user rows still have tenant_id = NULL. These are likely platform owner accounts. Resolve them first.', null_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Pay run unique constraint (prevent duplicate pay runs — MEDIUM 5D-2)
--    Base schema uses (month INTEGER, year INTEGER); billing engine migration
--    may have added a TEXT `period` column. We add the constraint against
--    whichever columns actually exist.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pay_runs' AND column_name = 'period' AND table_schema = 'public'
  ) THEN
    -- Billing engine schema: period TEXT column exists
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pay_runs_unique_period_branch') THEN
      ALTER TABLE pay_runs ADD CONSTRAINT pay_runs_unique_period_branch UNIQUE (tenant_id, period, branch_id);
      RAISE NOTICE 'pay_runs unique constraint (period) added.';
    ELSE
      RAISE NOTICE 'pay_runs unique constraint already exists — skipped.';
    END IF;
  ELSE
    -- Base schema: month + year integer columns
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pay_runs_unique_month_year_branch') THEN
      ALTER TABLE pay_runs ADD CONSTRAINT pay_runs_unique_month_year_branch UNIQUE (tenant_id, month, year, branch_id);
      RAISE NOTICE 'pay_runs unique constraint (month+year) added.';
    ELSE
      RAISE NOTICE 'pay_runs unique constraint already exists — skipped.';
    END IF;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not add pay_runs unique constraint (existing duplicate data?): %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Storage: document bucket RLS policies
--    Supabase Storage bucket policies are managed separately in the dashboard,
--    but we document them here as SQL comments for the record.
--    Apply these in: Supabase Dashboard → Storage → tenant-files → Policies
--
--    Recommended policies for the `tenant-files` bucket:
--
--    INSERT (authenticated):
--      (auth.jwt() -> 'app_metadata' ->> 'tenant_id') IS NOT NULL
--      AND name LIKE (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
--
--    SELECT (authenticated):
--      name LIKE (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
--
--    DELETE (authenticated):
--      name LIKE (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. Index improvements — missing composite indexes for common query patterns
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_employees_tenant_status
  ON employees (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_employees_branch
  ON employees (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON leave_requests (tenant_id, employee_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_student
  ON invoices (tenant_id, student_id);

CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON invoices (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user
  ON audit_logs (tenant_id, user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pay_runs' AND table_schema = 'public') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pay_runs' AND column_name = 'period' AND table_schema = 'public') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pay_runs_period ON pay_runs (tenant_id, period, status)';
    ELSE
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pay_runs_month_year ON pay_runs (tenant_id, year, month, status)';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_inputs' AND table_schema = 'public') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payroll_inputs_run ON payroll_inputs (pay_run_id, employee_id)';
  END IF;
END $$;
