-- ============================================================================
-- 20260726_yamen_installments_additions.sql
--
-- Extra columns on installment_plan_offers needed by the YAMEN installment plan
-- offer lifecycle and broken-plan detection.
-- ============================================================================

ALTER TABLE installment_plan_offers
  ADD COLUMN IF NOT EXISTS installment_amounts JSONB,
  ADD COLUMN IF NOT EXISTS proposed_by TEXT NOT NULL DEFAULT 'yamen',
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- interval_days is a clearer alias for the recurring period; keep both names.
ALTER TABLE installment_plan_offers
  ADD COLUMN IF NOT EXISTS interval_days INT DEFAULT 30;

UPDATE installment_plan_offers
  SET interval_days = recurring_days
  WHERE interval_days IS NULL AND recurring_days IS NOT NULL;
