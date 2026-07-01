-- Atomic double-entry journal posting.
--
-- Previously the backend inserted the journal_entries header and its
-- journal_entry_lines in two separate round-trips (see routes/billing.ts and
-- services/ledger.ts). A failure on the second insert left an orphaned header
-- whose debits/credits reconciled to nothing — an unbalanced GL. This function
-- resolves the accounts and writes the header + lines in a single transaction,
-- so posting is all-or-nothing.
--
-- Behaviour mirrors the old application logic exactly:
--   * Each line's account is resolved by CODE PREFIX (e.g. '41' -> '4101'),
--     matching the first active account, ordered by code.
--   * If ANY account is missing (chart of accounts not configured), the whole
--     entry is skipped and NULL is returned — no partial write. This preserves
--     the existing "best-effort, non-fatal" posting semantics.
--   * The header total is the sum of line debits, rounded to 2 dp (SAR).
--
-- p_lines is a JSONB array: [{ account_code, debit, credit, description }, ...]

CREATE OR REPLACE FUNCTION post_journal(
  p_tenant_id  UUID,
  p_created_by UUID,
  p_reference  TEXT,
  p_description TEXT,
  p_lines      JSONB
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
      RETURN NULL;  -- CoA not configured for this line — skip the whole entry
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
    (tenant_id, date, reference, description, total_debit, total_credit, status, created_by)
  VALUES
    (p_tenant_id, CURRENT_DATE, p_reference, p_description, v_total, v_total, 'posted', p_created_by)
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_lines
    (tenant_id, journal_entry_id, account_id, debit, credit, description)
  SELECT
    p_tenant_id,
    v_je_id,
    (l->>'account_id')::UUID,
    (l->>'debit')::NUMERIC,
    (l->>'credit')::NUMERIC,
    l->>'description'
  FROM jsonb_array_elements(v_resolved) AS l;

  RETURN v_je_id;
END;
$$;

-- The backend calls this with the service-role key. Lock the function down so it
-- is not reachable by anon/authenticated PostgREST roles.
REVOKE ALL ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB) TO service_role;
