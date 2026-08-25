-- SCRUM-132: School-operational help desk foundations on service_tickets
-- Reuses existing service_tickets; adds requester/department/asset/SLA/routing fields.

ALTER TABLE service_tickets
  ADD COLUMN IF NOT EXISTS ticket_type TEXT,
  ADD COLUMN IF NOT EXISTS ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS requester_type TEXT,
  ADD COLUMN IF NOT EXISTS requester_email TEXT,
  ADD COLUMN IF NOT EXISTS requester_name TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES fixed_assets(id),
  ADD COLUMN IF NOT EXISTS sla_target_hours INTEGER,
  ADD COLUMN IF NOT EXISTS sla_due_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS routed_to UUID,
  ADD COLUMN IF NOT EXISTS routed_to_name TEXT;

-- Priority already exists; constrain school-ops usage to P1/P2/P3 when set that way.
-- SLA industry defaults (overridable per ticket): P1=4h, P2=24h, P3=72h

DO $$ BEGIN
  ALTER TABLE service_tickets
    ADD CONSTRAINT service_tickets_requester_type_check
    CHECK (requester_type IS NULL OR requester_type IN ('staff', 'parent', 'student', 'management'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_tickets_ticket_type
  ON service_tickets (tenant_id, ticket_type);

CREATE INDEX IF NOT EXISTS idx_service_tickets_department
  ON service_tickets (tenant_id, department);

CREATE INDEX IF NOT EXISTS idx_service_tickets_asset
  ON service_tickets (tenant_id, asset_id)
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_tickets_routed
  ON service_tickets (tenant_id, routed_to)
  WHERE routed_to IS NOT NULL;

COMMENT ON COLUMN service_tickets.requester_type IS 'SCRUM-132: staff | parent | student | management';
COMMENT ON COLUMN service_tickets.department IS 'SCRUM-132: school department category (IT, Facilities, Finance, etc.)';
COMMENT ON COLUMN service_tickets.asset_id IS 'SCRUM-132: optional link to fixed_assets';
COMMENT ON COLUMN service_tickets.sla_target_hours IS 'SCRUM-132: SLA hours (defaults P1=4 P2=24 P3=72; school-overridable)';
COMMENT ON COLUMN service_tickets.routed_to IS 'SCRUM-132: routing assignee (employee/user id)';
