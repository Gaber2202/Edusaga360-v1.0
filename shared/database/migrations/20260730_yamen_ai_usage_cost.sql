-- Yamen AI per-request usage and cost tracking.
-- Adds the token/cost columns to tenants (if not already present) and a detailed
-- usage log that captures provider, model, source/module, tokens, and USD cost.

-- ---------------------------------------------------------------------------
-- Tenant counters (kept in sync with the older request counter).
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS yamen_ai_tokens_used_this_month BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yamen_ai_token_limit BIGINT,
  ADD COLUMN IF NOT EXISTS yamen_ai_usage_period TEXT,
  ADD COLUMN IF NOT EXISTS yamen_ai_cost_usd_this_month NUMERIC(12,6) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Per-request usage log.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS yamen_ai_usage_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider     TEXT,
  model        TEXT,
  source       TEXT,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  cost_usd     NUMERIC(12,6) NOT NULL DEFAULT 0,
  period       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yamen_ai_usage_log_tenant_period
  ON yamen_ai_usage_log (tenant_id, period);

CREATE INDEX IF NOT EXISTS idx_yamen_ai_usage_log_source_period
  ON yamen_ai_usage_log (source, period);

CREATE INDEX IF NOT EXISTS idx_yamen_ai_usage_log_provider_period
  ON yamen_ai_usage_log (provider, period);

CREATE INDEX IF NOT EXISTS idx_yamen_ai_usage_log_created_at
  ON yamen_ai_usage_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- Atomic usage recorder: inserts a log row and updates the tenant counters.
-- Designed to coexist with the older 2-parameter record_ai_usage (overloaded).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_ai_usage(
  p_tenant_id UUID,
  p_tokens BIGINT,
  p_provider TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_input_tokens BIGINT DEFAULT NULL,
  p_output_tokens BIGINT DEFAULT NULL,
  p_cost_usd NUMERIC DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period TEXT := to_char(now(), 'YYYY-MM');
  v_total  BIGINT;
  v_input  BIGINT := GREATEST(COALESCE(p_input_tokens, 0), 0);
  v_output BIGINT := GREATEST(COALESCE(p_output_tokens, 0), 0);
  v_tokens BIGINT := COALESCE(p_tokens, v_input + v_output);
  v_cost   NUMERIC(12,6) := COALESCE(p_cost_usd, 0);
BEGIN
  INSERT INTO yamen_ai_usage_log (
    tenant_id, provider, model, source, input_tokens, output_tokens, total_tokens, cost_usd, period
  ) VALUES (
    p_tenant_id, p_provider, p_model, p_source, v_input, v_output, v_tokens, v_cost, v_period
  );

  UPDATE tenants
  SET
    yamen_ai_tokens_used_this_month =
      CASE WHEN yamen_ai_usage_period IS DISTINCT FROM v_period
           THEN v_tokens
           ELSE yamen_ai_tokens_used_this_month + v_tokens END,
    yamen_ai_used_this_month =
      CASE WHEN yamen_ai_usage_period IS DISTINCT FROM v_period
           THEN 1
           ELSE COALESCE(yamen_ai_used_this_month, 0) + 1 END,
    yamen_ai_cost_usd_this_month =
      CASE WHEN yamen_ai_usage_period IS DISTINCT FROM v_period
           THEN v_cost
           ELSE COALESCE(yamen_ai_cost_usd_this_month, 0) + v_cost END,
    yamen_ai_usage_period = v_period
  WHERE id = p_tenant_id
  RETURNING yamen_ai_tokens_used_this_month INTO v_total;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION record_ai_usage(UUID, BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_ai_usage(UUID, BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION record_ai_usage(UUID, BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_ai_usage(UUID, BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, NUMERIC) TO service_role;
