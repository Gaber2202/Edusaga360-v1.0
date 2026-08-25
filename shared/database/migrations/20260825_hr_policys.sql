-- SCRUM-125: HR policies library table (was schema-drift / queries disabled)

CREATE TABLE IF NOT EXISTS hr_policys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id        UUID REFERENCES branches(id) ON DELETE SET NULL,
  policy_code      TEXT,
  category         TEXT,
  title_ar         TEXT,
  title_en         TEXT,
  body_ar          TEXT,
  body_en          TEXT,
  tags             TEXT[] DEFAULT '{}',
  jurisdiction_code TEXT,
  is_template      BOOLEAN DEFAULT TRUE,
  status           TEXT DEFAULT 'draft',
  current_version  TEXT DEFAULT 'v1.0',
  owner_id         TEXT,
  owner_name       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE hr_policys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'hr_policys', 'hr_policys'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_hr_policys_tenant ON hr_policys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_policys_category ON hr_policys (tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_hr_policys_jurisdiction ON hr_policys (tenant_id, jurisdiction_code);
