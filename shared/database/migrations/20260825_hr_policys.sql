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
  DROP POLICY IF EXISTS tenant_isolation_hr_policys ON public.hr_policys;
  DROP POLICY IF EXISTS tenant_isolation ON public.hr_policys;
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %I FOR ALL TO authenticated USING (tenant_id::text = (SELECT public.auth_tenant_id())) WITH CHECK (tenant_id::text = (SELECT public.auth_tenant_id()))',
    'hr_policys'
  );
EXCEPTION WHEN undefined_function THEN
  -- auth_tenant_id may not exist yet on very old baselines; fall back to app_metadata path
  EXECUTE $p$
    CREATE POLICY tenant_isolation ON public.hr_policys FOR ALL TO authenticated
      USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  $p$;
WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_hr_policys_tenant ON hr_policys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_policys_category ON hr_policys (tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_hr_policys_jurisdiction ON hr_policys (tenant_id, jurisdiction_code);
