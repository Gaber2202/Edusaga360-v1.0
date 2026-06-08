-- Platform-level invitations: platform owner invites schools to register a trial

CREATE TABLE IF NOT EXISTS platform_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  recipient_name  TEXT NOT NULL,
  school_name     TEXT,
  message         TEXT,
  plan_code       TEXT NOT NULL DEFAULT 'free_trial',
  token           TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | expired | revoked
  expires_at      TIMESTAMPTZ NOT NULL,
  invited_by      UUID,                              -- platform owner auth user id
  accepted_at     TIMESTAMPTZ,
  tenant_id       UUID REFERENCES tenants(id),      -- filled when accepted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pi_token  ON platform_invitations (token);
CREATE INDEX IF NOT EXISTS idx_pi_email  ON platform_invitations (recipient_email);
CREATE INDEX IF NOT EXISTS idx_pi_status ON platform_invitations (status);

-- Service role only; no tenant RLS needed (platform-level table)
ALTER TABLE platform_invitations ENABLE ROW LEVEL SECURITY;
-- No public policy — all access via service-role key through /api/admin routes
