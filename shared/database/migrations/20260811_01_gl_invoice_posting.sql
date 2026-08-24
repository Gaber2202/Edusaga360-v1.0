-- Phase 1 P1-B (#257): atomic invoice + CoA seed + post_journal RAISE + ZATCA chain lock
-- Apply on DEV first. Rollback: docs/reconciliation / drop functions listed below.
SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- General Ledger: seed standard chart of accounts for all tenants and add an
-- atomic, account-validated invoice creation function.
--
-- create_invoice_with_journal validates the required chart-of-accounts codes
-- BEFORE writing anything.  If any required account is missing or inactive it
-- raises 'chart_of_accounts_incomplete' and nothing is persisted.  Otherwise the
-- invoice, discounts, ZATCA submission, payment-plan/instalments and the GL
-- journal are inserted in one transaction.

-- ── Standard chart of accounts template (6-digit l10n_sa style) ───────────────

CREATE OR REPLACE FUNCTION seed_standard_chart_of_accounts(
  p_tenant_id UUID,
  p_jurisdiction_code TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_currency_code TEXT;
BEGIN
  v_currency_code := CASE COALESCE(UPPER(p_jurisdiction_code), 'SA')
    WHEN 'AE' THEN 'AED'
    WHEN 'QA' THEN 'QAR'
    ELSE 'SAR'
  END;

  -- Asset accounts
  INSERT INTO chart_of_accounts (tenant_id, code, name_en, name_ar, type, currency_code, is_active)
  SELECT p_tenant_id, '110001', 'Cash in Bank', 'النقدية في البنك', 'asset', v_currency_code, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = '110001');

  INSERT INTO chart_of_accounts (tenant_id, code, name_en, name_ar, type, currency_code, is_active)
  SELECT p_tenant_id, '120001', 'Accounts Receivable - Tuition', 'مدينون - الرسوم الدراسية', 'asset', v_currency_code, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = '120001');

  -- Liability accounts
  INSERT INTO chart_of_accounts (tenant_id, code, name_en, name_ar, type, currency_code, is_active)
  SELECT p_tenant_id, '210001', 'Accounts Payable', 'دائنون - الموردين', 'liability', v_currency_code, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = '210001');

  INSERT INTO chart_of_accounts (tenant_id, code, name_en, name_ar, type, currency_code, is_active)
  SELECT p_tenant_id, '230001', 'Deferred Revenue', 'إيرادات مقدمة', 'liability', v_currency_code, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = '230001');

  INSERT INTO chart_of_accounts (tenant_id, code, name_en, name_ar, type, currency_code, is_active)
  SELECT p_tenant_id, '240001', 'VAT Payable', 'ضريبة القيمة المضافة مستحقة', 'liability', v_currency_code, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = '240001');

  -- Revenue accounts
  INSERT INTO chart_of_accounts (tenant_id, code, name_en, name_ar, type, currency_code, is_active)
  SELECT p_tenant_id, '410001', 'Revenue - Tuition Fees', 'إيرادات الرسوم الدراسية', 'revenue', v_currency_code, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = '410001');
END;
$$;

-- Backfill existing tenants.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, jurisdiction_code FROM tenants LOOP
    PERFORM seed_standard_chart_of_accounts(r.id, r.jurisdiction_code);
  END LOOP;
END $$;

-- ── Ledger branch dimension (add columns if the 20260701 migration is not applied) ─

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_branch ON journal_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_branch ON journal_entry_lines(branch_id);

-- ── Chart-of-accounts validation helper ───────────────────────────────────────

