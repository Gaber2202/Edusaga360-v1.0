-- Per-tenant notification threshold / preference settings.

CREATE TABLE IF NOT EXISTS notification_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  setting_key   TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  description   TEXT,
  updated_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT notification_settings_tenant_key_unique UNIQUE (tenant_id, setting_key)
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.notification_settings;
CREATE POLICY "tenant_isolation" ON public.notification_settings
  FOR ALL TO authenticated
  USING (tenant_id = (select public.auth_tenant_id()))
  WITH CHECK (tenant_id = (select public.auth_tenant_id()));

DROP POLICY IF EXISTS "platform_owner_access" ON public.notification_settings;
CREATE POLICY "platform_owner_access" ON public.notification_settings
  FOR ALL TO authenticated
  USING ((select public.auth_is_platform_owner()))
  WITH CHECK ((select public.auth_is_platform_owner()));

CREATE INDEX IF NOT EXISTS idx_notification_settings_tenant_key ON notification_settings (tenant_id, setting_key);
CREATE INDEX IF NOT EXISTS idx_notification_settings_tenant ON notification_settings (tenant_id);
