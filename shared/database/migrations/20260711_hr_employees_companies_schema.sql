-- HR schema reconciliation — Additive Only
-- The frontend HR module (employee form/list, applicant→employee conversion,
-- ESS, transfers, payroll bank exports) reads/writes many `employees` columns
-- and a `companys` table that never existed in the deployed schema. This made
-- the Employees list query 400 and every "add employee" insert fail.
--
-- This migration is strictly additive: it adds the missing columns/table so the
-- existing frontend works end-to-end. It does not drop or rename anything, so
-- existing columns (employee_number, join_date, basic_salary, bank_iban) remain.

-- ---------------------------------------------------------------------------
-- 1. employees — add columns the frontend depends on
-- ---------------------------------------------------------------------------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_id            TEXT,
  ADD COLUMN IF NOT EXISTS job_title              TEXT,
  ADD COLUMN IF NOT EXISTS personal_email         TEXT,
  ADD COLUMN IF NOT EXISTS employing_company_id   UUID,
  ADD COLUMN IF NOT EXISTS visa_company_id        UUID,
  ADD COLUMN IF NOT EXISTS visa_type              TEXT,
  ADD COLUMN IF NOT EXISTS manager_id             UUID,
  ADD COLUMN IF NOT EXISTS hire_date              DATE,
  ADD COLUMN IF NOT EXISTS end_date               DATE,
  ADD COLUMN IF NOT EXISTS probation_end_date     DATE,
  ADD COLUMN IF NOT EXISTS contract_type          TEXT,
  ADD COLUMN IF NOT EXISTS work_schedule          TEXT,
  ADD COLUMN IF NOT EXISTS salary                 NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS total_salary           NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS bank_account           TEXT,
  ADD COLUMN IF NOT EXISTS iban                   TEXT,
  ADD COLUMN IF NOT EXISTS bank_details           JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS compensation           JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recruitment_history    JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS notes                  TEXT,
  ADD COLUMN IF NOT EXISTS license_expiry_date    DATE,
  ADD COLUMN IF NOT EXISTS is_saudi               BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_gosi_applicable     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS passport_expiry        DATE,
  ADD COLUMN IF NOT EXISTS visa_expiry            DATE;

-- Backfill the new frontend-facing columns from the original schema columns so
-- any pre-existing employee rows remain consistent.
UPDATE employees
   SET employee_id = COALESCE(employee_id, employee_number),
       hire_date   = COALESCE(hire_date, join_date),
       salary      = COALESCE(salary, basic_salary),
       iban        = COALESCE(iban, bank_iban)
 WHERE employee_id IS NULL
    OR hire_date  IS NULL
    OR salary     IS NULL
    OR iban       IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees (tenant_id, employee_id);

-- ---------------------------------------------------------------------------
-- 2. companys — employing / visa sponsor entities (name matches frontend)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_code      TEXT,
  name_ar           TEXT,
  name_en           TEXT,
  legal_name        TEXT,
  cr_number         TEXT,
  vat_number        TEXT,
  address_ar        TEXT,
  address_en        TEXT,
  city              TEXT,
  phone             TEXT,
  email             TEXT,
  company_type      TEXT DEFAULT 'parent',
  parent_company_id UUID,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companys_tenant ON companys (tenant_id);

ALTER TABLE companys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'companys', 'companys');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
