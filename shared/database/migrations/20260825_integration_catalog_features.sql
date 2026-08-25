-- SCRUM-139: Country-aware platform-managed integration catalog flags.
-- Gates Integrations → Platform-managed items via jurisdiction_features
-- (Phase 2 registry). SA-only connectors stay disabled for AE/QA.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

INSERT INTO jurisdiction_features (jurisdiction_code, feature_key, enabled, config) VALUES
  -- SA education / identity / health catalog (gov flags already seeded in task13a)
  ('SA', 'integration_sis', true, '{}'),
  ('SA', 'integration_lms', true, '{}'),
  ('SA', 'integration_national_sso', true, '{}'),
  ('SA', 'integration_gov_gateway', true, '{}'),
  ('SA', 'integration_student_health', true, '{}'),
  -- AE platform-managed catalog
  ('AE', 'uae_pass', true, '{}'),
  ('AE', 'integration_wage_protection', true, '{}'),
  ('AE', 'integration_moe_edu', true, '{}'),
  ('AE', 'integration_health_authority', true, '{}'),
  -- QA platform-managed catalog
  ('QA', 'integration_national_admissions', true, '{}'),
  ('QA', 'integration_public_health', true, '{}'),
  ('QA', 'integration_moe_he', true, '{}'),
  -- Hide SA education/identity keys on AE/QA
  ('AE', 'integration_sis', false, '{}'),
  ('AE', 'integration_lms', false, '{}'),
  ('AE', 'integration_national_sso', false, '{}'),
  ('AE', 'integration_gov_gateway', false, '{}'),
  ('AE', 'integration_student_health', false, '{}'),
  ('QA', 'integration_sis', false, '{}'),
  ('QA', 'integration_lms', false, '{}'),
  ('QA', 'integration_national_sso', false, '{}'),
  ('QA', 'integration_gov_gateway', false, '{}'),
  ('QA', 'integration_student_health', false, '{}'),
  -- Hide AE/QA keys on other jurisdictions
  ('SA', 'uae_pass', false, '{}'),
  ('SA', 'integration_wage_protection', false, '{}'),
  ('SA', 'integration_moe_edu', false, '{}'),
  ('SA', 'integration_health_authority', false, '{}'),
  ('SA', 'integration_national_admissions', false, '{}'),
  ('SA', 'integration_public_health', false, '{}'),
  ('SA', 'integration_moe_he', false, '{}'),
  ('QA', 'uae_pass', false, '{}'),
  ('QA', 'integration_wage_protection', false, '{}'),
  ('QA', 'integration_moe_edu', false, '{}'),
  ('QA', 'integration_health_authority', false, '{}'),
  ('AE', 'integration_national_admissions', false, '{}'),
  ('AE', 'integration_public_health', false, '{}'),
  ('AE', 'integration_moe_he', false, '{}')
ON CONFLICT (jurisdiction_code, feature_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  config = EXCLUDED.config;

COMMIT;
