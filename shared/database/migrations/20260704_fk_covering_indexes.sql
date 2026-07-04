-- RLSPERF-02 — covering indexes for unindexed foreign keys (Day-2 DB perf).
--
-- The live performance advisor flagged 10 foreign keys with no covering index.
-- Unindexed FK columns force sequential scans on joins and, critically, on
-- cascade checks when a parent row is updated/deleted (e.g. deleting an invoice
-- scans all of invoice_discounts / dunning_log). At Saudi-school scale — the
-- 8 AM billing run and fee-collection windows — these are real latency sources.
--
-- All statements are additive + idempotent. Index names follow the repo's
-- existing `idx_fk_<table>_<column>` convention. Reversible: DROP INDEX by name.
--
-- NOTE for production rollout on already-large tables: these tables are small
-- today, so a plain CREATE INDEX is instant and non-blocking. If any of these
-- grows large before rollout, switch that statement to
-- `CREATE INDEX CONCURRENTLY` (run outside a transaction) to avoid a write lock.

CREATE INDEX IF NOT EXISTS idx_fk_cheque_status_history_cheque_id ON public.cheque_status_history (cheque_id);
CREATE INDEX IF NOT EXISTS idx_fk_dunning_log_invoice_id           ON public.dunning_log (invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_dunning_log_student_id           ON public.dunning_log (student_id);
CREATE INDEX IF NOT EXISTS idx_fk_fee_structures_academic_year_id  ON public.fee_structures (academic_year_id);
CREATE INDEX IF NOT EXISTS idx_fk_fee_structures_category_id       ON public.fee_structures (category_id);
CREATE INDEX IF NOT EXISTS idx_fk_fee_structures_fee_type_id       ON public.fee_structures (fee_type_id);
CREATE INDEX IF NOT EXISTS idx_fk_fee_structures_section_id        ON public.fee_structures (section_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoice_discounts_invoice_id     ON public.invoice_discounts (invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_payment_plans_student_id         ON public.payment_plans (student_id);
CREATE INDEX IF NOT EXISTS idx_fk_special_care_fees_branch_id      ON public.special_care_fees (branch_id);

-- Duplicate-index cleanup (advisor: duplicate_index). idx_fee_structures_academic_year
-- and idx_fee_structures_tenant_year are byte-for-byte identical — both
-- `btree (tenant_id, academic_year)`. Keep one, drop the redundant copy (this
-- removes only a redundant index; no data is affected).
--   Rollback: CREATE INDEX idx_fee_structures_academic_year
--             ON public.fee_structures USING btree (tenant_id, academic_year);
DROP INDEX IF EXISTS public.idx_fee_structures_academic_year;
