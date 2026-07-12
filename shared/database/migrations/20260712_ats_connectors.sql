-- ATS Integration — connect an external Applicant Tracking System (LinkedIn
-- Talent, Indeed, Greenhouse, Workday, or a custom endpoint) and sync its
-- candidates into EduSaga's HR module.
--
-- Two tables:
--   * ats_connectors  — one row per configured ATS per tenant. Provider id +
--     non-secret config (JSONB) + encrypted credentials blob. Credentials are
--     AES-256-GCM encrypted at rest by the backend (lib/aiCrypto) — the column
--     only ever holds ciphertext, never a raw token.
--   * hr_candidates   — normalized candidates pulled from a connector. Unique on
--     (tenant_id, provider, external_id) so re-syncing is idempotent.
--
-- Security: both tenant-scoped with RLS; the backend service role always filters
-- by tenant_id explicitly (see RF-006).

-- ---------------------------------------------------------------------------
-- 1. ats_connectors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ats_connectors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,                    -- linkedin | indeed | greenhouse | workday | custom
  display_name     TEXT NOT NULL,
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- non-secret settings (board id, base url, field map, ...)
  credentials      TEXT,                             -- AES-256-GCM ciphertext of a JSON credentials object
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  status           TEXT NOT NULL DEFAULT 'configured', -- configured | ok | error
  last_sync_at     TIMESTAMPTZ,
  last_sync_status TEXT,                             -- ok | error
  last_error       TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ats_connectors_tenant ON ats_connectors (tenant_id);

ALTER TABLE ats_connectors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'ats_connectors', 'ats_connectors');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. hr_candidates — candidates synced from an ATS connector
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_candidates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id UUID REFERENCES ats_connectors(id) ON DELETE SET NULL,
  provider     TEXT NOT NULL,
  external_id  TEXT NOT NULL,                        -- id in the source ATS
  full_name    TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  job_title    TEXT,
  stage        TEXT,                                 -- source ATS stage/status, as-is
  applied_at   TIMESTAMPTZ,
  raw          JSONB DEFAULT '{}'::jsonb,            -- original provider payload for the row
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_candidates_tenant ON hr_candidates (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_candidates_connector ON hr_candidates (connector_id);

ALTER TABLE hr_candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'hr_candidates', 'hr_candidates');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
