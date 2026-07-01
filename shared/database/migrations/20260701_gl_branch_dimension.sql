-- General Ledger branch dimension (multi-branch / multi-CR school groups).
--
-- A group of schools in Saudi Arabia is commonly several legal entities (each
-- its own Commercial Registration + ZATCA/VAT + GOSI establishment) that still
-- roll up into one group. Until now the ledger was tenant-scoped only, so every
-- branch posted into a single shared set of books with no way to produce a
-- per-branch trial balance or statement.
--
-- This migration adds a NULLABLE `branch_id` to the ledger (and to the source
-- documents that feed it) so a journal can be attributed to a specific branch
-- OR left NULL for group-level entries. That covers both models:
--   * separate-CR branches  -> branch_id set, each branch has its own books
--   * one-CR many-campuses   -> branch_id NULL (or used purely for reporting),
--                               one consolidated set of books
-- "All branches" in the UI (branch_id filter absent) is the consolidated view.
--
-- MUST run AFTER 20260701_atomic_journal_posting.sql — it replaces post_journal.

-- ── Ledger tables ────────────────────────────────────────────────────────────
ALTER TABLE journal_entries      ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE journal_entry_lines  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ── Source documents that drive automated postings ──────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_branch     ON journal_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_branch ON journal_entry_lines(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch            ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_branch            ON payments(branch_id);

-- ── Backfill existing rows from their originating branch ─────────────────────
-- Invoices inherit the student's branch; payments inherit the invoice's branch.
-- Historical journal_entries stay NULL (group-level) — they predate the
-- dimension and cannot be reliably re-attributed after the fact.
UPDATE invoices i
   SET branch_id = s.branch_id
  FROM students s
 WHERE i.student_id = s.id
   AND i.branch_id IS NULL
   AND s.branch_id IS NOT NULL;

UPDATE payments p
   SET branch_id = i.branch_id
  FROM invoices i
 WHERE p.invoice_id = i.id
   AND p.branch_id IS NULL
   AND i.branch_id IS NOT NULL;

-- ── Re-create post_journal with the branch dimension ─────────────────────────
-- Behaviour is identical to the atomic-posting version; the only change is that
-- the (optional) branch is stamped on the header and every line. p_branch_id
-- defaults to NULL so existing 5-argument callers keep working unchanged.
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

-- The backend calls this with the service-role key. Lock the function down so it
-- is not reachable by anon/authenticated PostgREST roles.
REVOKE ALL ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB, UUID) FROM anon;
REVOKE ALL ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION post_journal(UUID, UUID, TEXT, TEXT, JSONB, UUID) TO service_role;
