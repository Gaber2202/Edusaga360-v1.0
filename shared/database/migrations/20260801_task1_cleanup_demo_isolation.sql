-- Task 1 — Production cleanup and demo data isolation
-- Phase A, Task 1 of 14
--
-- Changes:
--   1. Drop leftover test table `_devin_test_large`.
--   2. Add `tenants.is_demo boolean NOT NULL DEFAULT false`.
--   3. Reset `branches.jurisdiction_code` to NULL so branches inherit from tenants.
--
-- Rollback:
--   ALTER TABLE tenants DROP COLUMN IF EXISTS is_demo;
--   For branches, capture prior jurisdiction_code values BEFORE the UPDATE in a
--   snapshot, then restore from that snapshot. Do not stamp a blanket 'SA'
--   onto rows that may legitimately inherit NULL from the tenant.
--   _devin_test_large cannot be un-dropped; re-create from scratch if required.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

BEGIN;

DROP TABLE IF EXISTS _devin_test_large;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

UPDATE branches
  SET jurisdiction_code = NULL;

COMMIT;
