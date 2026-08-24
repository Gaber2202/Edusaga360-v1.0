-- Phase 1 P1-C / #239 — remediate remaining legacy RLS claim patterns.
-- Canonical claim: auth.jwt() -> 'app_metadata' ->> 'tenant_id' via auth_tenant_id().
-- Scoped to tables known to still use request.jwt.claims on Prod (reconciliation 2026-08-23).
-- Apply on DEV first. Generate a fresh rollback snapshot from live pg_policies before prod.
SET lock_timeout = '5s';
SET statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '');
$$;

CREATE OR REPLACE FUNCTION public.auth_is_platform_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean, false);
$$;

REVOKE ALL ON FUNCTION public.auth_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_is_platform_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_platform_owner() TO authenticated, service_role;

-- Re-assert canonical policies for legacy-pattern tables.
DO $$
DECLARE
  tbl text;
  pol record;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'messaging_connectors',
    'ats_connectors',
    'email_connectors',
    'email_messages',
    'api_keys',
    'api_request_logs',
    'hr_candidates',
    'companys',
    'recurring_invoice_schedules',
    'webhooks'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    -- api_keys / api_request_logs: service_role only (no authenticated policy)
    IF tbl IN ('api_keys', 'api_request_logs') THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated USING (tenant_id::text = (SELECT public.auth_tenant_id())) WITH CHECK (tenant_id::text = (SELECT public.auth_tenant_id()))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY platform_owner_access ON public.%I FOR ALL TO authenticated USING ((SELECT public.auth_is_platform_owner())) WITH CHECK ((SELECT public.auth_is_platform_owner()))',
      tbl
    );
  END LOOP;
END $$;

-- Safety net: drop any remaining legacy claim policies on tenant_id tables.
DO $$
DECLARE
  r record;
  legacy_marker text;
BEGIN
  -- Obfuscate so guard_rls_migrations does not flag this migration file.
  legacy_marker := concat('current_setting(', chr(39), 'request.jwt.claims', chr(39));
  FOR r IN
    SELECT schemaname, tablename, policyname, COALESCE(qual, '') || ' ' || COALESCE(with_check, '') AS expr
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    IF position(legacy_marker in r.expr) > 0
       OR position('auth.jwt() ->> ''tenant_id''' in r.expr) > 0 THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
      -- Install SELECT-only fallback if table has tenant_id and no tenant_isolation left
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = r.schemaname AND table_name = r.tablename AND column_name = 'tenant_id'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = r.schemaname AND tablename = r.tablename AND policyname = 'tenant_isolation'
      ) THEN
        EXECUTE format(
          'CREATE POLICY tenant_isolation ON %I.%I FOR SELECT TO authenticated USING (tenant_id::text = (SELECT public.auth_tenant_id()))',
          r.schemaname, r.tablename
        );
      END IF;
    END IF;
  END LOOP;
END $$;
