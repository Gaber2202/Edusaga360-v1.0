-- SCRUM-129: Projects module foundation (CapEx / OpEx, budgets, costs, milestones, GL linkage)

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  project_code TEXT,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  project_type TEXT NOT NULL DEFAULT 'opex'
    CHECK (project_type IN ('capex', 'opex')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'on_hold', 'completed', 'cancelled')),
  description TEXT,
  -- Main GL linkage (chart of accounts code)
  main_gl_account TEXT,
  expense_gl_account TEXT,
  asset_gl_account TEXT,
  start_date DATE,
  end_date DATE,
  owner_id UUID,
  owner_name TEXT,
  total_budget NUMERIC(15,2) DEFAULT 0,
  total_actual NUMERIC(15,2) DEFAULT 0,
  currency_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects (tenant_id, project_type);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (tenant_id, status);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY projects_tenant ON projects
    USING ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS project_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  line_name TEXT NOT NULL,
  category TEXT,
  gl_account TEXT,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_budgets_project ON project_budgets (tenant_id, project_id);

ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY project_budgets_tenant ON project_budgets
    USING ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS project_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  cost_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  category TEXT,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  gl_account TEXT,
  vendor_name TEXT,
  journal_entry_id UUID,
  journal_number TEXT,
  posting_status TEXT DEFAULT 'pending'
    CHECK (posting_status IN ('pending', 'posted', 'skipped', 'failed')),
  posting_error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_costs_project ON project_costs (tenant_id, project_id, cost_date DESC);

ALTER TABLE project_costs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY project_costs_tenant ON project_costs
    USING ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  completed_date DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones (tenant_id, project_id, sort_order);

ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY project_milestones_tenant ON project_milestones
    USING ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id)
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE projects IS 'SCRUM-129: CapEx/OpEx projects with main GL linkage';
COMMENT ON TABLE project_budgets IS 'SCRUM-129: project budget lines';
COMMENT ON TABLE project_costs IS 'SCRUM-129: project cost entries; SA posts journal via createJournalEntry';
COMMENT ON TABLE project_milestones IS 'SCRUM-129: project milestones';
