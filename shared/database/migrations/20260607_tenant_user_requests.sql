-- Trial user-add requests.
-- A tenant admin (school owner) on a trial can request additional users
-- (up to a tenant cap, default 3 total). The platform owner approves/rejects
-- each request from the admin portal; on approval the auth user is created.

CREATE TABLE IF NOT EXISTS tenant_user_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by    UUID,                         -- auth user id of the requesting admin
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  requested_role  TEXT NOT NULL DEFAULT 'hr_officer',
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  rejection_reason TEXT,
  reviewed_by     UUID,                         -- platform owner auth id
  reviewed_at     TIMESTAMPTZ,
  created_user_id UUID,                          -- resulting auth user id after approval
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tur_tenant  ON tenant_user_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tur_status  ON tenant_user_requests (status);
-- Prevent duplicate pending requests for the same email within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_tur_unique_pending
  ON tenant_user_requests (tenant_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE tenant_user_requests ENABLE ROW LEVEL SECURITY;

-- Tenant members can see their own tenant's requests; service role bypasses RLS.
DROP POLICY IF EXISTS tur_tenant_isolation ON tenant_user_requests;
CREATE POLICY tur_tenant_isolation ON tenant_user_requests
  FOR SELECT
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
