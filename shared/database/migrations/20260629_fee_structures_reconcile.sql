-- ============================================================================
-- 20260629_fee_structures_reconcile.sql
--
-- Closes finding 1A-01: the fee_structures schema conflict.
--
-- Background
-- ----------
-- fee_structures was created twice with incompatible shapes:
--   * schema.sql (Base44 export): academic_year UUID FK, name NOT NULL,
--     grade_id, total_amount, installment_plan
--   * 20260608_billing_engine.sql: academic_year TEXT, category_id, grade TEXT,
--     amount, installment_count, notes_* — guarded by CREATE TABLE IF NOT EXISTS,
--     so it was SILENTLY SKIPPED because the table already existed.
-- A later cleanup ALTER-added some billing columns, leaving a hybrid table that
-- matched NEITHER the billing engine (backend/src/routes/billing.ts) NOR the
-- fee-config UI (frontend TuitionFeesConfiguration / StudentFeesSection /
-- Contracts). Concretely this broke: inserts (name was NOT NULL but never
-- supplied; created_by/campus_id/program/installment_count columns missing) and
-- reads (queries filter on academic_year_id / section_id, which didn't exist →
-- PostgREST 400).
--
-- Strategy (Option A1 — superset): make fee_structures the union of columns both
-- the billing engine and the config UI use, so both work. The table is empty
-- (verified 0 rows), so type changes are safe and lossless.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. academic_year was a uuid FK, but billing.ts and the config UI use it as a
--    TEXT label (e.g. '2025-2026'). Switch to text; keep the relational link as
--    a separate academic_year_id (added below), which the readers filter on.
ALTER TABLE fee_structures DROP CONSTRAINT IF EXISTS fee_structures_academic_year_fkey;
ALTER TABLE fee_structures ALTER COLUMN academic_year TYPE text USING academic_year::text;

-- 2. name was NOT NULL but neither the config UI nor the billing API supplies it
--    (the fee label is carried by fee_type_name_* / category). Make it optional.
ALTER TABLE fee_structures ALTER COLUMN name DROP NOT NULL;

-- 3. Add the union of columns the code references.
--    Relational links (FKs verified to exist): academic_years, sections, fee_types.
ALTER TABLE fee_structures
  ADD COLUMN IF NOT EXISTS academic_year_id  uuid REFERENCES academic_years(id),
  ADD COLUMN IF NOT EXISTS section_id        uuid REFERENCES sections(id),
  ADD COLUMN IF NOT EXISTS fee_type_id       uuid REFERENCES fee_types(id),
  ADD COLUMN IF NOT EXISTS fee_type_code     text,
  ADD COLUMN IF NOT EXISTS fee_type_name_ar  text,
  ADD COLUMN IF NOT EXISTS fee_type_name_en  text,
  ADD COLUMN IF NOT EXISTS description_ar    text,
  ADD COLUMN IF NOT EXISTS description_en    text,
  ADD COLUMN IF NOT EXISTS display_in_intake boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fee_code          text,
  ADD COLUMN IF NOT EXISTS created_by        text,           -- email (UI) or user id (API)
  ADD COLUMN IF NOT EXISTS last_modified_by  text,
  ADD COLUMN IF NOT EXISTS campus_id         uuid,           -- billing engine (no campuses table)
  ADD COLUMN IF NOT EXISTS program           text,
  ADD COLUMN IF NOT EXISTS installment_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effective_from    date,
  ADD COLUMN IF NOT EXISTS effective_to      date,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now();

-- 4. Indexes for the live lookups (year+grade by id; academic_year text label).
CREATE INDEX IF NOT EXISTS idx_fee_structures_year_grade
  ON fee_structures (tenant_id, academic_year_id, grade_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_academic_year
  ON fee_structures (tenant_id, academic_year);

-- ----------------------------------------------------------------------------
-- 5. special_care_fees — referenced by TuitionFeesConfiguration + ParentIntake
--    but never created in the live DB (same drift class). Create it with the
--    columns the config form writes, and the standard tenant RLS policies.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS special_care_fees (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  academic_year        text,
  grade                text,
  branch_id            uuid REFERENCES branches(id),
  fee_calculation_type text NOT NULL DEFAULT 'fixed',   -- 'fixed' | 'percentage'
  fixed_amount         numeric(12,2),
  percentage           numeric(5,2),
  description_ar       text,
  description_en       text,
  is_active            boolean NOT NULL DEFAULT true,
  created_by           text,
  last_modified_by     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_special_care_fees_tenant ON special_care_fees (tenant_id);

ALTER TABLE special_care_fees ENABLE ROW LEVEL SECURITY;

-- Mirror the app's tenant-isolation convention (see fee_structures policies).
DROP POLICY IF EXISTS special_care_fees_tenant_iso ON special_care_fees;
CREATE POLICY special_care_fees_tenant_iso ON special_care_fees
  FOR ALL
  USING ((tenant_id)::text = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')))
  WITH CHECK ((tenant_id)::text = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')));

DROP POLICY IF EXISTS special_care_fees_platform_owner ON special_care_fees;
CREATE POLICY special_care_fees_platform_owner ON special_care_fees
  FOR ALL
  USING ((SELECT (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner'))::boolean = true)
  WITH CHECK ((SELECT (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner'))::boolean = true);
