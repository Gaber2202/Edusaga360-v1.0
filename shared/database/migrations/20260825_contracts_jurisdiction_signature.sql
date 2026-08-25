-- P4-2 (SCRUM-116–119): Contracts jurisdiction, signature audit, delivery logs

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS jurisdiction_code TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'school',
  ADD COLUMN IF NOT EXISTS name_ar TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS template_type TEXT DEFAULT 'enrollment',
  ADD COLUMN IF NOT EXISTS template_code TEXT,
  ADD COLUMN IF NOT EXISTS content_ar TEXT,
  ADD COLUMN IF NOT EXISTS content_en TEXT,
  ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS placeholders JSONB DEFAULT '[]'::jsonb;

ALTER TABLE student_contracts
  ADD COLUMN IF NOT EXISTS signer_typed_name TEXT,
  ADD COLUMN IF NOT EXISTS signature_drawn_data TEXT,
  ADD COLUMN IF NOT EXISTS signed_user_id UUID,
  ADD COLUMN IF NOT EXISTS signed_ip TEXT,
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS application_id UUID,
  ADD COLUMN IF NOT EXISTS fee_structure_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tuition_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contract_number TEXT,
  ADD COLUMN IF NOT EXISTS guardian_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_phone TEXT,
  ADD COLUMN IF NOT EXISTS guardian_email TEXT,
  ADD COLUMN IF NOT EXISTS guardian_national_id TEXT,
  ADD COLUMN IF NOT EXISTS branch_id UUID,
  ADD COLUMN IF NOT EXISTS student_name TEXT,
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS academic_year TEXT,
  ADD COLUMN IF NOT EXISTS services JSONB,
  ADD COLUMN IF NOT EXISTS total_fees NUMERIC,
  ADD COLUMN IF NOT EXISTS total_discount NUMERIC,
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_schedule JSONB,
  ADD COLUMN IF NOT EXISTS generated_content_ar TEXT,
  ADD COLUMN IF NOT EXISTS generated_content_en TEXT,
  ADD COLUMN IF NOT EXISTS signed_by_guardian BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS signed_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_via JSONB,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT,
  ADD COLUMN IF NOT EXISTS sent_date TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS contract_delivery_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id     UUID REFERENCES student_contracts(id) ON DELETE SET NULL,
  contract_number TEXT,
  student_id      UUID,
  student_name    TEXT,
  guardian_email  TEXT,
  guardian_phone  TEXT,
  channel         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',
  error_message   TEXT,
  sent_by         TEXT,
  sent_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_jurisdiction
  ON contract_templates (tenant_id, jurisdiction_code);

CREATE INDEX IF NOT EXISTS idx_contract_delivery_logs_tenant
  ON contract_delivery_logs (tenant_id, created_at DESC);

ALTER TABLE contract_delivery_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS contract_delivery_logs_tenant_iso ON contract_delivery_logs;
  CREATE POLICY contract_delivery_logs_tenant_iso ON contract_delivery_logs FOR ALL
    USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
END $$;
