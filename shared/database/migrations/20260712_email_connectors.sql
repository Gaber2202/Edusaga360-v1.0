-- Email Integration — connect a school's own mailbox/provider (SMTP, Gmail,
-- Microsoft 365, or a custom gateway) for sending from their domain and, where
-- supported, pulling inbound mail into EduSaga.
--
-- Mirrors the ATS connector model:
--   * email_connectors — one row per configured mailbox per tenant. Provider id +
--     non-secret config (JSONB) + AES-256-GCM encrypted credentials blob.
--   * email_messages   — inbound messages synced from a connector. Unique on
--     (tenant_id, provider, external_id) so re-syncing is idempotent.
--
-- Note: this is distinct from the platform's default transactional sender
-- (services/email.ts, Infobip) — that stays the fallback; these connectors let a
-- tenant send/receive through their own mail system.

-- ---------------------------------------------------------------------------
-- 1. email_connectors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_connectors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,                    -- smtp | gmail | microsoft | custom
  display_name     TEXT NOT NULL,
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- host/port/from/urls/field_map/...
  credentials      TEXT,                             -- AES-256-GCM ciphertext of a JSON credentials object
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  status           TEXT NOT NULL DEFAULT 'configured', -- configured | ok | error
  last_sync_at     TIMESTAMPTZ,
  last_sync_status TEXT,
  last_error       TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_connectors_tenant ON email_connectors (tenant_id);

ALTER TABLE email_connectors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'email_connectors', 'email_connectors');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. email_messages — inbound mail synced from a connector
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id UUID REFERENCES email_connectors(id) ON DELETE SET NULL,
  provider     TEXT NOT NULL,
  external_id  TEXT NOT NULL,                        -- message id in the source mailbox
  from_address TEXT,
  to_address   TEXT,
  subject      TEXT,
  snippet      TEXT,
  received_at  TIMESTAMPTZ,
  raw          JSONB DEFAULT '{}'::jsonb,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_email_messages_tenant ON email_messages (tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_connector ON email_messages (connector_id);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'email_messages', 'email_messages');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
