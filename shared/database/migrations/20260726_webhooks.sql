-- Webhook subscriptions and delivery log for the external integration API.

CREATE TABLE IF NOT EXISTS tenant_webhooks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  url             TEXT NOT NULL,
  events          TEXT[] NOT NULL DEFAULT '{}',
  secret          TEXT,                 -- for HMAC-SHA256 signature
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tenant_webhooks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'tenant_webhooks', 'tenant_webhooks'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenant_webhooks_tenant ON tenant_webhooks (tenant_id, active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  webhook_id      UUID NOT NULL REFERENCES tenant_webhooks(id),
  event           TEXT NOT NULL,
  source_id       TEXT,                 -- invoice_id / payment_id / credit_note_id
  payload         JSONB NOT NULL,
  response_status INTEGER,
  response_body   TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending', -- pending | delivered | failed
  retry_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  next_retry_at   TIMESTAMPTZ
);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'webhook_deliveries', 'webhook_deliveries'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries (tenant_id, event, source_id);
