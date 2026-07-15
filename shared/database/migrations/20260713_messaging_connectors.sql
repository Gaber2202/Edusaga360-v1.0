-- Messaging Integration — connect an SMS / WhatsApp gateway (Infobip, Twilio,
-- Unifonic, MSEGAT, Taqnyat, Meta WhatsApp Cloud API, or a custom gateway) so a
-- school can send notifications over SMS and WhatsApp.
--
-- Same connector model as email/ATS: one row per configured gateway per tenant,
-- provider id + non-secret config (JSONB) + AES-256-GCM encrypted credentials.
-- Send-only for now (inbound/delivery receipts are webhook-driven — a follow-up).

CREATE TABLE IF NOT EXISTS messaging_connectors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,                    -- infobip | twilio | unifonic | msegat | taqnyat | meta_whatsapp | custom
  display_name TEXT NOT NULL,
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials  TEXT,                             -- AES-256-GCM ciphertext of a JSON credentials object
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  status       TEXT NOT NULL DEFAULT 'configured',
  last_error   TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messaging_connectors_tenant ON messaging_connectors (tenant_id);

ALTER TABLE messaging_connectors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'messaging_connectors', 'messaging_connectors');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
