-- Cashier identity on canteen POS sales / top-ups.
-- Idempotent.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

ALTER TABLE public.canteen_transactions
  ADD COLUMN IF NOT EXISTS processed_by TEXT;

NOTIFY pgrst, 'reload schema';
