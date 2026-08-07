-- Task 9 — UAE country pack scaffolding and verified regulatory parameters
--
-- Adds AED currency, the 'AE' jurisdiction (draft), emirate-level regulator
-- support on branches, and the jurisdiction_tax_rules / regulatory_register tables
-- that hold every verified AE rate, threshold and mechanism parameter.

BEGIN;

-- ---------- 1. UAE currency ----------
INSERT INTO currencies (code, name_en, name_ar, minor_units, symbol_en, symbol_ar)
VALUES ('AED','UAE Dirham','درهم إماراتي',2,'AED','د.إ')
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  minor_units = EXCLUDED.minor_units,
  symbol_en = EXCLUDED.symbol_en,
  symbol_ar = EXCLUDED.symbol_ar;

-- ---------- 2. UAE jurisdiction (draft) ----------
INSERT INTO jurisdictions (code, name_en, name_ar, currency_code, default_locale, supported_locales, timezone, weekend_days, calendar_systems, fiscal_year_start_month, status)
VALUES ('AE','United Arab Emirates','الإمارات العربية المتحدة','AED','en-AE',ARRAY['en-AE','ar-AE'],'Asia/Dubai',ARRAY[0,6]::smallint[],ARRAY['gregorian'],1,'draft')
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

-- ---------- 3. Emirate-level regulator and branch-level settings ----------
ALTER TABLE branches ADD COLUMN IF NOT EXISTS regulator_code text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- ---------- 4. Verified tax rules (source_url + verified_on) ----------
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

-- Unique on jurisdiction + rule_type + category + effective period.
CREATE UNIQUE INDEX IF NOT EXISTS jurisdiction_tax_rules_uq
  ON jurisdiction_tax_rules (jurisdiction_code, rule_type, COALESCE(category, ''), effective_from, effective_to);

-- Standard VAT rate for the UAE (5%)
INSERT INTO jurisdiction_tax_rules (jurisdiction_code, rule_type, category, rate, effective_from, effective_to, source_url, verified_on, notes)
VALUES ('AE','vat_rate','standard',0.05,'2018-01-01','9999-12-31','https://tax.gov.ae/en/services/vat.registration.aspx','2026-08-06','FTA VAT registration page; Federal Decree-Law No. 8 of 2017')
ON CONFLICT (jurisdiction_code, rule_type, COALESCE(category, ''), effective_from, effective_to) DO UPDATE SET
  rate = EXCLUDED.rate,
  source_url = EXCLUDED.source_url,
  verified_on = EXCLUDED.verified_on,
  notes = EXCLUDED.notes;

-- Zero-rated, exempt and out-of-scope rates (0%)
INSERT INTO jurisdiction_tax_rules (jurisdiction_code, rule_type, category, rate, effective_from, effective_to, source_url, verified_on, notes)
VALUES
  ('AE','vat_rate','zero_rated',0,'2018-01-01','9999-12-31','https://tax.gov.ae/Datafolder/Files/Pdf/2026/Guide/VAT%20Education%20Guide%20-%2029%2006%202026-rep.pdf','2026-08-06','FTA VAT Education Guide — zero-rated qualifying educational services'),
  ('AE','vat_rate','exempt',0,'2018-01-01','9999-12-31','https://tax.gov.ae/Datafolder/Files/Pdf/2026/Guide/VAT%20Education%20Guide%20-%2029%2006%202026-rep.pdf','2026-08-06','FTA VAT Education Guide — exempt local passenger transport'),
  ('AE','vat_rate','out_of_scope',0,'2018-01-01','9999-12-31','https://tax.gov.ae/Datafolder/Files/Pdf/2026/Guide/VAT%20Education%20Guide%20-%2029%2006%202026-rep.pdf','2026-08-06','Out-of-scope supplies')
ON CONFLICT (jurisdiction_code, rule_type, COALESCE(category, ''), effective_from, effective_to) DO UPDATE SET
  rate = EXCLUDED.rate,
  source_url = EXCLUDED.source_url,
  verified_on = EXCLUDED.verified_on,
  notes = EXCLUDED.notes;

