-- Category E — General Ledger currency model (ADR-004)
--
-- Rollback:
--   ALTER TABLE journal_entries DROP COLUMN IF EXISTS currency_code;
--   ALTER TABLE journal_entry_lines DROP COLUMN IF EXISTS currency_code;
--   ALTER TABLE journal_entry_lines DROP COLUMN IF EXISTS fx_rate;
--   ALTER TABLE journal_entry_lines DROP COLUMN IF EXISTS fx_rate_date;
--   ALTER TABLE chart_of_accounts DROP COLUMN IF EXISTS currency_code;
--   -- Column comments can be reset with: COMMENT ON COLUMN x IS NULL;

SET lock_timeout = '5s';
SET statement_timeout = '120s';

BEGIN;

-- journal_entries
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'SAR';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'journal_entries_currency_fk' AND conrelid = 'journal_entries'::regclass
  ) THEN
    ALTER TABLE journal_entries
      ADD CONSTRAINT journal_entries_currency_fk
      FOREIGN KEY (currency_code) REFERENCES currencies(code);
  END IF;
END $$;

COMMENT ON COLUMN journal_entries.total_debit IS
  'Functional-currency amount. Currency given by currency_code on this table. See ADR-004.';
COMMENT ON COLUMN journal_entries.total_credit IS
  'Functional-currency amount. Currency given by currency_code on this table. See ADR-004.';

-- journal_entry_lines
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS fx_rate numeric(18,8) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS fx_rate_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'journal_entry_lines_currency_fk' AND conrelid = 'journal_entry_lines'::regclass
  ) THEN
    ALTER TABLE journal_entry_lines
      ADD CONSTRAINT journal_entry_lines_currency_fk
      FOREIGN KEY (currency_code) REFERENCES currencies(code);
  END IF;
END $$;

COMMENT ON COLUMN journal_entry_lines.debit IS
  'Functional-currency amount. Currency given by currency_code on this table. See ADR-004.';
COMMENT ON COLUMN journal_entry_lines.credit IS
  'Functional-currency amount. Currency given by currency_code on this table. See ADR-004.';

-- chart_of_accounts
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'SAR';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chart_of_accounts_currency_fk' AND conrelid = 'chart_of_accounts'::regclass
  ) THEN
    ALTER TABLE chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_currency_fk
      FOREIGN KEY (currency_code) REFERENCES currencies(code);
  END IF;
END $$;

COMMENT ON COLUMN chart_of_accounts.balance IS
  'Functional-currency amount. Currency given by currency_code on this table. See ADR-004.';

COMMIT;
