-- P4-1 (SCRUM-113 / SCRUM-114): Parent intake links + field visibility + send logs

CREATE TABLE IF NOT EXISTS parent_intake_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name_ar             TEXT NOT NULL,
  name_en             TEXT,
  link_code           TEXT NOT NULL,
  link_url            TEXT,
  academic_year       TEXT NOT NULL,
  branch_id           UUID REFERENCES branches(id) ON DELETE SET NULL,
  allowed_grades      JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_documents  JSONB,
  -- Show/hide registration-template fields only (keys from intake form catalog)
  visible_fields      JSONB,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  expires_date        DATE,
  submission_count    INT NOT NULL DEFAULT 0,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, link_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_intake_links_code_global
  ON parent_intake_links (link_code);

CREATE INDEX IF NOT EXISTS idx_parent_intake_links_tenant
  ON parent_intake_links (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS intake_comm_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_link_id  UUID REFERENCES parent_intake_links(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  recipient_name  TEXT,
  recipient_phone TEXT,
  recipient_email TEXT,
  message_preview TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_comm_logs_tenant
  ON intake_comm_logs (tenant_id, created_at DESC);

-- Optional: link applications back to intake link
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS intake_link_id UUID,
  ADD COLUMN IF NOT EXISTS guardian_whatsapp TEXT;

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_intake_link_id_fkey;
ALTER TABLE applications
  ADD CONSTRAINT applications_intake_link_id_fkey
  FOREIGN KEY (intake_link_id) REFERENCES parent_intake_links(id) ON DELETE SET NULL;

ALTER TABLE parent_intake_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_comm_logs ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['parent_intake_links', 'intake_comm_logs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_iso ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_tenant_iso ON %I FOR ALL
       USING (tenant_id::text = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',
      tbl, tbl
    );
  END LOOP;
END $$;
