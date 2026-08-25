-- P4-1 (SCRUM-111 / SCRUM-112): Admissions pipeline config + stage audit trail
-- Defaults match Admissions Management Kanban; stages are school-configurable.

-- ── Extra application columns (idempotent) ───────────────────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS guardian_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_reviewer TEXT;

-- ── School-configurable pipeline stages ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS admission_pipeline_stages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stage_key    TEXT NOT NULL,
  label_en     TEXT NOT NULL,
  label_ar     TEXT NOT NULL,
  sort_order   INT  NOT NULL DEFAULT 0,
  sla_days     INT  NOT NULL DEFAULT 3,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  is_terminal  BOOLEAN NOT NULL DEFAULT false,
  color_token  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_admission_pipeline_stages_tenant
  ON admission_pipeline_stages (tenant_id, sort_order);

-- ── Stage change audit (from → to, actor, timestamp) ─────────────────────────
CREATE TABLE IF NOT EXISTS application_stage_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  note            TEXT,
  changed_by      UUID,
  changed_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_stage_history_app
  ON application_stage_history (tenant_id, application_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE admission_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_stage_history ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['admission_pipeline_stages', 'application_stage_history']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_iso ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_tenant_iso ON %I FOR ALL
       USING (tenant_id::text = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ── Seed default stages for every existing tenant ────────────────────────────
INSERT INTO admission_pipeline_stages
  (tenant_id, stage_key, label_en, label_ar, sort_order, sla_days, is_terminal, color_token)
SELECT t.id, d.stage_key, d.label_en, d.label_ar, d.sort_order, d.sla_days, d.is_terminal, d.color_token
FROM tenants t
CROSS JOIN (
  VALUES
    ('inquiry',      'Inquiry',     'استفسار',           10, 2,   false, 'sand'),
    ('submitted',    'Submitted',   'مقدَّم',             20, 3,   false, 'najdi'),
    ('under_review', 'Docs Review', 'مراجعة الوثائق',     30, 3,   false, 'yellow'),
    ('assessment',   'Assessment',  'الاختبار',           40, 5,   false, 'purple'),
    ('interview',    'Interview',   'مقابلة',             50, 5,   false, 'indigo'),
    ('committee',    'Committee',   'اللجنة الأكاديمية',  60, 3,   false, 'orange'),
    ('accepted',     'Accepted',    'مقبول',              70, 7,   false, 'green'),
    ('waitlist',     'Waitlist',    'قائمة انتظار',       80, 14,  false, 'teal'),
    ('enrolled',     'Enrolled',    'ملتحق',              90, 999, true,  'emerald'),
    ('rejected',     'Rejected',    'مرفوض',              100,999, true,  'red')
) AS d(stage_key, label_en, label_ar, sort_order, sla_days, is_terminal, color_token)
ON CONFLICT (tenant_id, stage_key) DO NOTHING;
