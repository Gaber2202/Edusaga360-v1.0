-- Ensure zatca_invoice_type column exists for legacy / alias callers.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS zatca_invoice_type TEXT NOT NULL DEFAULT 'simplified';
