-- Employee HR documents / contracts archive (HRContracts, Qiwa, recruitment, Yamen drafts).
-- Additive & idempotent.

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id             UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  employee_id           UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name         TEXT,
  document_type         TEXT NOT NULL DEFAULT 'other',
  document_name         TEXT,
  document_url          TEXT,
  file_path             TEXT,
  version               TEXT DEFAULT '1.0',
  issue_date            DATE,
  expiry_date           DATE,
  requires_signature    BOOLEAN DEFAULT FALSE,
  status                TEXT DEFAULT 'draft',
  notes                 TEXT,
  sent_date             DATE,
  signed_date           TIMESTAMPTZ,
  signed_by             TEXT,
  contract_data         JSONB DEFAULT '{}'::jsonb,
  qiwa_status           TEXT DEFAULT 'draft',
  qiwa_reference_id     TEXT,
  qiwa_submitted_date   TIMESTAMPTZ,
  qiwa_updated_date     TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'employee_documents', 'employee_documents'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_employee_documents_tenant
  ON public.employee_documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee
  ON public.employee_documents (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_type
  ON public.employee_documents (tenant_id, document_type);
CREATE INDEX IF NOT EXISTS idx_employee_documents_status
  ON public.employee_documents (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_documents_expiry
  ON public.employee_documents (tenant_id, expiry_date)
  WHERE expiry_date IS NOT NULL;

-- Link employee_contracts to archive docs + branch for ESS / HR parity
ALTER TABLE public.employee_contracts
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_id UUID,
  ADD COLUMN IF NOT EXISTS contract_number TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
