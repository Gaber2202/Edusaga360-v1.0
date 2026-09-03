-- Fix RLS for HR / student contract tables using canonical app_metadata tenant claim.
-- Same failure mode as hr_policys: legacy top-level JWT tenant_id → insert rejected.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

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

DO $$
DECLARE
  tbl text;
  pol record;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'employee_documents',
    'employee_contracts',
    'contract_templates',
    'student_contracts',
    'contract_delivery_logs'
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
