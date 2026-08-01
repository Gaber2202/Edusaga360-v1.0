-- Category B and C — rename existing currency columns and Saudi minor-unit column names.
--
-- Rollback:
--   ALTER TABLE fee_structures RENAME COLUMN currency_code TO currency;
--   ALTER TABLE cheques RENAME COLUMN currency_code TO currency;
--   ALTER TABLE collection_bank_transfer_items RENAME COLUMN currency_code TO currency;
--   ALTER TABLE recurring_invoice_schedules RENAME COLUMN currency_code TO currency;
--   ALTER TABLE moyasar_invoices RENAME COLUMN currency_code TO currency;
--   ALTER TABLE moyasar_invoices RENAME COLUMN amount_minor TO amount_halala;
--   ALTER TABLE moyasar_payments RENAME COLUMN currency_code TO currency;
--   ALTER TABLE moyasar_payments RENAME COLUMN amount_minor TO amount_halala;
--   ALTER TABLE moyasar_payments RENAME COLUMN fee_minor TO fee_halala;
--   ALTER TABLE moyasar_payments RENAME COLUMN refunded_minor TO refunded_halala;
--   ALTER TABLE moyasar_payments RENAME COLUMN captured_minor TO captured_halala;
--   ALTER TABLE moyasar_refund_queue DROP COLUMN IF EXISTS currency_code;
--   ALTER TABLE moyasar_refund_queue RENAME COLUMN amount_minor TO amount_halala;
--   -- Drop the FK constraints added by this migration.
--   ALTER TABLE fee_structures DROP CONSTRAINT IF EXISTS fee_structures_currency_fk;
--   ALTER TABLE cheques DROP CONSTRAINT IF EXISTS cheques_currency_fk;
--   ALTER TABLE collection_bank_transfer_items DROP CONSTRAINT IF EXISTS collection_bank_transfer_items_currency_fk;
--   ALTER TABLE recurring_invoice_schedules DROP CONSTRAINT IF EXISTS recurring_invoice_schedules_currency_fk;
--   ALTER TABLE moyasar_invoices DROP CONSTRAINT IF EXISTS moyasar_invoices_currency_fk;
--   ALTER TABLE moyasar_payments DROP CONSTRAINT IF EXISTS moyasar_payments_currency_fk;
--   ALTER TABLE moyasar_refund_queue DROP CONSTRAINT IF EXISTS moyasar_refund_queue_currency_fk;

SET lock_timeout = '5s';
SET statement_timeout = '120s';

BEGIN;

-- Category B: rename existing `currency` columns to `currency_code` and add FKs.
ALTER TABLE fee_structures RENAME COLUMN currency TO currency_code;
ALTER TABLE fee_structures ADD CONSTRAINT fee_structures_currency_fk FOREIGN KEY (currency_code) REFERENCES currencies(code);

ALTER TABLE cheques RENAME COLUMN currency TO currency_code;
ALTER TABLE cheques ADD CONSTRAINT cheques_currency_fk FOREIGN KEY (currency_code) REFERENCES currencies(code);

ALTER TABLE collection_bank_transfer_items RENAME COLUMN currency TO currency_code;
ALTER TABLE collection_bank_transfer_items ADD CONSTRAINT collection_bank_transfer_items_currency_fk FOREIGN KEY (currency_code) REFERENCES currencies(code);

ALTER TABLE recurring_invoice_schedules RENAME COLUMN currency TO currency_code;
ALTER TABLE recurring_invoice_schedules ADD CONSTRAINT recurring_invoice_schedules_currency_fk FOREIGN KEY (currency_code) REFERENCES currencies(code);

-- Category B/C: Moyasar tables — rename currency and halala-named minor-unit columns.
ALTER TABLE moyasar_invoices RENAME COLUMN currency TO currency_code;
ALTER TABLE moyasar_invoices RENAME COLUMN amount_halala TO amount_minor;
ALTER TABLE moyasar_invoices ADD CONSTRAINT moyasar_invoices_currency_fk FOREIGN KEY (currency_code) REFERENCES currencies(code);

ALTER TABLE moyasar_payments RENAME COLUMN currency TO currency_code;
ALTER TABLE moyasar_payments RENAME COLUMN amount_halala TO amount_minor;
ALTER TABLE moyasar_payments RENAME COLUMN fee_halala TO fee_minor;
ALTER TABLE moyasar_payments RENAME COLUMN refunded_halala TO refunded_minor;
ALTER TABLE moyasar_payments RENAME COLUMN captured_halala TO captured_minor;
ALTER TABLE moyasar_payments ADD CONSTRAINT moyasar_payments_currency_fk FOREIGN KEY (currency_code) REFERENCES currencies(code);

-- moyasar_refund_queue has no currency column; add it and rename amount_halala.
ALTER TABLE moyasar_refund_queue ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'SAR';
ALTER TABLE moyasar_refund_queue RENAME COLUMN amount_halala TO amount_minor;
ALTER TABLE moyasar_refund_queue ADD CONSTRAINT moyasar_refund_queue_currency_fk FOREIGN KEY (currency_code) REFERENCES currencies(code);

COMMIT;
