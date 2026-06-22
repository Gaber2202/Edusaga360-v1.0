-- Enterprise Admin Portal: user lifecycle, trial→paid billing fields, platform audit log.
-- Additive & idempotent — no drops, safe to re-run. Matches the app's name/user_role/status convention.
-- Applied to production 2026-06-22.

-- ─── USERS: lifecycle flags ──────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_trial_user  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invited_by     UUID,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- ─── TENANTS: seats + billing / trial-conversion fields ──────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS max_users            INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS current_users        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes                TEXT,
  ADD COLUMN IF NOT EXISTS ai_enabled           BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS billing_email        TEXT,
  ADD COLUMN IF NOT EXISTS billing_cycle        TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS plan_started_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_renews_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_from_trial BOOLEAN DEFAULT FALSE;

-- Backfill the live seat counter from actual membership
UPDATE public.tenants t
SET current_users = sub.cnt
FROM (SELECT tenant_id, COUNT(*) AS cnt FROM public.users GROUP BY tenant_id) sub
WHERE sub.tenant_id = t.id;

-- ─── PLATFORM AUDIT LOG: every platform-owner action in the admin portal ─────
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  target_label TEXT,
  tenant_id    UUID,
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pal_created ON public.platform_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_target  ON public.platform_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_pal_tenant  ON public.platform_audit_log (tenant_id);

-- Service-role only (admin API). RLS on with no public policy = deny all anon/auth.
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
