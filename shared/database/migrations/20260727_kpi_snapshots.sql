-- ============================================================
-- EduSaga 360 — Executive Command Center v2: KPI snapshots
-- ============================================================
-- Additive & idempotent. Provides a materialized metrics layer
-- for the Executive Command Center so dashboards read fast,
-- consistent snapshots instead of running heavy live joins.

-- ─── kpi_registry — metric definitions, thresholds, ownership ─────────────
CREATE TABLE IF NOT EXISTS kpi_registry (
  metric_key      TEXT PRIMARY KEY,
  name_ar         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  formula         TEXT,
  source_tables   TEXT[] DEFAULT '{}',
  owner_persona   TEXT[] DEFAULT '{}',
  threshold_green NUMERIC,
  threshold_amber NUMERIC,
  threshold_red   NUMERIC,
  display_format  TEXT CHECK (display_format IN ('currency','percent','number','ratio','days','text'))
);

COMMENT ON TABLE kpi_registry IS 'Canonical KPI definitions and thresholds used across all executive dashboards.';

-- ─── kpi_snapshots — materialized metric values per tenant / branch / period ─
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES branches(id) ON DELETE CASCADE,
  metric_key    TEXT NOT NULL REFERENCES kpi_registry(metric_key),
  period        TEXT NOT NULL,              -- e.g. '2026-07', 'ytd-2026', 'current'
  value         NUMERIC,
  numerator     NUMERIC,
  denominator   NUMERIC,
  metadata      JSONB NOT NULL DEFAULT '{}',
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id, metric_key, period)
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_lookup
  ON kpi_snapshots (tenant_id, branch_id, metric_key, period);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_tenant_computed
  ON kpi_snapshots (tenant_id, period, computed_at DESC);

ALTER TABLE kpi_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_snapshots_tenant_select ON kpi_snapshots;
CREATE POLICY kpi_snapshots_tenant_select
  ON kpi_snapshots FOR SELECT
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
-- Writes are performed by the backend service-role client only.

-- ─── kpi_refresh_jobs — audit trail for snapshot recomputations ─────────────
CREATE TABLE IF NOT EXISTS kpi_refresh_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   UUID,
  period      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error       TEXT,
  metrics_count INT
);

CREATE INDEX IF NOT EXISTS idx_kpi_refresh_jobs_tenant
  ON kpi_refresh_jobs (tenant_id, started_at DESC);

ALTER TABLE kpi_refresh_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_refresh_jobs_tenant_select ON kpi_refresh_jobs;
CREATE POLICY kpi_refresh_jobs_tenant_select
  ON kpi_refresh_jobs FOR SELECT
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
-- Inserts/updates go through the backend service-role client.

-- ─── nitaqat_thresholds — configurable Saudization/Nitaqat bands per tenant ──
-- Defaults are sensible for private K-12 schools in KSA.
CREATE TABLE IF NOT EXISTS nitaqat_thresholds (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  platinum    NUMERIC(5,2) NOT NULL DEFAULT 40,
  green       NUMERIC(5,2) NOT NULL DEFAULT 25,
  yellow      NUMERIC(5,2) NOT NULL DEFAULT 15,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nitaqat_thresholds IS 'Per-tenant Nitaqat band thresholds (percentage of Saudi employees). Platinum >= green >= yellow.';

ALTER TABLE nitaqat_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nitaqat_thresholds_tenant_select ON nitaqat_thresholds;
CREATE POLICY nitaqat_thresholds_tenant_select
  ON nitaqat_thresholds FOR SELECT
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
-- Writes go through the backend service-role client.
