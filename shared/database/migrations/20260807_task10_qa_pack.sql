-- Task 10 — Qatar country pack scaffolding and verified regulatory parameters
--
-- Adds QAR currency, the 'QA' jurisdiction (draft), and the jurisdiction_tax_rules /
-- regulatory_register rows that drive the zero-VAT tax service and Labour Law
-- payroll calculations.

BEGIN;

-- ---------- 1. Qatar currency ----------
INSERT INTO currencies (code, name_en, name_ar, minor_units, symbol_en, symbol_ar)
VALUES ('QAR','Qatari Riyal','ريال قطري',2,'QAR','ر.ق')
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  minor_units = EXCLUDED.minor_units,
  symbol_en = EXCLUDED.symbol_en,
  symbol_ar = EXCLUDED.symbol_ar;

-- ---------- 2. Qatar jurisdiction (draft) ----------
INSERT INTO jurisdictions (code, name_en, name_ar, currency_code, default_locale, supported_locales, timezone, weekend_days, calendar_systems, fiscal_year_start_month, status)
VALUES ('QA','Qatar','دولة قطر','QAR','ar-QA',ARRAY['ar-QA','en-QA'],'Asia/Qatar',ARRAY[5,6]::smallint[],ARRAY['gregorian'],9,'draft')
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  currency_code = EXCLUDED.currency_code,
  default_locale = EXCLUDED.default_locale,
  supported_locales = EXCLUDED.supported_locales,
  timezone = EXCLUDED.timezone,
  weekend_days = EXCLUDED.weekend_days,
  calendar_systems = EXCLUDED.calendar_systems,
  fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
  status = EXCLUDED.status;

