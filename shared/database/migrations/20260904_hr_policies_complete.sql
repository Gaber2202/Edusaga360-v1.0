-- HR policies: columns expected by PolicyEditor + version history + onboardings host.
-- Additive & idempotent (SCRUM-125 follow-up).

-- ── hr_policys column alignment ─────────────────────────────────────────────
ALTER TABLE public.hr_policys
  ADD COLUMN IF NOT EXISTS description_ar TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS scope_applies_to TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS compliance_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hr_policys_status
  ON public.hr_policys (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_policys_mandatory
  ON public.hr_policys (tenant_id, is_mandatory)
  WHERE is_mandatory = TRUE;

-- ── policy_versions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.policy_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id        UUID NOT NULL REFERENCES public.hr_policys(id) ON DELETE CASCADE,
  version_number   TEXT NOT NULL,
  title_ar         TEXT,
  title_en         TEXT,
  body_ar          TEXT,
  body_en          TEXT,
  status           TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation_policy_versions ON public.policy_versions;
  DROP POLICY IF EXISTS tenant_isolation ON public.policy_versions;
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %I FOR ALL TO authenticated USING (tenant_id::text = (SELECT public.auth_tenant_id())) WITH CHECK (tenant_id::text = (SELECT public.auth_tenant_id()))',
    'policy_versions'
  );
EXCEPTION WHEN undefined_function THEN
  EXECUTE $p$
    CREATE POLICY tenant_isolation ON public.policy_versions FOR ALL TO authenticated
      USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  $p$;
WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_policy_versions_policy
  ON public.policy_versions (tenant_id, policy_id, created_at DESC);

-- ── onboardings (policy acknowledgement host) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboardings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id                 UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  employee_id               UUID,
  employee_name             TEXT,
  employee_email            TEXT,
  job_title                 TEXT,
  department_id             TEXT,
  start_date                DATE,
  status                    TEXT DEFAULT 'in_progress',
  overall_completion_pct    INTEGER DEFAULT 0,
  hr_documents              JSONB DEFAULT '[]'::jsonb,
  policy_acknowledgements   JSONB DEFAULT '[]'::jsonb,
  training_assignments      JSONB DEFAULT '[]'::jsonb,
  applicant_id              UUID,
  recruitment_id            UUID,
  created_from              TEXT,
  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.onboardings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation_onboardings ON public.onboardings;
  DROP POLICY IF EXISTS tenant_isolation ON public.onboardings;
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %I FOR ALL TO authenticated USING (tenant_id::text = (SELECT public.auth_tenant_id())) WITH CHECK (tenant_id::text = (SELECT public.auth_tenant_id()))',
    'onboardings'
  );
EXCEPTION WHEN undefined_function THEN
  EXECUTE $p$
    CREATE POLICY tenant_isolation ON public.onboardings FOR ALL TO authenticated
      USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
      WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  $p$;
WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_onboardings_tenant ON public.onboardings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboardings_employee ON public.onboardings (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_onboardings_status ON public.onboardings (tenant_id, status);
