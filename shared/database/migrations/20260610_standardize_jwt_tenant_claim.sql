-- Standardize all RLS tenant_isolation policies to use app_metadata.tenant_id
-- Background: original 44 tables used top-level jwt() ->> 'tenant_id' (requires a
-- Custom Access Token Hook). Billing tables (fee_*, payment_plan*, invoice_discounts,
-- zatca_submissions, dunning_log, tenant_user_requests) already use
-- jwt() -> 'app_metadata' ->> 'tenant_id' (natively present, no hook needed).
-- This migration aligns ALL tenant_isolation policies to app_metadata so clients
-- querying Supabase directly get consistent results regardless of hook status.
--
-- Safe to re-run: DROP IF EXISTS before CREATE.

DO $outer$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'students','employees','parents','parent_student_links',
    'academic_years','terms','branches','grades','classrooms','sections',
    'subjects','curricula','curriculum_subjects',
    'attendance','attendance_policies','attendance_exceptions',
    'leave_requests','leave_types','leave_balances',
    'payroll','payroll_items','salary_structures','salary_components',
    'invoices','payments','fee_categories','fee_structures',
    'discount_rules','payment_plans','payment_plan_installments',
    'invoice_discounts','zatca_submissions','dunning_log',
    'communications','communication_recipients','announcements',
    'events','event_attendees',
    'assets','asset_assignments',
    'journal_entries','journal_lines','chart_of_accounts',
    'exam_schedules','exam_results','report_cards',
    'transport_routes','transport_stops','transport_assignments',
    'library_items','library_checkouts',
    'benchmarks','benchmark_results',
    'tenant_user_requests','platform_invitations',
    'audit_log','system_errors'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Check table exists before touching it
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN

      -- Drop old top-level claim policy if present
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON public.%I', tbl);

      -- Create unified app_metadata-based policy (evaluated once per query via SELECT wrapper)
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I'
        || ' AS PERMISSIVE FOR ALL TO authenticated'
        || ' USING (tenant_id::text = (SELECT auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))'
        || ' WITH CHECK (tenant_id::text = (SELECT auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',
        tbl);

    END IF;
  END LOOP;
END $outer$;

-- Ensure platform_owner_access policies also use app_metadata consistently
DO $outer$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'tenants','users','students','employees','parents',
    'invoices','payments','fee_categories','fee_structures',
    'platform_invitations','tenant_user_requests','audit_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS platform_owner_access ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY platform_owner_access ON public.%I'
        || ' AS PERMISSIVE FOR ALL TO authenticated'
        || ' USING ((SELECT (auth.jwt() -> ''app_metadata'' ->> ''is_platform_owner'')::boolean) = true)'
        || ' WITH CHECK ((SELECT (auth.jwt() -> ''app_metadata'' ->> ''is_platform_owner'')::boolean) = true)',
        tbl);
    END IF;
  END LOOP;
END $outer$;
