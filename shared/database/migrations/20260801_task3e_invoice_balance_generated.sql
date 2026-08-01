-- Generated column: invoices.balance is derived from total_amount and paid_amount.
-- This ensures every payment path (Moyasar, cheque, cash, manual, refund, reversal,
-- bulk import) always stores a correct balance without each caller recomputing it.
--
-- Rollback:
-- BEGIN;
-- ALTER TABLE invoices DROP COLUMN IF EXISTS balance;
-- ALTER TABLE invoices ADD COLUMN balance NUMERIC(15,2) DEFAULT 0;
-- COMMIT;

SET lock_timeout = '5s';
SET statement_timeout = '120s';

BEGIN;

ALTER TABLE invoices
  DROP COLUMN IF EXISTS balance;

ALTER TABLE invoices
  ADD COLUMN balance NUMERIC(15,2) GENERATED ALWAYS AS (
    CASE
      WHEN total_amount < 0 THEN total_amount - COALESCE(paid_amount, 0)
      ELSE GREATEST(total_amount - COALESCE(paid_amount, 0), 0)
    END
  ) STORED;

COMMENT ON COLUMN invoices.balance IS
  'Outstanding balance, computed as total_amount - paid_amount. Non-negative for regular invoices; negative for credit notes. Generated so no payment method can forget to update it.';

COMMIT;
