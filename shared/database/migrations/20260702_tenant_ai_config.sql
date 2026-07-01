-- Per-tenant Yamen AI configuration: custom LLM providers + server-side token
-- metering and limits.
--
-- Builds on the pluggable provider registry (PR #85). A tenant can be routed to
-- its own LLM (e.g. a KSA-hosted model) with its own credentials, and usage is
-- metered and capped server-side — replacing the old client-incremented request
-- counter, which could not be trusted.

-- ---------------------------------------------------------------------------
-- Per-tenant custom LLM providers (OpenAI-compatible by default).
-- The API key is stored ENCRYPTED (AES-256-GCM, app-level) — never in plaintext.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_ai_providers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                 -- e.g. 'ksa-local'
  format       TEXT NOT NULL DEFAULT 'openai' -- openai | gemini | anthropic
                 CHECK (format IN ('openai', 'gemini', 'anthropic')),
  base_url     TEXT,                          -- required for openai format
  model        TEXT NOT NULL,
  api_key_enc  TEXT,                          -- AES-256-GCM ciphertext; NULL for keyless local
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  priority     INT NOT NULL DEFAULT 100,      -- lower = tried first
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_providers_tenant
  ON tenant_ai_providers (tenant_id, is_active, priority);

-- ---------------------------------------------------------------------------
-- Token metering columns on tenants.
-- The pre-existing yamen_ai_used_this_month / yamen_ai_monthly_limit counted
-- REQUESTS and were incremented client-side. We keep them for backward-compat
-- display, and add trustworthy, server-side TOKEN accounting alongside.
-- yamen_ai_token_limit: NULL = unlimited.
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS yamen_ai_tokens_used_this_month BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yamen_ai_token_limit BIGINT,           -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS yamen_ai_usage_period TEXT;            -- 'YYYY-MM'

-- ---------------------------------------------------------------------------
-- Atomic usage recorder with monthly rollover.
-- Increments token + request counters for the current month, resetting both
-- when the stored period is not the current month. Returns the running token
-- total for the month. Called by the backend after each successful AI call.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_ai_usage(
  p_tenant_id UUID,
  p_tokens    BIGINT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period TEXT := to_char(now(), 'YYYY-MM');
  v_total  BIGINT;
BEGIN
  UPDATE tenants
  SET
    yamen_ai_tokens_used_this_month =
      CASE WHEN yamen_ai_usage_period IS DISTINCT FROM v_period
           THEN GREATEST(p_tokens, 0)
           ELSE yamen_ai_tokens_used_this_month + GREATEST(p_tokens, 0) END,
    yamen_ai_used_this_month =
      CASE WHEN yamen_ai_usage_period IS DISTINCT FROM v_period
           THEN 1
           ELSE COALESCE(yamen_ai_used_this_month, 0) + 1 END,
    yamen_ai_usage_period = v_period
  WHERE id = p_tenant_id
  RETURNING yamen_ai_tokens_used_this_month INTO v_total;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION record_ai_usage(UUID, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_ai_usage(UUID, BIGINT) FROM anon;
REVOKE ALL ON FUNCTION record_ai_usage(UUID, BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_ai_usage(UUID, BIGINT) TO service_role;

-- Backend reaches these tables only via the service-role key; keep tenant_ai
-- providers unreachable from anon/authenticated PostgREST roles (keys live here).
ALTER TABLE tenant_ai_providers ENABLE ROW LEVEL SECURITY;
-- No policies added → only service_role (which bypasses RLS) can read/write.
