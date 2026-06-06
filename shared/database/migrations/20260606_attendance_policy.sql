-- ============================================================
-- Attendance Policy Engine
-- ============================================================

-- Per-tenant configurable attendance policy
CREATE TABLE IF NOT EXISTS attendance_policies (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL DEFAULT 'Default Policy',
  -- Working days config
  working_days_per_month  INTEGER NOT NULL DEFAULT 26,  -- KSA standard
  daily_rate_basis        TEXT    NOT NULL DEFAULT 'monthly_divided',  -- monthly_divided | fixed
  -- Late thresholds
  late_grace_minutes      INTEGER NOT NULL DEFAULT 15,   -- no deduction under this
  late_half_day_minutes   INTEGER NOT NULL DEFAULT 120,  -- late >= this = half-day deduction
  -- Deduction multipliers (fraction of daily rate)
  late_deduction_factor   NUMERIC(4,3) NOT NULL DEFAULT 0.5,  -- fraction per late incident above grace
  absent_deduction_factor NUMERIC(4,3) NOT NULL DEFAULT 1.0,  -- fraction per absent day
  half_day_deduction_factor NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  -- Monthly caps
  max_late_incidents_before_absent INTEGER NOT NULL DEFAULT 3,  -- 3 lates = 1 absent day
  -- Is this the active policy for this tenant?
  is_default            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to employee_attendance if they don't exist
ALTER TABLE employee_attendance
  ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_excused   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_by  UUID;

-- RLS
ALTER TABLE attendance_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON attendance_policies
  USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_attendance_policies_tenant ON attendance_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_tenant_date ON employee_attendance(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_employee_date ON employee_attendance(employee_id, date);
