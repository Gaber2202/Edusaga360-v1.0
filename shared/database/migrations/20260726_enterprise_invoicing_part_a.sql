-- ============================================================================
-- 20260726_enterprise_invoicing_part_a.sql
--
-- Part A of the Enterprise-Grade Invoicing Engine work order:
--   - Tenant compliance settings (ZATCA seller block)
--   - Invoice document-type / buyer / ZATCA metadata columns
--   - Fee-type VAT category mapping
--   - RLS and indexes
--
-- Idempotent and backward-compatible: every ADD COLUMN is guarded.
-- ============================================================================

-- ── 1. Tenant compliance settings (ZATCA seller block, CSID credentials) ──────

CREATE TABLE IF NOT EXISTS tenant_compliance_settings (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name_en              TEXT,
  legal_name_ar              TEXT NOT NULL,
  vat_trn                    TEXT, -- 15 digits, must start/end with 3
  cr_number                  TEXT,
  address_en                 TEXT,
  address_ar                 TEXT,
  city                       TEXT DEFAULT 'Riyadh',
  country_code               TEXT DEFAULT 'SA',
  country_subentity_code     TEXT DEFAULT 'SA-01',
  phone                      TEXT,
  email                      TEXT,
  logo_url                   TEXT,
  default_vat_rate           NUMERIC(5,4) NOT NULL DEFAULT 0.15,
  zatca_env                  TEXT NOT NULL DEFAULT 'sandbox', -- sandbox | production
  -- ZATCA CSID/private-key secrets are intentionally NOT stored here.
  -- They live in environment variables / Supabase Vault per environment.
  -- Only public seller data and the chosen environment are kept in this table.
  is_compliance_onboarded    BOOLEAN NOT NULL DEFAULT false,
  is_production_onboarded    BOOLEAN NOT NULL DEFAULT false,
  terms_and_conditions_ar    TEXT,
  terms_and_conditions_en    TEXT,
  bank_account_jsonb         JSONB, -- [{bank, iban, account}]
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_compliance_settings_tenant
  ON tenant_compliance_settings (tenant_id);

ALTER TABLE tenant_compliance_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'tenant_compliance_settings', 'tenant_compliance_settings'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Platform owner bypass for setup/support
DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY platform_owner_%s ON %I FOR ALL TO authenticated USING (((current_setting(''request.jwt.claims'', true)::json)->>''is_platform_owner'')::boolean = true) WITH CHECK (((current_setting(''request.jwt.claims'', true)::json)->>''is_platform_owner'')::boolean = true)',
    'tenant_compliance_settings', 'tenant_compliance_settings'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Extend invoices for document lifecycle + ZATCA metadata ───────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='document_type' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN document_type TEXT NOT NULL DEFAULT 'invoice';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='invoice_type' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'simplified';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='parent_document_id' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN parent_document_id UUID REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='zatca_uuid' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN zatca_uuid TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='icv' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN icv INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='qr_code' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN qr_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='original_invoice_number' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN original_invoice_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='invoice_hash' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN invoice_hash TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='previous_invoice_hash' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN previous_invoice_hash TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='ubl_xml' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN ubl_xml TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='zatca_status' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN zatca_status TEXT NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='zatca_response' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN zatca_response JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='buyer_vat_number' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN buyer_vat_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='buyer_address' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN buyer_address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='buyer_name' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN buyer_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='supply_date' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN supply_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='vat_summary' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN vat_summary JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='void_reason' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN void_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='viewed_at' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN viewed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='view_count' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN view_count INT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='version' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN version INT NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_invoices_document_type ON invoices (tenant_id, document_type);
CREATE INDEX IF NOT EXISTS idx_invoices_parent ON invoices (tenant_id, parent_document_id);
CREATE INDEX IF NOT EXISTS idx_invoices_zatca_status ON invoices (tenant_id, zatca_status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_hash ON invoices (tenant_id, invoice_hash);

-- ── 3. Fee-type VAT category mapping ─────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fee_types' AND column_name='vat_category' AND table_schema='public') THEN
    ALTER TABLE fee_types ADD COLUMN vat_category TEXT NOT NULL DEFAULT 'standard';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fee_types' AND column_name='zatca_category_code' AND table_schema='public') THEN
    ALTER TABLE fee_types ADD COLUMN zatca_category_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fee_types' AND column_name='is_zatca_exempt' AND table_schema='public') THEN
    ALTER TABLE fee_types ADD COLUMN is_zatca_exempt BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- ZATCA category code seed (ZATCA VAT category codes)
-- S = Standard rate, Z = Zero rate, E = Exempt, O = Out of scope
UPDATE fee_types SET zatca_category_code = CASE
  WHEN vat_category = 'standard' THEN 'S'
  WHEN vat_category = 'zero_rated' THEN 'Z'
  WHEN vat_category = 'exempt' THEN 'E'
  WHEN vat_category = 'out_of_scope' THEN 'O'
  ELSE zatca_category_code
END WHERE zatca_category_code IS NULL OR zatca_category_code = '';

-- ============================================================================
-- Done
-- ============================================================================
