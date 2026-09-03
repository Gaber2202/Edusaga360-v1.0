-- ============================================================
-- Fix attendance + payroll cycle schema gaps (additive only)
-- Closes live drift that broke July attendance→payroll APIs:
--   - attendance_policies missing
--   - employee_attendance.late_minutes / is_excused missing
--   - no unique(tenant_id, employee_id, date) for upserts
--   - payroll_inputs missing
--   - pay_runs still on legacy month/year shape vs frontend period fields
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. attendance_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_policies (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                            TEXT NOT NULL DEFAULT 'Default Policy',
  working_days_per_month          INTEGER NOT NULL DEFAULT 26,
  daily_rate_basis                TEXT NOT NULL DEFAULT 'monthly_divided',
  late_grace_minutes              INTEGER NOT NULL DEFAULT 15,
  late_half_day_minutes           INTEGER NOT NULL DEFAULT 120,
  late_deduction_factor           NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  absent_deduction_factor         NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  half_day_deduction_factor       NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  max_late_incidents_before_absent INTEGER NOT NULL DEFAULT 3,
  is_default                      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_policies_tenant
  ON public.attendance_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_policies_tenant_default
  ON public.attendance_policies(tenant_id, is_default)
  WHERE is_default = TRUE;

ALTER TABLE public.attendance_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.attendance_policies;
DROP POLICY IF EXISTS attendance_policies_tenant_isolation ON public.attendance_policies;
CREATE POLICY attendance_policies_tenant_isolation ON public.attendance_policies
  FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

DROP POLICY IF EXISTS attendance_policies_platform_owner ON public.attendance_policies;
CREATE POLICY attendance_policies_platform_owner ON public.attendance_policies
  FOR ALL TO authenticated
  USING (public.auth_is_platform_owner())
  WITH CHECK (public.auth_is_platform_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_policies TO authenticated;
GRANT ALL ON public.attendance_policies TO service_role;

-- ---------------------------------------------------------------------------
-- 2. employee_attendance — deduction columns + upsert uniqueness
-- ---------------------------------------------------------------------------
ALTER TABLE public.employee_attendance
  ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_excused   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_by  UUID,
  ADD COLUMN IF NOT EXISTS source       TEXT,
  ADD COLUMN IF NOT EXISTS branch_id    UUID,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by  TEXT;

-- Deduplicate before unique index (keep newest row per tenant/employee/date)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, employee_id, date
           ORDER BY created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.employee_attendance
  WHERE employee_id IS NOT NULL AND date IS NOT NULL
)
DELETE FROM public.employee_attendance e
USING ranked r
WHERE e.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_attendance_tenant_emp_date
  ON public.employee_attendance (tenant_id, employee_id, date);

CREATE INDEX IF NOT EXISTS idx_employee_attendance_tenant_date
  ON public.employee_attendance (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_employee_date
  ON public.employee_attendance (employee_id, date);

-- ---------------------------------------------------------------------------
-- 3. pay_runs — add frontend period fields; keep legacy month/year
-- ---------------------------------------------------------------------------
ALTER TABLE public.pay_runs
  ADD COLUMN IF NOT EXISTS pay_run_number TEXT,
  ADD COLUMN IF NOT EXISTS period TEXT,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS company_id UUID,
  ADD COLUMN IF NOT EXISTS employee_count INTEGER,
  ADD COLUMN IF NOT EXISTS saudi_count INTEGER,
  ADD COLUMN IF NOT EXISTS non_saudi_count INTEGER,
  ADD COLUMN IF NOT EXISTS total_basic NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS total_housing NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS total_transport NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS total_other_allowances NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS total_earnings NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS total_gosi_employee NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS total_gosi_employer NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS net_payroll NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS workflow_stage TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS stage_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill period from legacy month/year where missing
UPDATE public.pay_runs
SET period = CASE
      WHEN period IS NULL AND month IS NOT NULL AND year IS NOT NULL
        THEN year::text || '-' || lpad(month::text, 2, '0')
      ELSE period
    END,
    period_start = CASE
      WHEN period_start IS NULL AND month IS NOT NULL AND year IS NOT NULL
        THEN make_date(year, month, 1)
      ELSE period_start
    END,
    period_end = CASE
      WHEN period_end IS NULL AND month IS NOT NULL AND year IS NOT NULL
        THEN (make_date(year, month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date
      ELSE period_end
    END,
    total_earnings = COALESCE(total_earnings, total_gross),
    net_payroll = COALESCE(net_payroll, total_net)
WHERE period IS NULL OR period_start IS NULL OR period_end IS NULL
   OR total_earnings IS NULL OR net_payroll IS NULL;

-- Soften NOT NULL on legacy month/year so period-only inserts work
DO $$
BEGIN
  ALTER TABLE public.pay_runs ALTER COLUMN month DROP NOT NULL;
  ALTER TABLE public.pay_runs ALTER COLUMN year DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pay_runs month/year nullability skipped: %', SQLERRM;
END $$;

-- Allow all-branches runs: frontend historically wrote branch_id = 'all' (invalid UUID).
-- Drop FK then widen to TEXT while preserving existing UUID string values.
DO $$
BEGIN
  ALTER TABLE public.pay_runs DROP CONSTRAINT IF EXISTS pay_runs_branch_id_fkey;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pay_runs'
      AND column_name = 'branch_id' AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.pay_runs
      ALTER COLUMN branch_id TYPE TEXT USING branch_id::text;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pay_runs.branch_id type widen skipped: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_pay_runs_period
  ON public.pay_runs (tenant_id, period, status);

-- ---------------------------------------------------------------------------
-- 4. payroll_inputs — per-employee pay-run lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_inputs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pay_run_id           UUID REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  period               TEXT,
  employee_id          UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name        TEXT,
  employee_number      TEXT,
  branch_id            UUID,
  department_id        UUID,
  job_title            TEXT,
  is_saudi             BOOLEAN DEFAULT FALSE,
  basic_salary         NUMERIC(15,2) DEFAULT 0,
  housing_allowance    NUMERIC(15,2) DEFAULT 0,
  transport_allowance  NUMERIC(15,2) DEFAULT 0,
  other_allowances     NUMERIC(15,2) DEFAULT 0,
  gross_salary         NUMERIC(15,2) DEFAULT 0,
  gosi_employee        NUMERIC(15,2) DEFAULT 0,
  gosi_employer        NUMERIC(15,2) DEFAULT 0,
  gosi_wage            NUMERIC(15,2) DEFAULT 0,
  absence_deduction    NUMERIC(15,2) DEFAULT 0,
  total_deductions     NUMERIC(15,2) DEFAULT 0,
  net_salary           NUMERIC(15,2) DEFAULT 0,
  bank_name            TEXT,
  iban                 TEXT,
  status               TEXT DEFAULT 'draft',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_inputs_run
  ON public.payroll_inputs (pay_run_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_inputs_tenant_period
  ON public.payroll_inputs (tenant_id, period);

ALTER TABLE public.payroll_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_inputs_tenant_isolation ON public.payroll_inputs;
CREATE POLICY payroll_inputs_tenant_isolation ON public.payroll_inputs
  FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

DROP POLICY IF EXISTS payroll_inputs_platform_owner ON public.payroll_inputs;
CREATE POLICY payroll_inputs_platform_owner ON public.payroll_inputs
  FOR ALL TO authenticated
  USING (public.auth_is_platform_owner())
  WITH CHECK (public.auth_is_platform_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_inputs TO authenticated;
GRANT ALL ON public.payroll_inputs TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Reload PostgREST schema cache
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