CREATE OR REPLACE FUNCTION _validate_chart_of_accounts(
  p_tenant_id UUID,
  p_required_codes JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_code TEXT;
  v_account_id UUID;
  v_resolved JSONB := '{}';
BEGIN
  FOR v_role, v_code IN SELECT * FROM jsonb_each_text(p_required_codes)
  LOOP
    IF v_code IS NULL OR v_code = '' THEN
      RAISE EXCEPTION 'chart_of_accounts_incomplete';
    END IF;

    SELECT id INTO v_account_id
    FROM chart_of_accounts
    WHERE tenant_id = p_tenant_id
      AND code = v_code
      AND is_active = TRUE
    LIMIT 1;

    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'chart_of_accounts_incomplete';
    END IF;

    v_resolved := v_resolved || jsonb_build_object(v_role, v_account_id);
  END LOOP;

  RETURN v_resolved;
END;
$$;

-- ── post_journal now raises on missing accounts ───────────────────────────────

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
      RAISE EXCEPTION 'chart_of_accounts_incomplete';
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

-- ── Composite type for invoice inserts (excludes generated balance column) ─────

DROP TYPE IF EXISTS invoice_insert_payload CASCADE;

CREATE TYPE invoice_insert_payload AS (
  id UUID,
  tenant_id UUID,
  student_id UUID,
  invoice_number TEXT,
  date DATE,
  due_date DATE,
  total_amount NUMERIC,
  paid_amount NUMERIC,
  status TEXT,
  items JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  academic_year TEXT,
  subtotal NUMERIC,
  discount_amount NUMERIC,
  vat_amount NUMERIC,
  notes_ar TEXT,
  notes_en TEXT,
  qr_code TEXT,
  invoice_hash TEXT,
  invoice_type TEXT,
  original_invoice_id UUID,
  sadad_bill_number TEXT,
  issue_date DATE,
  student_name TEXT,
  grade TEXT,
  discount_reason TEXT,
  branch_id UUID,
  preferred_payment_method TEXT,
  bank_account_id UUID,
  bank_account_details JSONB,
  journal_entry_id UUID,
  guardian_id UUID,
  batch_id UUID,
  batch_number TEXT,
  document_type TEXT,
  parent_document_id UUID,
  zatca_uuid TEXT,
  icv INT,
  original_invoice_number TEXT,
  previous_invoice_hash TEXT,
  ubl_xml TEXT,
  zatca_status TEXT,
  zatca_response JSONB,
  buyer_vat_number TEXT,
  buyer_address TEXT,
  buyer_name TEXT,
  supply_date DATE,
  vat_summary JSONB,
  void_reason TEXT,
  viewed_at TIMESTAMPTZ,
  view_count INT,
  version INT,
  recurring_schedule_id UUID,
  zatca_invoice_type TEXT,
  terms_and_conditions TEXT,
  payment_methods JSONB,
  currency_code TEXT
);

-- ── Atomic single-invoice creation with GL journal ────────────────────────────

CREATE OR REPLACE FUNCTION create_invoice_with_journal(
  p_tenant_id         UUID,
  p_created_by        UUID,
  p_branch_id         UUID,
  p_invoice           JSONB,
  p_ledger_codes      JSONB,
  p_discounts         JSONB DEFAULT '[]'::JSONB,
  p_zatca             JSONB DEFAULT NULL,
  p_payment_plan      JSONB DEFAULT NULL,
  p_installments      JSONB DEFAULT '[]'::JSONB,
  p_journal_description TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_tax_invoice BOOLEAN;
  v_required_codes JSONB := '{"ar": null, "revenue": null}'::JSONB;
  v_resolved JSONB;
  v_ar_id UUID;
  v_revenue_id UUID;
  v_vat_id UUID;
  v_invoice_data JSONB;
  v_invoice_row invoices%ROWTYPE;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_year INT;
  v_prefix TEXT;
  v_latest TEXT;
  v_seq INT;
  v_total NUMERIC(15,2);
  v_subtotal NUMERIC(15,2);
  v_vat NUMERIC(15,2);
  v_discount NUMERIC(15,2);
  v_revenue NUMERIC(15,2);
  v_journal_id UUID;
  v_plan_id UUID;
  v_inst JSONB;
  v_zatca_prev_hash TEXT;
  v_zatca_id UUID;
  v_zatca_icv INT;
  v_lock_id BIGINT;
  v_chain_count INT;
  v_chain_id UUID;
BEGIN
  -- 1. Determine whether this is a formal tax invoice (quotation/proforma/receipt do not post).
  v_is_tax_invoice := COALESCE(p_invoice->>'document_type', 'invoice') NOT IN ('quotation', 'proforma', 'receipt');

  -- 2. Validate required chart-of-accounts codes BEFORE any write.
  v_required_codes := jsonb_build_object('ar', p_ledger_codes->>'ar', 'revenue', p_ledger_codes->>'revenue');
  IF v_is_tax_invoice AND COALESCE((p_invoice->>'vat_amount')::NUMERIC, 0) > 0 THEN
    v_required_codes := v_required_codes || jsonb_build_object('vat_payable', p_ledger_codes->>'vat_payable');
  END IF;

  v_resolved := _validate_chart_of_accounts(p_tenant_id, v_required_codes);
  v_ar_id := (v_resolved->>'ar')::UUID;
  v_revenue_id := (v_resolved->>'revenue')::UUID;
  IF v_resolved ? 'vat_payable' THEN
    v_vat_id := (v_resolved->>'vat_payable')::UUID;
  END IF;

  -- 3. Use caller-supplied invoice number if available; otherwise generate one atomically.
  v_invoice_number := NULLIF(p_invoice->>'invoice_number', '');
  IF v_invoice_number IS NULL THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    v_prefix := 'INV-' || v_year || '-';
    SELECT invoice_number INTO v_latest
    FROM invoices
    WHERE tenant_id = p_tenant_id AND invoice_number ILIKE v_prefix || '%'
    ORDER BY invoice_number DESC
    LIMIT 1
    FOR UPDATE;

    v_seq := 1;
    IF v_latest IS NOT NULL THEN
      v_seq := COALESCE((SUBSTRING(v_latest FROM '\d{4}-(\d{6})$'))::INT, 0) + 1;
    END IF;
    v_invoice_number := v_prefix || LPAD(v_seq::TEXT, 6, '0');
  END IF;

  -- 4. Lock/verify the ZATCA chain when e-invoicing is enabled.
  IF p_zatca IS NOT NULL THEN
    v_zatca_prev_hash := p_invoice->>'previous_invoice_hash';
    v_zatca_icv := COALESCE((p_invoice->>'icv')::INT, 1);

    IF v_zatca_prev_hash IS NULL OR v_zatca_prev_hash = '' OR v_zatca_prev_hash = repeat('0', 64) THEN
      -- First invoice for this tenant: serialize with an advisory transaction lock.
      v_lock_id := ('x' || substr(md5(p_tenant_id::TEXT), 1, 16))::bit(64)::BIGINT;
      PERFORM pg_advisory_xact_lock(v_lock_id);

      v_chain_count := (SELECT COUNT(*) FROM zatca_submissions WHERE tenant_id = p_tenant_id AND invoice_hash IS NOT NULL);
      IF v_chain_count > 0 OR v_zatca_icv <> 1 THEN
        RAISE EXCEPTION 'zatca_chain_fork';
      END IF;
    ELSE
      SELECT id INTO v_chain_id
      FROM zatca_submissions
      WHERE tenant_id = p_tenant_id
        AND invoice_hash = v_zatca_prev_hash
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE;

      IF v_chain_id IS NULL THEN
        RAISE EXCEPTION 'zatca_chain_fork';
      END IF;

      v_chain_count := (SELECT COUNT(*) FROM zatca_submissions WHERE tenant_id = p_tenant_id AND invoice_hash IS NOT NULL);
      IF v_zatca_icv <> v_chain_count + 1 THEN
        RAISE EXCEPTION 'zatca_chain_fork';
      END IF;
    END IF;
  END IF;

  -- 5. Materialise the invoice row, stamping the generated number and UUID.
  v_invoice_data := p_invoice
    || jsonb_build_object(
         'id', gen_random_uuid(),
         'tenant_id', p_tenant_id,
         'branch_id', p_branch_id,
         'invoice_number', v_invoice_number,
         'created_at', NOW(),
         'updated_at', NOW(),
         'view_count', 0,
         'version', 1,
         'paid_amount', COALESCE((p_invoice->>'paid_amount')::NUMERIC, 0)
       );

  INSERT INTO invoices
  SELECT * FROM jsonb_populate_record(null::invoice_insert_payload, v_invoice_data)
  RETURNING *
  INTO v_invoice_row;

  v_invoice_id := v_invoice_row.id;
  v_total := v_invoice_row.total_amount;
  v_subtotal := v_invoice_row.subtotal;
  v_vat := v_invoice_row.vat_amount;
  v_discount := v_invoice_row.discount_amount;
  v_invoice_number := v_invoice_row.invoice_number;

  -- 6. Record applied discounts.
  IF jsonb_array_length(p_discounts) > 0 THEN
    FOR v_inst IN SELECT * FROM jsonb_array_elements(p_discounts)
    LOOP
      INSERT INTO invoice_discounts (
        tenant_id, invoice_id, currency_code, discount_rule_id, discount_code,
        description_ar, description_en, amount
      ) VALUES (
        p_tenant_id,
        v_invoice_id,
        v_invoice_row.currency_code,
        NULLIF((v_inst->>'discount_rule_id')::UUID, '00000000-0000-0000-0000-000000000000'),
        v_inst->>'discount_code',
        v_inst->>'description_ar',
        v_inst->>'description_en',
        COALESCE((v_inst->>'amount')::NUMERIC, 0)
      );
    END LOOP;
  END IF;

  -- 7. Record ZATCA submission.
  IF p_zatca IS NOT NULL THEN
    INSERT INTO zatca_submissions (
      tenant_id, invoice_id, invoice_number, submission_type, invoice_hash,
      previous_hash, ubl_xml, qr_code, zatca_status, zatca_uuid
    ) VALUES (
      p_tenant_id,
      v_invoice_id,
      v_invoice_number,
      p_zatca->>'submission_type',
      p_zatca->>'invoice_hash',
      p_zatca->>'previous_hash',
      p_zatca->>'ubl_xml',
      p_zatca->>'qr_code',
      COALESCE(p_zatca->>'zatca_status', 'pending'),
      NULLIF(p_zatca->>'zatca_uuid', '')
    )
    RETURNING id INTO v_zatca_id;
  END IF;

  -- 8. Record payment plan + installments.
  IF p_payment_plan IS NOT NULL THEN
    INSERT INTO payment_plans (
      tenant_id, student_id, academic_year, plan_type, total_amount, paid_amount,
      status, notes, created_by, source_invoice_id, currency_code,
      down_payment_pct
    ) VALUES (
      p_tenant_id,
      NULLIF((p_payment_plan->>'student_id')::UUID, '00000000-0000-0000-0000-000000000000'),
      p_payment_plan->>'academic_year',
      COALESCE(p_payment_plan->>'plan_type', 'term'),
      COALESCE((p_payment_plan->>'total_amount')::NUMERIC, v_total),
      0,
      COALESCE(p_payment_plan->>'status', 'active'),
      p_payment_plan->>'notes',
      p_created_by,
      v_invoice_id,
      v_invoice_row.currency_code,
      COALESCE((p_payment_plan->>'down_payment_pct')::NUMERIC, 0)
    )
    RETURNING id INTO v_plan_id;

    IF jsonb_array_length(p_installments) > 0 THEN
      FOR v_inst IN SELECT * FROM jsonb_array_elements(p_installments)
      LOOP
        INSERT INTO payment_plan_installments (
          tenant_id, plan_id, installment_no, due_date, amount, paid_amount,
          status, invoice_id, currency_code
        ) VALUES (
          p_tenant_id,
          v_plan_id,
          COALESCE((v_inst->>'installment_no')::INT, 1),
          COALESCE((v_inst->>'due_date')::DATE, CURRENT_DATE),
          COALESCE((v_inst->>'amount')::NUMERIC, 0),
          0,
          COALESCE(v_inst->>'status', 'pending'),
          v_invoice_id,
          v_invoice_row.currency_code
        );
      END LOOP;
    END IF;
  END IF;

  -- 9. Post the GL journal for formal invoices.
  IF v_is_tax_invoice THEN
    v_revenue := ROUND(v_total - COALESCE(v_vat, 0), 2);

    INSERT INTO journal_entries
      (tenant_id, branch_id, date, reference, description, total_debit, total_credit, status, created_by, currency_code)
    VALUES
      (p_tenant_id, p_branch_id, CURRENT_DATE, v_invoice_number, COALESCE(p_journal_description, 'Invoice ' || v_invoice_number), v_total, v_total, 'posted', p_created_by, v_invoice_row.currency_code)
    RETURNING id INTO v_journal_id;

    INSERT INTO journal_entry_lines
      (tenant_id, branch_id, journal_entry_id, account_id, debit, credit, description, currency_code)
    VALUES
      (p_tenant_id, p_branch_id, v_journal_id, v_ar_id, v_total, 0, 'A/R — ' || v_invoice_number, v_invoice_row.currency_code),
      (p_tenant_id, p_branch_id, v_journal_id, v_revenue_id, 0, v_revenue, 'Revenue — ' || v_invoice_number, v_invoice_row.currency_code);

    IF COALESCE(v_vat, 0) > 0 AND v_vat_id IS NOT NULL THEN
      INSERT INTO journal_entry_lines
        (tenant_id, branch_id, journal_entry_id, account_id, debit, credit, description, currency_code)
      VALUES
        (p_tenant_id, p_branch_id, v_journal_id, v_vat_id, 0, v_vat, 'VAT Payable — ' || v_invoice_number, v_invoice_row.currency_code);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'invoice', to_jsonb(v_invoice_row),
    'journal_entry_id', v_journal_id,
    'zatca_id', v_zatca_id,
    'payment_plan_id', v_plan_id
  );
END;
$$;

REVOKE ALL ON FUNCTION seed_standard_chart_of_accounts(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION seed_standard_chart_of_accounts(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION seed_standard_chart_of_accounts(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION seed_standard_chart_of_accounts(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION _validate_chart_of_accounts(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION _validate_chart_of_accounts(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION _validate_chart_of_accounts(UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION _validate_chart_of_accounts(UUID, JSONB) TO service_role;

REVOKE ALL ON FUNCTION create_invoice_with_journal(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_invoice_with_journal(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, TEXT) FROM anon;
REVOKE ALL ON FUNCTION create_invoice_with_journal(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION create_invoice_with_journal(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, TEXT) TO service_role;
