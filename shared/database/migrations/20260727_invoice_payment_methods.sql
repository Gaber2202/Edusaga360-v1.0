-- Store the payment methods enabled for an invoice (e.g. mada, visa, applepay, stcpay, samsungpay).
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Index for common "does this invoice accept method X" lookups.
CREATE INDEX IF NOT EXISTS idx_invoices_payment_methods_gin
  ON invoices USING GIN (payment_methods jsonb_path_ops);