-- ---------- 3. Qatar tax rules (zero VAT) ----------
CREATE TABLE IF NOT EXISTS jurisdiction_tax_rules (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction_code text NOT NULL REFERENCES jurisdictions(code),
  rule_type        text NOT NULL,
  category         text,
  rate             numeric,
  amount_threshold numeric,
  currency_code    text REFERENCES currencies(code),
  effective_from   date NOT NULL DEFAULT '1900-01-01',
  effective_to     date NOT NULL DEFAULT '9999-12-31',
  source_url       text NOT NULL,
  verified_on      date NOT NULL,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jurisdiction_tax_rules_uq
  ON jurisdiction_tax_rules (jurisdiction_code, rule_type, COALESCE(category, ''), effective_from, effective_to);

-- Qatar has not implemented VAT. All categories are zero-rate / out of scope.
INSERT INTO jurisdiction_tax_rules (jurisdiction_code, rule_type, category, rate, effective_from, effective_to, source_url, verified_on, notes)
VALUES
  ('QA','vat_rate','standard',0,'1900-01-01','9999-12-31','https://www.gta.gov.qa/en/investors-guide','2026-08-06','General Tax Authority — Qatar has not implemented VAT'),
  ('QA','vat_rate','zero_rated',0,'1900-01-01','9999-12-31','https://www.gta.gov.qa/en/investors-guide','2026-08-06','Zero-rated placeholder — no VAT regime in force'),
  ('QA','vat_rate','exempt',0,'1900-01-01','9999-12-31','https://www.gta.gov.qa/en/investors-guide','2026-08-06','Exempt placeholder — no VAT regime in force'),
  ('QA','vat_rate','out_of_scope',0,'1900-01-01','9999-12-31','https://www.gta.gov.qa/en/investors-guide','2026-08-06','Out-of-scope placeholder — no VAT regime in force')
ON CONFLICT (jurisdiction_code, rule_type, COALESCE(category, ''), effective_from, effective_to) DO UPDATE SET
  rate = EXCLUDED.rate,
  source_url = EXCLUDED.source_url,
  verified_on = EXCLUDED.verified_on,
  notes = EXCLUDED.notes;

-- ---------- 4. Qatar regulatory register ----------
CREATE TABLE IF NOT EXISTS regulatory_register (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction_code text NOT NULL REFERENCES jurisdictions(code),
  regulator_code   text,
  parameter_key    text NOT NULL,
  parameter_value  jsonb NOT NULL,
  effective_from   date NOT NULL DEFAULT '1900-01-01',
  effective_to     date NOT NULL DEFAULT '9999-12-31',
  source_url       text,
  verified_on      date,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS regulatory_register_uq
  ON regulatory_register (jurisdiction_code, COALESCE(regulator_code, ''), parameter_key, effective_from, effective_to);

ALTER TABLE regulatory_register
  ALTER COLUMN source_url DROP NOT NULL,
  ALTER COLUMN verified_on DROP NOT NULL;

-- Labour Law parameters per Law No. 14 of 2004
INSERT INTO regulatory_register (jurisdiction_code, regulator_code, parameter_key, parameter_value, source_url, verified_on, notes)
VALUES
  ('QA',NULL,'working_hours_per_week','48','https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf','2026-08-06','Normal maximum weekly working hours'),
  ('QA',NULL,'working_hours_per_day','8','https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf','2026-08-06','Normal maximum daily working hours'),
  ('QA',NULL,'ramadan_working_hours_reduction','2','https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf','2026-08-06','Ramadan working hours are 6 per day, a 2-hour reduction from 8'),
  ('QA',NULL,'overtime_rate_day','0.25','https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf','2026-08-06','Overtime premium for daytime additional hours (basic + 25%)'),
  ('QA',NULL,'overtime_rate_night','0.50','https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf','2026-08-06','Overtime premium for night work 21:00-06:00 (basic + 50%)'),
  ('QA',NULL,'rest_day_overtime_rate','1.50','https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf','2026-08-06','Rest day compensation: basic wage plus 150% plus another rest day'),
  ('QA',NULL,'annual_leave_less_than_5_years','21','https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf','2026-08-06','Annual leave for employment of less than 5 years (not less than 3 weeks)'),
  ('QA',NULL,'annual_leave_5_or_more_years','28','https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf','2026-08-06','Annual leave for employment of 5 years or more (not less than 4 weeks)'),
  ('QA',NULL,'eos_days_per_year','21','https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf','2026-08-06','End-of-service gratuity: not less than 3 weeks per year'),
  ('QA',NULL,'notice_period_months','18','https://thepeninsulaqatar.com/article/11/06/2026/qatar-launches-school-fees-policy-2026-mandates-18-month-notice-period-before-fee-hike','2026-08-06','School Fees Policy 2026: 18-month notice period before any approved tuition increase'),
  ('QA',NULL,'max_increase_pct','null'::jsonb,NULL,NULL,'UNVERIFIED — MOEHE fee-increase numeric cap is not published in retrievable sources'),
  ('QA',NULL,'operating_years_minimum','null'::jsonb,NULL,NULL,'UNVERIFIED — MOEHE operating-years minimum is not published in retrievable sources')
ON CONFLICT (jurisdiction_code, COALESCE(regulator_code, ''), parameter_key, effective_from, effective_to) DO UPDATE SET
  parameter_value = EXCLUDED.parameter_value,
  source_url = EXCLUDED.source_url,
  verified_on = EXCLUDED.verified_on,
  notes = EXCLUDED.notes;

-- ---------- 5. Jurisdiction feature flags ----------
-- QA: tax, payroll EOS/leave/overtime, calendar, localisation, identity, fee governance live.
-- E-invoicing, documents, payments, WPS SIF, Qatarisation quota and Hijri calendar are stubs.
INSERT INTO jurisdiction_features (jurisdiction_code, feature_key, enabled, config) VALUES
  ('QA','einvoicing',false,'{}'),
  ('QA','wps',false,'{}'),
  ('QA','nationalisation_quota',false,'{}'),
  ('QA','hijri_calendar',false,'{}'),
  ('QA','documents',false,'{}'),
  ('QA','payments',false,'{}'),
  ('QA','fee_financing',false,'{}'),
  ('QA','uae_pass',false,'{}')
ON CONFLICT (jurisdiction_code, feature_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  config = EXCLUDED.config;

COMMIT;
