-- ============================================================
-- Leave Management: Approval Chains, Holidays, Audit
-- ============================================================

-- Public holidays / school closures (fixes missing table referenced in frontend)
CREATE TABLE IF NOT EXISTS holidays (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id),        -- NULL = applies to all branches
  name_en     TEXT NOT NULL,
  name_ar     TEXT,
  date        DATE NOT NULL,
  end_date    DATE,                                  -- for multi-day holidays
  type        TEXT NOT NULL DEFAULT 'national',      -- national | school | optional
  is_recurring BOOLEAN DEFAULT FALSE,               -- repeat same Gregorian date each year
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON holidays USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
CREATE INDEX IF NOT EXISTS idx_holidays_tenant_date ON holidays(tenant_id, date);

-- Configurable multi-level approval chains per leave type
-- e.g. annual leave: level 1 = direct_manager, level 2 = hr_manager
--      sick leave: level 1 = hr_manager  (single step)
--      maternity: level 1 = hr_manager, level 2 = ceo  (2 steps)
CREATE TABLE IF NOT EXISTS leave_approval_chains (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  leave_type_id   UUID REFERENCES leave_types(id) ON DELETE CASCADE,
  level           INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  approver_role   TEXT NOT NULL,   -- direct_manager | hr_manager | ceo | branch_manager | custom
  approver_user_id UUID,           -- specific user override (optional)
  min_days        INTEGER,         -- only apply this level when days >= min_days
  max_days        INTEGER,         -- only apply this level when days <= max_days
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, leave_type_id, level)
);

ALTER TABLE leave_approval_chains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON leave_approval_chains USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
CREATE INDEX IF NOT EXISTS idx_leave_chains_tenant_type ON leave_approval_chains(tenant_id, leave_type_id);

-- Add approval chain tracking columns to leave_requests
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS current_level       INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_levels        INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rejection_reason    TEXT,
  ADD COLUMN IF NOT EXISTS manager_approved_by UUID,
  ADD COLUMN IF NOT EXISTS manager_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_approved_by      UUID,
  ADD COLUMN IF NOT EXISTS hr_approved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

-- Leave balance audit trail
CREATE TABLE IF NOT EXISTS leave_balance_audits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  leave_balance_id UUID REFERENCES leave_balances(id),
  employee_id     UUID REFERENCES employees(id),
  leave_type_id   UUID REFERENCES leave_types(id),
  action          TEXT NOT NULL,  -- approved | rejected | cancelled | manual_adjustment | allocated
  delta_days      INTEGER NOT NULL,  -- positive = days added, negative = days used
  used_days_after INTEGER,
  leave_request_id UUID REFERENCES leave_requests(id),
  performed_by    UUID,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leave_balance_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON leave_balance_audits USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
CREATE INDEX IF NOT EXISTS idx_leave_audits_tenant ON leave_balance_audits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_audits_employee ON leave_balance_audits(employee_id);
