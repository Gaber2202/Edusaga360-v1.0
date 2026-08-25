-- SCRUM-142: ESS settings + requests (from SCRUM-141 RCA)

CREATE TABLE IF NOT EXISTS ess_settings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  test_mode_enabled    BOOLEAN DEFAULT FALSE,
  test_employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  test_employee_name   TEXT,
  enabled_features     JSONB DEFAULT '{}'::jsonb,
  updated_by           TEXT,
  updated_date         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS ess_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  request_type  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  payload       JSONB DEFAULT '{}'::jsonb,
  notes         TEXT,
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ess_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'ess_settings', 'ess_settings'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'ess_requests', 'ess_requests'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_ess_requests_tenant_emp ON ess_requests (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_ess_requests_status ON ess_requests (tenant_id, status);
