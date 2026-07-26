-- Runtime fixes discovered during end-to-end testing of the enterprise invoicing engine.
-- Safe to re-run: all changes are idempotent.

-- 1. invoices.terms_and_conditions may be missing on environments that applied earlier
--    Part A migrations before this column was added.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;

-- 2. post_journal was introduced by 20260701_gl_branch_dimension.sql but was not
--    applied to the live test database, so billing/payment flows could not post
--    double-entry journals. Re-create it here with an idempotent guard.
DROP FUNCTION IF EXISTS post_journal(UUID, UUID, TEXT, TEXT, JSONB, UUID);
DROP FUNCTION IF EXISTS post_journal(UUID, UUID, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION post_journal(
  p_tenant_id   UUID,
  p_created_by  UUID,
  p_reference   TEXT,
  p_description TEXT,
  p_lines       JSONB,
  p_branch_id   UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line       JSONB;
  v_account_id UUID;
  v_total      NUMERIC(15,2) := 0;
  v_je_id      UUID;
  v_resolved   JSONB := '[]'::JSONB;
BEGIN
  -- Resolve every account up front; abort (skip) if any is missing so we never
  -- write a partial/unbalanced entry.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT id INTO v_account_id
    FROM chart_of_accounts
    WHERE tenant_id = p_tenant_id
      AND code ILIKE (v_line->>'account_code') || '%'
      AND is_active = TRUE
    ORDER BY code
    LIMIT 1;

    IF v_account_id IS NULL THEN
      RETURN NULL;
    END IF;

    v_total := v_total + COALESCE((v_line->>'debit')::NUMERIC, 0);
    v_resolved := v_resolved || jsonb_build_object(
      'account_id',  v_account_id,
      'debit',       COALESCE((v_line->>'debit')::NUMERIC, 0),
      'credit',      COALESCE((v_line->>'credit')::NUMERIC, 0),
      'description', v_line->>'description'
    );
  END LOOP;

  v_total := ROUND(v_total, 2);

  INSERT INTO journal_entries
    (tenant_id, branch_id, date, reference, description, total_debit, total_credit, status, created_by)
  VALUES
    (p_tenant_id, p_branch_id, CURRENT_DATE, p_reference, p_description, v_total, v_total, 'posted', p_created_by)
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_lines
    (tenant_id, branch_id, journal_entry_id, account_id, debit, credit, description)
  SELECT
    p_tenant_id,
    p_branch_id,
    v_je_id,
    (l->>'account_id')::UUID,
    (l->>'debit')::NUMERIC,
    (l->>'credit')::NUMERIC,
    l->>'description'
  FROM jsonb_array_elements(v_resolved) AS l;

  RETURN v_je_id;
END;
$$;

REVOKE ALL ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB, UUID) FROM anon;
REVOKE ALL ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB, UUID) TO service_role;
