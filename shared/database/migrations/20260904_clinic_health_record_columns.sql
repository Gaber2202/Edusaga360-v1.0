-- Clinic health-record columns expected by SchoolClinic UI (critical alerts, insurance, blood type).
-- Additive & idempotent.

ALTER TABLE public.student_health_records
  ADD COLUMN IF NOT EXISTS student_name TEXT,
  ADD COLUMN IF NOT EXISTS blood_type TEXT,
  ADD COLUMN IF NOT EXISTS has_critical_condition BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS critical_condition_note TEXT,
  ADD COLUMN IF NOT EXISTS insurance_company TEXT,
  ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS student_health_records_tenant_student_uidx
  ON public.student_health_records (tenant_id, student_id)
  WHERE student_id IS NOT NULL;
