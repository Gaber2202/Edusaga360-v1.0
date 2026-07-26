-- Invoice sharing tokens and view tracking.

CREATE TABLE IF NOT EXISTS invoice_share_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  invoice_id      UUID NOT NULL REFERENCES invoices(id),
  token           TEXT NOT NULL UNIQUE,
  channel         TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'link', 'print')),
  expires_at      TIMESTAMPTZ,
  view_count      INTEGER NOT NULL DEFAULT 0,
  viewed_at       TIMESTAMPTZ,
  sent_to         TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoice_share_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'invoice_share_tokens', 'invoice_share_tokens'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_share_tokens_token ON invoice_share_tokens (token);
CREATE INDEX IF NOT EXISTS idx_invoice_share_tokens_invoice ON invoice_share_tokens (tenant_id, invoice_id);
