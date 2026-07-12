-- External API Foundation — tenant-scoped API keys for third-party integrations
-- (legacy SIS migration, ATS / LinkedIn, email, etc.).
--
-- These keys authenticate external, server-to-server callers on the public
-- `/api/v1` route group, which sits OUTSIDE the first-party Supabase-JWT +
-- browser-CORS wall used by the three frontends. An external system therefore
-- never needs a Supabase user session — it presents an API key and the backend
-- derives the tenant from the key.
--
-- Security model
-- --------------
--   * Only a one-way SHA-256 hash of each key is stored. The plaintext secret is
--     shown to the admin exactly once at creation time and is never persisted.
--   * key_prefix is the non-secret lookup handle (unique, indexed) so verifying a
--     key is one indexed row read followed by a constant-time hash compare.
--   * scopes is an explicit allow-list; a key can do nothing it was not granted.
--   * Keys are tenant-scoped. The backend reads tenant_id FROM the key, never from
--     caller-supplied input, so a key can only ever touch its own tenant's data.

-- ---------------------------------------------------------------------------
-- 1. api_keys — credential store for external integrations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_prefix   TEXT NOT NULL UNIQUE,
  key_hash     TEXT NOT NULL,
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  created_by   TEXT,
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Tenant isolation for the browser (authenticated) role that manages keys from
-- the app. The backend service role bypasses RLS and always filters by
-- tenant_id explicitly (see RF-006), including the unauthenticated `/api/v1`
-- verification path which looks a key up by its non-secret prefix.
DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'api_keys', 'api_keys');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. api_request_logs — append-only audit of external API traffic
-- ---------------------------------------------------------------------------
-- Best-effort observability + abuse investigation, not billing. Written by the
-- backend service role; readable per-tenant from the app.
CREATE TABLE IF NOT EXISTS api_request_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
  api_key_id   UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  method       TEXT,
  path         TEXT,
  status       INTEGER,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_tenant ON api_request_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_key ON api_request_logs (api_key_id);

ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'api_request_logs', 'api_request_logs');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
