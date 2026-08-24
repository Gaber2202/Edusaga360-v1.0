-- Phase 1 P1-E — seed fee-category tax treatment rules into jurisdiction_tax_rules.
-- rule_type = fee_category_treatment; category = fee category code; notes explain regime.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

INSERT INTO jurisdiction_tax_rules (jurisdiction_code, rule_type, category, rate, effective_from, effective_to, source_url, verified_on, notes)
VALUES
  -- SA: standard 15% pending founder decision #5 for national-student tuition
  ('SA','fee_category_treatment','TUITION',0.15,'2018-01-01','9999-12-31',NULL,NULL,'SA standard VAT; national-student mechanism TBD (founder decision #5)'),
  ('SA','fee_category_treatment','UNIFORM',0.15,'2018-01-01','9999-12-31',NULL,NULL,'SA standard VAT'),
  ('SA','fee_category_treatment','FOOD',0.15,'2018-01-01','9999-12-31',NULL,NULL,'SA standard VAT'),
  ('SA','fee_category_treatment','CANTEEN',0.15,'2018-01-01','9999-12-31',NULL,NULL,'SA standard VAT'),
  ('SA','fee_category_treatment','DEVICES',0.15,'2018-01-01','9999-12-31',NULL,NULL,'SA standard VAT'),
  ('SA','fee_category_treatment','TRANSPORT',0.15,'2018-01-01','9999-12-31',NULL,NULL,'SA standard VAT'),
  -- AE: tuition zero-rated, transport exempt, goods standard 5%
  ('AE','fee_category_treatment','TUITION',0,'2018-01-01','9999-12-31','https://tax.gov.ae','2026-08-06','FTA Education Guide — zero-rated qualifying educational services'),
  ('AE','fee_category_treatment','REGISTRATION',0,'2018-01-01','9999-12-31','https://tax.gov.ae','2026-08-06','Treated with tuition as educational service'),
  ('AE','fee_category_treatment','UNIFORM',0.05,'2018-01-01','9999-12-31','https://tax.gov.ae','2026-08-06','Standard-rated goods'),
  ('AE','fee_category_treatment','FOOD',0.05,'2018-01-01','9999-12-31','https://tax.gov.ae','2026-08-06','Standard-rated'),
  ('AE','fee_category_treatment','CANTEEN',0.05,'2018-01-01','9999-12-31','https://tax.gov.ae','2026-08-06','Standard-rated'),
  ('AE','fee_category_treatment','DEVICES',0.05,'2018-01-01','9999-12-31','https://tax.gov.ae','2026-08-06','Standard-rated'),
  ('AE','fee_category_treatment','TRANSPORT',0,'2018-01-01','9999-12-31','https://tax.gov.ae','2026-08-06','Exempt local passenger transport'),
  -- QA: no VAT regime — out_of_scope explicitly (not silent zero)
  ('QA','fee_category_treatment','TUITION',0,'2018-01-01','9999-12-31',NULL,'2026-08-06','Qatar has no VAT regime; treatment is out_of_scope'),
  ('QA','fee_category_treatment','UNIFORM',0,'2018-01-01','9999-12-31',NULL,'2026-08-06','Qatar has no VAT regime; treatment is out_of_scope'),
  ('QA','fee_category_treatment','FOOD',0,'2018-01-01','9999-12-31',NULL,'2026-08-06','Qatar has no VAT regime; treatment is out_of_scope'),
  ('QA','fee_category_treatment','CANTEEN',0,'2018-01-01','9999-12-31',NULL,'2026-08-06','Qatar has no VAT regime; treatment is out_of_scope'),
  ('QA','fee_category_treatment','DEVICES',0,'2018-01-01','9999-12-31',NULL,'2026-08-06','Qatar has no VAT regime; treatment is out_of_scope'),
  ('QA','fee_category_treatment','TRANSPORT',0,'2018-01-01','9999-12-31',NULL,'2026-08-06','Qatar has no VAT regime; treatment is out_of_scope')
ON CONFLICT (jurisdiction_code, rule_type, COALESCE(category, ''), effective_from, effective_to) DO UPDATE SET
  rate = EXCLUDED.rate,
  notes = EXCLUDED.notes,
  verified_on = EXCLUDED.verified_on,
  source_url = EXCLUDED.source_url;
