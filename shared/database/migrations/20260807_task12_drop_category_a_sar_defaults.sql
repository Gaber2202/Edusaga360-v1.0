-- Task 12 — Drop the SAR DEFAULT from Category A tables
-- Every insert path now supplies currency_code from resolvePack(ctx). Removing the
-- default prevents the backend from silently stamping Saudi Riyals on UAE/Qatar rows.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices',
    'payments',
    'invoice_batches',
    'invoice_discounts',
    'payment_plans',
    'payment_plan_installments',
    'installment_plan_offers',
    'collection_profiles',
    'collection_messages',
    'guarantee_baselines',
    'guarantee_measurements',
    'guarantee_exclusions',
    'special_care_fees'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN currency_code DROP DEFAULT;',
      t
    );
  END LOOP;
END $$;

COMMIT;
