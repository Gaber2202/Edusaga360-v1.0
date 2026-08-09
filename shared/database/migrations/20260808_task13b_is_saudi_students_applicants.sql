-- Task 13b: add is_saudi to applicants only.
--
-- The application sets is_saudi through resolvePack(ctx) on write, using the
-- canonical classifier in packs/sa/nationality.ts. A Postgres trigger would be
-- a fourth copy of that classifier and is not added.
--
-- Students do NOT get an is_saudi column. BulkInvoiceGeneration previously used
-- student.is_saudi to filter by nationality_category (citizen / non_citizen).
-- That filter is replaced by a generic discount_group / fee_plan filter once
-- those fields are added to students or student_contracts; until then the
-- nationality-based fee filter has been removed from the UI. StudentForm does
-- not reference is_saudi and continues to store the free-text nationality.
--
-- Rollback:
--   ALTER TABLE applicants DROP COLUMN IF EXISTS is_saudi;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS is_saudi BOOLEAN;
