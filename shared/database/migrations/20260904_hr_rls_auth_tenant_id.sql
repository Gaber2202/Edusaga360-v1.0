-- Fix RLS on HR policy tables using existing public.auth_tenant_id().
-- Do NOT recreate auth_tenant_id — prod returns uuid; text CREATE OR REPLACE fails.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

DO $$
DECLARE
  tbl text;
  pol record;
  cmp text;
BEGIN
  -- Support both uuid- and text-returning auth_tenant_id() deployments.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auth_tenant_id'
      AND pg_catalog.pg_get_function_result(p.oid) = 'uuid'
  ) THEN
    cmp := 'tenant_id = (SELECT public.auth_tenant_id())';
  ELSE
    cmp := 'tenant_id::text = (SELECT public.auth_tenant_id())::text';
  END IF;

  FOREACH tbl IN ARRAY ARRAY[
    'hr_policys',
    'policy_versions',
    'onboardings',
    'employee_documents'
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
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      tbl, cmp, cmp
    );

    IF to_regprocedure('public.auth_is_platform_owner()') IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY platform_owner_access ON public.%I FOR ALL TO authenticated USING ((SELECT public.auth_is_platform_owner())) WITH CHECK ((SELECT public.auth_is_platform_owner()))',
        tbl
      );
    END IF;
  END LOOP;
END $$;
