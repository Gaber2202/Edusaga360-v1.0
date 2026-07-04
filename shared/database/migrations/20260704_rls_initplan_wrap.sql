-- RLSPERF-03 — wrap auth.<fn>() calls in RLS policies with (select …).
--
-- The performance advisor's `auth_rls_initplan` warning fires when a policy calls
-- auth.jwt()/auth.uid() (or current_setting()) directly: Postgres then
-- re-evaluates that function once PER ROW. Wrapping the call in a scalar subquery
-- `(select auth.jwt())` lets the planner evaluate it ONCE per statement (InitPlan)
-- and reuse the value — a large win on big tenant tables — WITHOUT changing which
-- rows the policy admits (a STABLE function's scalar subquery returns the same
-- value, so the predicate result is identical).
--
-- Scope: a live audit found most policies were ALREADY wrapped by a prior pass;
-- only the 17 policies below still had bare auth calls. Each ALTER POLICY
-- reproduces the existing predicate EXACTLY and only wraps the auth call — no
-- change to roles, command, or logic. ALTER POLICY (not DROP/CREATE) means there
-- is never a window where the policy is absent.
--
-- Verified live before/after with an `authenticated`-role probe on audit_logs
-- (has multi-tenant rows): tenant A = 70, tenant B = 16, platform owner = 92 —
-- identical before and after. Post-change structural check: 0 policies with an
-- unwrapped auth call remain.
--
-- MUST run after the migrations that create these policies (it only ALTERs them).
-- Reversible: re-run the original CREATE POLICY / ALTER POLICY with the unwrapped
-- expression (kept in git history). Reverting only affects performance, not access.

-- ── Batch 1 — tenant-scoped policies ────────────────────────────────────────
ALTER POLICY audit_logs_insert ON public.audit_logs
  WITH CHECK ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text));

ALTER POLICY audit_logs_select ON public.audit_logs
  USING ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text));

ALTER POLICY cheque_status_history_tenant_iso ON public.cheque_status_history
  USING ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text));

ALTER POLICY cheques_tenant_iso ON public.cheques
  USING ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text));

ALTER POLICY exec_brief_tenant_select ON public.exec_brief_cache
  USING ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text));

ALTER POLICY exec_access_tenant_select ON public.exec_dashboard_access
  USING ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text));

ALTER POLICY exec_weights_tenant_select ON public.exec_vitality_weights
  USING ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text));

ALTER POLICY invoice_batches_tenant ON public.invoice_batches
  USING (((((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid = tenant_id);

ALTER POLICY tur_insert ON public.tenant_user_requests
  WITH CHECK ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text));

ALTER POLICY tur_update ON public.tenant_user_requests
  USING ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text))
  WITH CHECK ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text));

ALTER POLICY tenants_read_own ON public.tenants
  USING ((id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text));

-- ── Batch 2 — platform-owner / user-self / system_errors policies ───────────
ALTER POLICY audit_logs_platform_owner_select ON public.audit_logs
  USING (((((select auth.jwt()) -> 'app_metadata'::text) ->> 'is_platform_owner'::text))::boolean = true);

ALTER POLICY reg_requests_platform_owner ON public.registration_requests
  USING (((((select auth.jwt()) -> 'app_metadata'::text) ->> 'is_platform_owner'::text))::boolean = true)
  WITH CHECK (((((select auth.jwt()) -> 'app_metadata'::text) ->> 'is_platform_owner'::text))::boolean = true);

ALTER POLICY system_errors_tenant_isolation ON public.system_errors
  USING (((tenant_id IS NULL) AND (((((select auth.jwt()) -> 'app_metadata'::text) ->> 'is_platform_owner'::text))::boolean = true)) OR ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text)))
  WITH CHECK (((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text)) OR (((((select auth.jwt()) -> 'app_metadata'::text) ->> 'is_platform_owner'::text))::boolean = true));

ALTER POLICY tenants_platform_owner_write ON public.tenants
  USING (((((select auth.jwt()) -> 'app_metadata'::text) ->> 'is_platform_owner'::text))::boolean = true)
  WITH CHECK (((((select auth.jwt()) -> 'app_metadata'::text) ->> 'is_platform_owner'::text))::boolean = true);

ALTER POLICY users_platform_owner ON public.users
  USING (((((select auth.jwt()) -> 'app_metadata'::text) ->> 'is_platform_owner'::text))::boolean = true)
  WITH CHECK (((((select auth.jwt()) -> 'app_metadata'::text) ->> 'is_platform_owner'::text))::boolean = true);

ALTER POLICY users_self ON public.users
  USING ((auth_id = (select auth.uid())) OR ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text)))
  WITH CHECK ((auth_id = (select auth.uid())) OR ((tenant_id)::text = (((select auth.jwt()) -> 'app_metadata'::text) ->> 'tenant_id'::text)));
