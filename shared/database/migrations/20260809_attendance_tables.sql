-- ============================================================
-- Student Attendance Tables
-- Core first-term feature: daily student attendance and
-- ministry-reporting-ready excuse workflow.
-- ============================================================

-- Canonical tenant-isolation helpers. Defined here so the new tables below
-- use them from the start; #239 remediates the rest of the schema and re-creates
-- the same helpers with CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT nullif(((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.auth_is_platform_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(nullif(((auth.jwt() -> 'app_metadata'::text) ->> 'is_platform_owner'::text), '')::boolean, false)
$$;

REVOKE EXECUTE ON FUNCTION public.auth_tenant_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_is_platform_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_platform_owner() TO authenticated, service_role;

-- Reusable updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Generic daily attendance (used by the legacy Attendance page)
CREATE TABLE IF NOT EXISTS public.attendances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  student_id    UUID REFERENCES public.students(id) ON DELETE CASCADE,
  student_name  TEXT,
  date          DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'present',
  grade         TEXT,
  section       TEXT,
  notes         TEXT,
  marked_by     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, student_id, date)
);

-- Ministry-reporting student attendance with excuse workflow
CREATE TABLE IF NOT EXISTS public.student_attendances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id             UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  student_id            UUID REFERENCES public.students(id) ON DELETE CASCADE,
  student_name          TEXT,
  date                  DATE NOT NULL,
  grade                 TEXT,
  section               TEXT,
  status                TEXT NOT NULL DEFAULT 'present',
  check_in_time         TEXT,
  recorded_by           TEXT,
  parent_notified       BOOLEAN DEFAULT FALSE,
  is_bus_excused        BOOLEAN DEFAULT FALSE,
  excuse_submitted      BOOLEAN DEFAULT FALSE,
  excuse_reviewed       BOOLEAN DEFAULT FALSE,
  excuse_approved       BOOLEAN DEFAULT FALSE,
  excuse_approved_date  DATE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, student_id, date)
);

-- Indexes for the queries the frontend actually runs
CREATE INDEX IF NOT EXISTS idx_attendances_tenant_date ON public.attendances(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_attendances_student_date ON public.attendances(student_id, date);
CREATE INDEX IF NOT EXISTS idx_student_attendances_tenant_date ON public.student_attendances(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_student_attendances_student_date ON public.student_attendances(student_id, date);
CREATE INDEX IF NOT EXISTS idx_student_attendances_excuse_pending ON public.student_attendances(tenant_id, status, excuse_submitted, excuse_reviewed)
  WHERE status = 'absent' AND excuse_submitted = TRUE AND excuse_reviewed = FALSE;

-- Add branch_id to the legacy employee_attendance table so the EmployeeAttendance page
-- can scope by branch the same way the new student attendance tables do.
ALTER TABLE public.employee_attendance
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by TEXT;
CREATE INDEX IF NOT EXISTS idx_employee_attendance_branch_date ON public.employee_attendance(tenant_id, branch_id, date);

-- Extend payments to capture the fields the payment-log form and collections page use.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by TEXT,
  ADD COLUMN IF NOT EXISTS collected_by TEXT,
  ADD COLUMN IF NOT EXISTS payment_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_id UUID,
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS tamara_order_id TEXT,
  ADD COLUMN IF NOT EXISTS tamara_status TEXT;

-- RLS using the canonical helpers (InitPlan-evaluated once per statement)
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_attendances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.attendances;
DROP POLICY IF EXISTS "platform_owner_access" ON public.attendances;
CREATE POLICY "tenant_isolation" ON public.attendances
  FOR ALL TO authenticated
  USING (tenant_id = (select public.auth_tenant_id()))
  WITH CHECK (tenant_id = (select public.auth_tenant_id()));
CREATE POLICY "platform_owner_access" ON public.attendances
  FOR ALL TO authenticated
  USING ((select public.auth_is_platform_owner()))
  WITH CHECK ((select public.auth_is_platform_owner()));

DROP POLICY IF EXISTS "tenant_isolation" ON public.student_attendances;
DROP POLICY IF EXISTS "platform_owner_access" ON public.student_attendances;
CREATE POLICY "tenant_isolation" ON public.student_attendances
  FOR ALL TO authenticated
  USING (tenant_id = (select public.auth_tenant_id()))
  WITH CHECK (tenant_id = (select public.auth_tenant_id()));
CREATE POLICY "platform_owner_access" ON public.student_attendances
  FOR ALL TO authenticated
  USING ((select public.auth_is_platform_owner()))
  WITH CHECK ((select public.auth_is_platform_owner()));

-- updated_at triggers (idempotent)
DROP TRIGGER IF EXISTS attendances_updated_at ON public.attendances;
CREATE TRIGGER attendances_updated_at
  BEFORE UPDATE ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS student_attendances_updated_at ON public.student_attendances;
CREATE TRIGGER student_attendances_updated_at
  BEFORE UPDATE ON public.student_attendances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Fix the legacy employee_attendance tenant isolation policy to use the canonical helpers.
DROP POLICY IF EXISTS "tenant_isolation" ON public.employee_attendance;
DROP POLICY IF EXISTS "platform_owner_access" ON public.employee_attendance;
CREATE POLICY "tenant_isolation" ON public.employee_attendance
  FOR ALL TO authenticated
  USING (tenant_id = (select public.auth_tenant_id()))
  WITH CHECK (tenant_id = (select public.auth_tenant_id()));
CREATE POLICY "platform_owner_access" ON public.employee_attendance
  FOR ALL TO authenticated
  USING ((select public.auth_is_platform_owner()))
  WITH CHECK ((select public.auth_is_platform_owner()));

-- Seed enabled_modules for first-term on existing tenants that have not been configured yet.
-- This ensures the new feature-flag menu does not hide core modules from live customers.
UPDATE public.tenants
SET enabled_modules = ARRAY['core','enrolment','fees','collections','basic_hr','accounting','attendance']
WHERE enabled_modules IS NULL OR enabled_modules = '{}';

-- New tenants get the first-term module set by default.
ALTER TABLE public.tenants
  ALTER COLUMN enabled_modules
  SET DEFAULT ARRAY['core','enrolment','fees','collections','basic_hr','accounting','attendance'];
