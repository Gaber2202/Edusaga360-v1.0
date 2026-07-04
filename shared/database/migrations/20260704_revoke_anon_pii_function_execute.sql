-- =============================================================================
-- SEC-DEF-01 — Lock down SECURITY DEFINER PII-encryption functions
--
-- Supabase's security advisor flagged three SECURITY DEFINER functions as
-- executable by the `anon` (unauthenticated) and `authenticated` roles via
-- PostgREST RPC (/rest/v1/rpc/<fn>):
--     public.encrypt_employee_pii()
--     public.encrypt_guardian_pii()
--     public.encrypt_student_pii()
--
-- These run with elevated (definer) privileges and are internal helpers — a
-- repo-wide search confirms NO application code (frontend, backend, or either
-- portal) calls them via RPC. They should therefore not be reachable from the
-- public API. Leaving them callable by `anon` lets an unauthenticated caller
-- invoke privileged PII logic.
--
-- Fix: revoke EXECUTE from anon + authenticated. This is:
--   * NON-DESTRUCTIVE — it only tightens permissions; no data is touched.
--   * SAFE for triggers — trigger-invoked functions run with the definer's
--     rights regardless of role EXECUTE grants, so any BEFORE INSERT/UPDATE
--     trigger that calls these keeps working.
--   * SAFE for the backend — the service_role key retains EXECUTE.
--   * REVERSIBLE — see the rollback block at the bottom.
--
-- Idempotent: guarded so re-running (or running where a function is absent) is
-- a no-op rather than an error.
-- =============================================================================

-- Postgres grants EXECUTE to PUBLIC by default, so anon/authenticated inherit it
-- via PUBLIC — revoking from those two roles alone is a no-op. We therefore
-- revoke from PUBLIC (the actual source of the grant) AND explicitly re-grant to
-- service_role, so the trusted backend keeps an unambiguous path if it ever needs
-- one, while the public API roles lose access. Triggers are unaffected either way
-- (they run with the function owner's rights).
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.encrypt_employee_pii()',
    'public.encrypt_guardian_pii()',
    'public.encrypt_student_pii()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      -- Preserve the trusted backend path first, so the revoke below can't strand it.
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
      -- Remove the public/default grants that exposed the RPC to anon + authenticated.
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn);
      RAISE NOTICE 'Locked down %: service_role only', fn;
    ELSE
      RAISE NOTICE 'Function % not present — skipped', fn;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- ROLLBACK (run manually if a legitimate caller is discovered):
--   GRANT EXECUTE ON FUNCTION public.encrypt_employee_pii()  TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.encrypt_guardian_pii()  TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.encrypt_student_pii()   TO authenticated;
-- (Prefer granting only to `authenticated`, never re-granting to `anon`.)
-- =============================================================================
