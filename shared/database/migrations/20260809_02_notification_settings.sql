-- Per-tenant notification threshold / preference settings.

CREATE TABLE IF NOT EXISTS notification_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  setting_key   TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  description   TEXT,
  updated_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE notification_settings
  ADD CONSTRAINT IF NOT EXISTS notification_settings_tenant_key_unique
  UNIQUE (tenant_id, setting_key);

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'notification_settings', 'notification_settings'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_settings_tenant_key ON notification_settings (tenant_id, setting_key);
CREATE INDEX IF NOT EXISTS idx_notification_settings_tenant ON notification_settings (tenant_id);
