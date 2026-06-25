-- Executive (C-Suite) Command Center: persona-based dashboard access,
-- configurable Group Vitality Index weights, and cached bilingual board briefs.
-- Additive & idempotent — no drops, safe to re-run.

-- ─── exec_dashboard_access — which personas (ceo/cfo/coo/chro) a user may view ──
-- Admins/creators/platform owners get implicit view-all (see backend
-- middleware/execAccess.ts) and do NOT need a row here. This table only grants
-- access to non-admin tenant users (e.g. a dedicated CFO account).
CREATE TABLE IF NOT EXISTS exec_dashboard_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  persona     TEXT NOT NULL CHECK (persona IN ('ceo', 'cfo', 'coo', 'chro')),
  granted_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, persona)
);
CREATE INDEX IF NOT EXISTS idx_exec_access_tenant_user ON exec_dashboard_access (tenant_id, user_id);

ALTER TABLE exec_dashboard_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exec_access_tenant_select ON exec_dashboard_access;
CREATE POLICY exec_access_tenant_select
  ON exec_dashboard_access FOR SELECT
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
-- No INSERT/UPDATE/DELETE policy: grants are written by the backend's
-- service-role client only (POST /api/exec/access, admin-gated).

-- ─── exec_vitality_weights — configurable Group Vitality Index sub-score weights ─
-- One row per tenant. Defaults match the documented composite:
-- Financial 25 / Growth 20 / Collections 20 / Compliance 20 / Retention 15.
CREATE TABLE IF NOT EXISTS exec_vitality_weights (
  tenant_id           UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  financial_weight    NUMERIC(5,2) NOT NULL DEFAULT 25,
  growth_weight       NUMERIC(5,2) NOT NULL DEFAULT 20,
  collections_weight  NUMERIC(5,2) NOT NULL DEFAULT 20,
  compliance_weight   NUMERIC(5,2) NOT NULL DEFAULT 20,
  retention_weight    NUMERIC(5,2) NOT NULL DEFAULT 15,
  updated_by          UUID,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE exec_vitality_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exec_weights_tenant_select ON exec_vitality_weights;
CREATE POLICY exec_weights_tenant_select
  ON exec_vitality_weights FOR SELECT
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
-- Writes (admin-only) go through the backend service-role client.

-- ─── exec_brief_cache — cached bilingual YAMEN board brief per reporting period ──
CREATE TABLE IF NOT EXISTS exec_brief_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period        TEXT NOT NULL,              -- e.g. '2026-06' (YYYY-MM reporting month)
  narrative_en  TEXT NOT NULL,
  narrative_ar  TEXT NOT NULL,
  actions_en    JSONB NOT NULL DEFAULT '[]', -- exactly 3 recommended actions
  actions_ar    JSONB NOT NULL DEFAULT '[]',
  metrics_snapshot JSONB NOT NULL DEFAULT '{}', -- inputs the brief was generated from
  provider      TEXT,                        -- which AI provider produced this brief
  generated_by  UUID,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, period)
);
CREATE INDEX IF NOT EXISTS idx_exec_brief_tenant_period ON exec_brief_cache (tenant_id, period);

ALTER TABLE exec_brief_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exec_brief_tenant_select ON exec_brief_cache;
CREATE POLICY exec_brief_tenant_select
  ON exec_brief_cache FOR SELECT
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
-- Writes (cache fill/refresh) go through the backend service-role client.
