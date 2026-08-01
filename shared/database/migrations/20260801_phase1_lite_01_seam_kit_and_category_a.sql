-- Phase 1-Lite — Seam Kit + Category A (critical-path money tables)
-- Scope: create currencies/jurisdictions/jurisdiction_features, bind tenants/branches,
-- and add currency_code to the YAMEN/collections/finance critical path.
-- Defaults are intentionally retained here; dropping them requires every insert path
-- to provide currency_code explicitly and is handled after code is updated.

BEGIN;

-- ---------- 1. Currency reference ----------
ALTER TABLE currencies
  ADD COLUMN IF NOT EXISTS minor_units smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS symbol_en   text,
  ADD COLUMN IF NOT EXISTS symbol_ar   text;

UPDATE currencies SET symbol_en = symbol WHERE symbol_en IS NULL AND symbol IS NOT NULL;
ALTER TABLE currencies DROP COLUMN IF EXISTS symbol;

ALTER TABLE currencies DROP CONSTRAINT IF EXISTS currencies_code_key;
ALTER TABLE currencies DROP CONSTRAINT IF EXISTS currencies_pkey;
ALTER TABLE currencies DROP COLUMN IF EXISTS id;
ALTER TABLE currencies ADD PRIMARY KEY (code);

DELETE FROM currencies WHERE code = 'SAR';
INSERT INTO currencies (code, name_en, name_ar, minor_units, symbol_en, symbol_ar)
VALUES ('SAR','Saudi Riyal','ريال سعودي',2,'SAR','ر.س')
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  minor_units = EXCLUDED.minor_units,
  symbol_en = EXCLUDED.symbol_en,
  symbol_ar = EXCLUDED.symbol_ar;

-- ---------- 2. Jurisdiction registry (SA only) ----------
CREATE TABLE IF NOT EXISTS jurisdictions (
  code                    text PRIMARY KEY,
  name_en                 text NOT NULL,
  name_ar                 text NOT NULL,
  currency_code           text NOT NULL REFERENCES currencies(code),
  default_locale          text NOT NULL,
  supported_locales       text[] NOT NULL,
  timezone                text NOT NULL,
  weekend_days            smallint[] NOT NULL,
  calendar_systems        text[] NOT NULL,
  fiscal_year_start_month smallint NOT NULL,
  status                  text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','beta','ga','deprecated')),
  created_at              timestamptz NOT NULL DEFAULT now()
);

INSERT INTO jurisdictions (code, name_en, name_ar, currency_code, default_locale, supported_locales, timezone, weekend_days, calendar_systems, fiscal_year_start_month, status)
VALUES ('SA','Saudi Arabia','المملكة العربية السعودية','SAR','ar-SA',ARRAY['ar-SA','en-SA'],'Asia/Riyadh',ARRAY[5,6]::smallint[],ARRAY['gregorian','hijri'],1,'ga')
ON CONFLICT (code) DO NOTHING;

-- ---------- 3. Jurisdiction feature flags ----------
CREATE TABLE IF NOT EXISTS jurisdiction_features (
  jurisdiction_code text NOT NULL REFERENCES jurisdictions(code),
  feature_key       text NOT NULL,
  enabled           boolean NOT NULL DEFAULT false,
  config            jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (jurisdiction_code, feature_key)
);

INSERT INTO jurisdiction_features (jurisdiction_code, feature_key, enabled, config) VALUES
  ('SA','einvoicing',true,'{}'),
  ('SA','wps',true,'{}'),
  ('SA','nationalisation_quota',true,'{}'),
  ('SA','hijri_calendar',true,'{}'),
  ('SA','fee_financing',false,'{}')
ON CONFLICT (jurisdiction_code, feature_key) DO NOTHING;

-- ---------- 4. Tenant / branch jurisdiction binding ----------
-- Note: the application uses `branches` as the campus table; `campuses` does not exist.
ALTER TABLE tenants  ADD COLUMN IF NOT EXISTS jurisdiction_code text REFERENCES jurisdictions(code);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS jurisdiction_code text REFERENCES jurisdictions(code);

UPDATE tenants  SET jurisdiction_code = 'SA' WHERE jurisdiction_code IS NULL;
UPDATE branches SET jurisdiction_code = t.jurisdiction_code
FROM tenants t
WHERE branches.tenant_id = t.id AND branches.jurisdiction_code IS NULL;

ALTER TABLE tenants ALTER COLUMN jurisdiction_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS branches_jurisdiction_code_idx ON branches (jurisdiction_code);

-- ---------- 5. Category A — add currency_code to critical-path tables ----------
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
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT %L;',
      t, 'SAR'
    );
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I;',
      t, t || '_currency_fk'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (currency_code) REFERENCES currencies(code);',
      t, t || '_currency_fk'
    );
  END LOOP;
END $$;

COMMIT;
