-- SCRUM-123: Secure payslip share tokens (30-day link expiry)

CREATE TABLE IF NOT EXISTS payslip_share_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payslip_id      UUID NOT NULL,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_month    INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year     INTEGER NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  token           TEXT NOT NULL UNIQUE,
  channel         TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'link')),
  expires_at      TIMESTAMPTZ NOT NULL,
  view_count      INTEGER NOT NULL DEFAULT 0,
  viewed_at       TIMESTAMPTZ,
  sent_to         TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payslip_share_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'payslip_share_tokens', 'payslip_share_tokens'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_payslip_share_tokens_token ON payslip_share_tokens (token);
CREATE INDEX IF NOT EXISTS idx_payslip_share_tokens_payslip ON payslip_share_tokens (tenant_id, payslip_id);
CREATE INDEX IF NOT EXISTS idx_payslip_share_tokens_expires ON payslip_share_tokens (expires_at);
