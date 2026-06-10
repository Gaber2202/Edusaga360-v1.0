-- =============================================================================
-- INVOICES EXTENDED COLUMNS
-- The base schema has a minimal invoices table. The billing engine adds related
-- tables but doesn't extend the invoices table itself. This migration adds all
-- columns that InvoiceForm.jsx and BulkInvoiceGeneration.jsx expect to insert.
-- =============================================================================

-- Make `date` optional (the app uses issue_date; date is legacy)
ALTER TABLE invoices ALTER COLUMN date DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN date SET DEFAULT CURRENT_DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='issue_date' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN issue_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='student_name' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN student_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='grade' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN grade TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='academic_year' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN academic_year TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='subtotal' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN subtotal NUMERIC(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='vat_amount' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN vat_amount NUMERIC(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='discount_amount' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN discount_amount NUMERIC(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='discount_reason' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN discount_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='balance' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN balance NUMERIC(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='branch_id' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN branch_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='preferred_payment_method' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN preferred_payment_method TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='bank_account_id' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN bank_account_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='bank_account_details' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN bank_account_details JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='journal_entry_id' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN journal_entry_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='guardian_id' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN guardian_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='batch_id' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN batch_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='batch_number' AND table_schema='public') THEN
    ALTER TABLE invoices ADD COLUMN batch_number TEXT;
  END IF;
END $$;

-- Backfill issue_date from date for any existing rows
UPDATE invoices SET issue_date = date WHERE issue_date IS NULL AND date IS NOT NULL;

-- Backfill balance for existing rows that have total_amount but no balance
UPDATE invoices SET balance = total_amount - COALESCE(paid_amount, 0) WHERE balance = 0 OR balance IS NULL;

-- ---------------------------------------------------------------------------
-- invoice_batches — needed by BulkInvoiceGeneration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_batches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_number    TEXT NOT NULL,
  batch_name      TEXT,
  created_by      TEXT,
  created_by_email TEXT,
  created_date    TIMESTAMPTZ DEFAULT NOW(),
  criteria        JSONB DEFAULT '{}',
  student_count   INTEGER DEFAULT 0,
  excluded_students JSONB DEFAULT '[]',
  invoice_count   INTEGER DEFAULT 0,
  total_amount    NUMERIC(15,2) DEFAULT 0,
  total_vat       NUMERIC(15,2) DEFAULT 0,
  total_discount  NUMERIC(15,2) DEFAULT 0,
  net_total       NUMERIC(15,2) DEFAULT 0,
  status          TEXT DEFAULT 'generated',
  posted_mode     TEXT DEFAULT 'draft',
  branch_id       UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoice_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_batches_tenant ON invoice_batches
  USING ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id);

CREATE INDEX IF NOT EXISTS idx_invoice_batches_tenant ON invoice_batches (tenant_id, created_at DESC);
