-- Add reference_id to communications for linking back to invoice/payslip/etc.
ALTER TABLE communications ADD COLUMN IF NOT EXISTS reference_id TEXT;
CREATE INDEX IF NOT EXISTS idx_communications_tenant_type ON communications(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_communications_reference ON communications(tenant_id, reference_id);