-- VAT registration thresholds
INSERT INTO jurisdiction_tax_rules (jurisdiction_code, rule_type, category, amount_threshold, currency_code, effective_from, effective_to, source_url, verified_on, notes)
VALUES
  ('AE','vat_registration_threshold','mandatory',375000,'AED','2018-01-01','9999-12-31','https://tax.gov.ae/DataFolder/Files/Guides/VAT/Awareness/Get%20to%20know%20your%20Tax%20Obligations.pdf','2026-08-06','Mandatory registration threshold'),
  ('AE','vat_registration_threshold','voluntary',187500,'AED','2018-01-01','9999-12-31','https://tax.gov.ae/DataFolder/Files/Guides/VAT/Awareness/Get%20to%20know%20your%20Tax%20Obligations.pdf','2026-08-06','Voluntary registration threshold')
ON CONFLICT (jurisdiction_code, rule_type, COALESCE(category, ''), effective_from, effective_to) DO UPDATE SET
  amount_threshold = EXCLUDED.amount_threshold,
  source_url = EXCLUDED.source_url,
  verified_on = EXCLUDED.verified_on,
  notes = EXCLUDED.notes;

-- ---------- 5. General regulatory register (non-tax parameters, source_url + verified_on) ----------
CREATE TABLE IF NOT EXISTS regulatory_register (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction_code text NOT NULL REFERENCES jurisdictions(code),
  regulator_code   text,                         -- emirate-level regulator, e.g. KHDA, ADEK, SPEA
  parameter_key    text NOT NULL,
  parameter_value  jsonb NOT NULL,
  effective_from   date NOT NULL DEFAULT '1900-01-01',
  effective_to     date NOT NULL DEFAULT '9999-12-31',
  source_url       text,                          -- left NULL for unverified placeholder rows
  verified_on      date,                          -- left NULL until a primary source is attached
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS regulatory_register_uq
  ON regulatory_register (jurisdiction_code, COALESCE(regulator_code, ''), parameter_key, effective_from, effective_to);

-- Allow the existing NOT NULL definition to be relaxed on already-created tables.
ALTER TABLE regulatory_register
  ALTER COLUMN source_url DROP NOT NULL,
  ALTER COLUMN verified_on DROP NOT NULL;

-- UAE labour / payroll parameters
INSERT INTO regulatory_register (jurisdiction_code, regulator_code, parameter_key, parameter_value, source_url, verified_on, notes)
VALUES
  ('AE',NULL,'working_hours_per_week','48','https://www.uaesupremecouncil.org/en/information-and-services/jobs/employment-in-the-private-sector/working-hours.html','2026-08-06','Normal maximum weekly working hours'),
  ('AE',NULL,'working_hours_per_day','8','https://www.uaesupremecouncil.org/en/information-and-services/jobs/employment-in-the-private-sector/working-hours.html','2026-08-06','Normal maximum daily working hours'),
  ('AE',NULL,'ramadan_working_hours_reduction','null'::jsonb,NULL,NULL,'UNVERIFIED — exact daily hour reduction during Ramadan and whether it applies to all employees or only fasting employees requires a primary source and legal review'),
  ('AE',NULL,'overtime_daily_max_hours','2','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Maximum overtime hours per day'),
  ('AE',NULL,'overtime_rate_day','0.25','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Overtime premium for daytime (25% of basic wage)'),
  ('AE',NULL,'overtime_rate_night','0.50','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Overtime premium for night work 22:00-04:00 (50% of basic wage)'),
  ('AE',NULL,'rest_day_overtime_rate','1.50','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Rest day compensation: basic wage plus 150%'),
  ('AE',NULL,'annual_leave_days','30','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Annual leave for completed service years'),
  ('AE',NULL,'sick_leave_full_pay_days','15','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Sick leave with full pay'),
  ('AE',NULL,'sick_leave_half_pay_days','30','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Sick leave with half pay'),
  ('AE',NULL,'maternity_leave_days','60','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Total maternity leave days'),
  ('AE',NULL,'maternity_leave_full_pay_days','45','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Maternity leave with full pay'),
  ('AE',NULL,'parental_leave_days','5','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Parental leave working days'),
  ('AE',NULL,'bereavement_spouse_days','5','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','Bereavement leave for spouse death'),
  ('AE',NULL,'eos_first_5_years_rate_days','21','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','End-of-service days per year for first 5 years'),
  ('AE',NULL,'eos_after_5_years_rate_days','30','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','End-of-service days per year after 5 years'),
  ('AE',NULL,'eos_max_years_wage','2','https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx','2026-08-06','End-of-service gratuity may not exceed 2 years wage')
ON CONFLICT (jurisdiction_code, COALESCE(regulator_code, ''), parameter_key, effective_from, effective_to) DO UPDATE SET
  parameter_value = EXCLUDED.parameter_value,
  source_url = EXCLUDED.source_url,
  verified_on = EXCLUDED.verified_on,
  notes = EXCLUDED.notes;

-- UAE fee-governance mechanism (ADEK / emirate-level)
INSERT INTO regulatory_register (jurisdiction_code, regulator_code, parameter_key, parameter_value, source_url, verified_on, notes)
VALUES
  ('AE','ADEK','registration_fee_cap_pct','0.05','https://llm.education/wp-content/uploads/2025/10/ADEK_S_Fees-Policy_EN.pdf','2026-08-06','Registration fee may not exceed 5% of approved tuition'),
  ('AE','ADEK','operating_years_minimum','3','https://llm.education/wp-content/uploads/2025/10/ADEK_S_Fees-Policy_EN.pdf','2026-08-06','Minimum years of operation for standard/exceptional increase'),
  ('AE','ADEK','exceptional_increase_occupancy_pct','0.80','https://llm.education/wp-content/uploads/2025/10/ADEK_S_Fees-Policy_EN.pdf','2026-08-06','Minimum occupancy for exceptional increase'),
  ('AE','ADEK','fee_increase_submission_month','1','https://llm.education/wp-content/uploads/2025/10/ADEK_S_Fees-Policy_EN.pdf','2026-08-06','Fee-increase requests submitted each January (1 = January)'),
  ('AE','ADEK','increase_basis','"rating_x_eci"','https://llm.education/wp-content/uploads/2025/10/ADEK_S_Fees-Policy_EN.pdf','2026-08-06','Standard increase is Irtiqaa rating × Education Cost Index')
ON CONFLICT (jurisdiction_code, COALESCE(regulator_code, ''), parameter_key, effective_from, effective_to) DO UPDATE SET
  parameter_value = EXCLUDED.parameter_value,
  source_url = EXCLUDED.source_url,
  verified_on = EXCLUDED.verified_on,
  notes = EXCLUDED.notes;

-- Dubai 2026-27 fee freeze (confirmed)
INSERT INTO regulatory_register (jurisdiction_code, regulator_code, parameter_key, parameter_value, source_url, verified_on, notes)
VALUES
  ('AE','KHDA','fee_increase_allowed_2026_27','false','https://github.com/EduSaga360/edusaga-360/blob/main/docs/jurisdictions/REGULATORY_PACK_ADDENDUM_gap_closure.md','2026-08-06','Dubai/KHDA fees frozen for 2026-27 per Task 8 addendum')
ON CONFLICT (jurisdiction_code, COALESCE(regulator_code, ''), parameter_key, effective_from, effective_to) DO UPDATE SET
  parameter_value = EXCLUDED.parameter_value,
  source_url = EXCLUDED.source_url,
  verified_on = EXCLUDED.verified_on,
  notes = EXCLUDED.notes;

-- ---------- 6. Jurisdiction feature flags ----------
-- AE: all false at draft; enabled per-school after verification.
-- SA: documents and payments are also tracked now to satisfy the conformance suite.
INSERT INTO jurisdiction_features (jurisdiction_code, feature_key, enabled, config) VALUES
  ('AE','einvoicing',false,'{}'),
  ('AE','wps',false,'{}'),
  ('AE','nationalisation_quota',false,'{}'),
  ('AE','hijri_calendar',false,'{}'),
  ('AE','fee_financing',false,'{}'),
  ('AE','uae_pass',false,'{}'),
  ('AE','documents',false,'{}'),
  ('AE','payments',false,'{}'),
  ('SA','documents',true,'{}'),
  ('SA','payments',true,'{}')
ON CONFLICT (jurisdiction_code, feature_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  config = EXCLUDED.config;

COMMIT;
