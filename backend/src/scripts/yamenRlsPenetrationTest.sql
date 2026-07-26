-- YAMEN Collections — end-to-end RLS penetration test.
-- Run against a linked Supabase project with:
--   cd backend && npx supabase db query --linked --file src/scripts/yamenRlsPenetrationTest.sql
-- The script creates two test tenants, then exercises the tenant_isolation
-- RLS policies and immutable-table triggers. Results are returned as rows.
-- Idempotent: stale test guardians/students/profiles are cleaned at the start.

CREATE TEMP TABLE rls_results (
  test text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
);
GRANT ALL ON TABLE rls_results TO authenticated;

DO $$
DECLARE
  tenant_a uuid;
  tenant_b uuid;
  guardian_a uuid;
  student_a uuid;
  profile_a uuid;
  ledger_id uuid;
  row_count int;
  err_msg text;
  err_code text;
  test_passed boolean;
  test_detail text;
BEGIN
  -- 0. Clean up any stale test rows from previous aborted runs.
  DELETE FROM collection_profiles
    WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'yamen-rls-%');
  DELETE FROM students
    WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'yamen-rls-%');
  DELETE FROM guardians
    WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'yamen-rls-%');

  -- 1. Create/reuse two isolated test tenants (as postgres/superuser).
  INSERT INTO tenants (name_en, slug, status, default_language)
    VALUES ('YAMEN RLS Tenant A', 'yamen-rls-a', 'active', 'ar')
    ON CONFLICT (slug) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO tenant_a;

  INSERT INTO tenants (name_en, slug, status, default_language)
    VALUES ('YAMEN RLS Tenant B', 'yamen-rls-b', 'active', 'ar')
    ON CONFLICT (slug) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO tenant_b;

  INSERT INTO guardians (tenant_id, name_en, phone, email)
    VALUES (tenant_a, 'RLS Guardian A', '+966500000001', 'rls-a@example.com')
    RETURNING id INTO guardian_a;

  INSERT INTO students (tenant_id, guardian_id, name_en, status)
    VALUES (tenant_a, guardian_a, 'RLS Student A', 'active')
    RETURNING id INTO student_a;

  -- 2. Act as tenant A and create a profile.
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('tenant_id', tenant_a::text)::text, true);

  INSERT INTO collection_profiles (
    tenant_id, guardian_id, student_id, current_segment,
    outstanding_balance, total_invoiced, total_collected
  ) VALUES (
    tenant_a, guardian_a, student_a, 'B', 1000, 1000, 0
  ) RETURNING id INTO profile_a;

  SELECT count(*) INTO row_count FROM collection_profiles;
  IF row_count = 1 THEN
    INSERT INTO rls_results VALUES ('tenant_a_can_read_own_profile', true, 'saw ' || row_count || ' profile(s)');
  ELSE
    INSERT INTO rls_results VALUES ('tenant_a_can_read_own_profile', false, 'expected 1, saw ' || row_count);
  END IF;

  -- 3. Switch to tenant B; should not see tenant A's profile.
  PERFORM set_config('request.jwt.claims', json_build_object('tenant_id', tenant_b::text)::text, true);

  SELECT count(*) INTO row_count FROM collection_profiles;
  IF row_count = 0 THEN
    INSERT INTO rls_results VALUES ('tenant_b_cannot_read_tenant_a_profile', true, 'saw 0 profiles');
  ELSE
    INSERT INTO rls_results VALUES ('tenant_b_cannot_read_tenant_a_profile', false, 'expected 0, saw ' || row_count);
  END IF;

  -- 4. Tenant B attempts to update tenant A's profile.
  UPDATE collection_profiles SET outstanding_balance = 999 WHERE id = profile_a;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count = 0 THEN
    INSERT INTO rls_results VALUES ('tenant_b_cannot_update_tenant_a_profile', true, 'updated 0 rows');
  ELSE
    INSERT INTO rls_results VALUES ('tenant_b_cannot_update_tenant_a_profile', false, 'updated ' || row_count || ' rows');
  END IF;

  -- 5. Tenant B attempts to delete tenant A's profile.
  DELETE FROM collection_profiles WHERE id = profile_a;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count = 0 THEN
    INSERT INTO rls_results VALUES ('tenant_b_cannot_delete_tenant_a_profile', true, 'deleted 0 rows');
  ELSE
    INSERT INTO rls_results VALUES ('tenant_b_cannot_delete_tenant_a_profile', false, 'deleted ' || row_count || ' rows');
  END IF;

  -- 6. WITH CHECK: tenant B tries to insert a row labelled as tenant A.
  BEGIN
    INSERT INTO collection_profiles (
      tenant_id, guardian_id, student_id, current_segment,
      outstanding_balance, total_invoiced, total_collected
    ) VALUES (
      tenant_a, guardian_a, student_a, 'B', 500, 500, 0
    );
    test_passed := false;
    test_detail := 'insert succeeded (should have been blocked)';
  EXCEPTION WHEN insufficient_privilege THEN
    test_passed := true;
    test_detail := 'insert blocked by WITH CHECK policy';
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT, err_code = RETURNED_SQLSTATE;
    test_passed := false;
    test_detail := 'unexpected error: ' || err_code || ' - ' || err_msg;
  END;
  INSERT INTO rls_results VALUES ('tenant_b_cannot_insert_as_tenant_a', test_passed, test_detail);

  -- 7. Tenant A can still read its profile after cross-tenant attempts.
  PERFORM set_config('request.jwt.claims', json_build_object('tenant_id', tenant_a::text)::text, true);
  SELECT count(*) INTO row_count FROM collection_profiles WHERE id = profile_a;
  IF row_count = 1 THEN
    INSERT INTO rls_results VALUES ('tenant_a_profile_intact_after_negative_tests', true, 'profile still exists');
  ELSE
    INSERT INTO rls_results VALUES ('tenant_a_profile_intact_after_negative_tests', false, 'profile missing, count=' || row_count);
  END IF;

  -- 8. Immutable ledger: an UPDATE and a DELETE on an existing row must be blocked.
  SET ROLE postgres;
  INSERT INTO agent_actions_ledger (tenant_id, action_type, actor, decision)
    VALUES (tenant_a, 'test', 'system', 'append_ok')
    RETURNING id INTO ledger_id;

  BEGIN
    UPDATE agent_actions_ledger SET decision = 'mutated' WHERE id = ledger_id;
    test_passed := false;
    test_detail := 'update succeeded (should be blocked)';
  EXCEPTION WHEN insufficient_privilege THEN
    test_passed := true;
    test_detail := 'update blocked by immutable trigger';
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT, err_code = RETURNED_SQLSTATE;
    test_passed := false;
    test_detail := 'unexpected error: ' || err_code || ' - ' || err_msg;
  END;
  INSERT INTO rls_results VALUES ('ledger_update_blocked', test_passed, test_detail);

  BEGIN
    DELETE FROM agent_actions_ledger WHERE id = ledger_id;
    test_passed := false;
    test_detail := 'delete succeeded (should be blocked)';
  EXCEPTION WHEN insufficient_privilege THEN
    test_passed := true;
    test_detail := 'delete blocked by immutable trigger';
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT, err_code = RETURNED_SQLSTATE;
    test_passed := false;
    test_detail := 'unexpected error: ' || err_code || ' - ' || err_msg;
  END;
  INSERT INTO rls_results VALUES ('ledger_delete_blocked', test_passed, test_detail);

  -- 9. Test ledger tenant isolation: tenant A can read its own ledger row.
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('tenant_id', tenant_a::text)::text, true);
  SELECT count(*) INTO row_count FROM agent_actions_ledger WHERE tenant_id = tenant_a;
  IF row_count >= 1 THEN
    INSERT INTO rls_results VALUES ('tenant_a_can_read_ledger_row', true, 'saw ' || row_count || ' ledger row(s)');
  ELSE
    INSERT INTO rls_results VALUES ('tenant_a_can_read_ledger_row', false, 'expected >=1, saw ' || row_count);
  END IF;

  -- 10. Clean up test data (ledger rows are immutable and left in place; tenants are reused).
  SET ROLE postgres;
  DELETE FROM collection_profiles WHERE tenant_id IN (tenant_a, tenant_b);
  DELETE FROM students WHERE tenant_id IN (tenant_a, tenant_b);
  DELETE FROM guardians WHERE tenant_id IN (tenant_a, tenant_b);

  INSERT INTO rls_results VALUES ('cleanup_completed', true, 'test guardians/students/profiles removed');
END $$;

SELECT * FROM rls_results ORDER BY test;
