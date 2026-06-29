-- ============================================================================
-- 20260629_tenant_files_bucket_rls.sql
--
-- Closes finding 4B-2 (findings_log.md): the private `tenant-files` Storage
-- bucket had RLS enabled but ZERO policies, so any *direct* Storage API access
-- with a user JWT was fully denied (and undocumented).
--
-- App functionality is unaffected by these policies: the backend
-- (`/api/files/*`) talks to Storage with the SERVICE-ROLE key, which bypasses
-- RLS entirely, and the frontends never touch Storage directly (all reads use
-- backend-minted signed URLs). These policies are defense-in-depth: if a user
-- JWT is ever used against the Storage API directly, it is confined to that
-- user's own tenant folder.
--
-- Path convention (see backend/src/routes/files.ts):
--     <tenant_id>/<year>/<uuid>.<ext>     for tenant-scoped users
--     platform/<year>/<uuid>.<ext>        for platform owners (no tenant_id)
--
-- Authorization model:
--   * platform owners (app_metadata.is_platform_owner = true) — all objects
--   * tenant users — only objects whose first path segment == their tenant_id
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- RLS is enabled on storage.objects by default in Supabase. Toggling it
-- requires table ownership (supabase_storage_admin), which the SQL editor /
-- migration role may not have, so guard it instead of failing the migration.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping ENABLE RLS on storage.objects (not owner); it is enabled by default.';
END $$;

DROP POLICY IF EXISTS "tenant-files read"   ON storage.objects;
DROP POLICY IF EXISTS "tenant-files insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant-files update" ON storage.objects;
DROP POLICY IF EXISTS "tenant-files delete" ON storage.objects;

-- SELECT (download / list)
CREATE POLICY "tenant-files read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'tenant-files'
    AND (
      (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner') = 'true'
      OR split_part(name, '/', 1) = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    )
  );

-- INSERT (upload)
CREATE POLICY "tenant-files insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-files'
    AND (
      (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner') = 'true'
      OR split_part(name, '/', 1) = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    )
  );

-- UPDATE (overwrite / move)
CREATE POLICY "tenant-files update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-files'
    AND (
      (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner') = 'true'
      OR split_part(name, '/', 1) = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    )
  )
  WITH CHECK (
    bucket_id = 'tenant-files'
    AND (
      (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner') = 'true'
      OR split_part(name, '/', 1) = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    )
  );

-- DELETE
CREATE POLICY "tenant-files delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-files'
    AND (
      (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner') = 'true'
      OR split_part(name, '/', 1) = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    )
  );
