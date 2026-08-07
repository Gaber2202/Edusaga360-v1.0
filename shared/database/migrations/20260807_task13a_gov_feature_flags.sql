-- Task 13a — feature flags for Saudi government services/pages.
-- These gate the Saudi-only UI pages (GovernmentRelations, GovIntegrations,
-- GOSI, Qiwa, Muqeem, Iqama, Visa, Mudad, SADAD) so non-SA tenants never see
-- them. The flags are read from backend (jurisdiction_features) by the frontend.
--
-- Rollback: DELETE FROM jurisdiction_features WHERE feature_key IN
-- ('gosi','qiwa','muqeem','iqama','visa_services','mudad','sadad');

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

INSERT INTO jurisdiction_features (jurisdiction_code, feature_key, enabled, config) VALUES
  -- Saudi Arabia: government services are live
  ('SA', 'gosi', true, '{}'),
  ('SA', 'qiwa', true, '{}'),
  ('SA', 'muqeem', true, '{}'),
  ('SA', 'iqama', true, '{}'),
  ('SA', 'visa_services', true, '{}'),
  ('SA', 'mudad', true, '{}'),
  ('SA', 'sadad', true, '{}'),
  -- UAE / Qatar: stubs, disabled
  ('AE', 'gosi', false, '{}'),
  ('AE', 'qiwa', false, '{}'),
  ('AE', 'muqeem', false, '{}'),
  ('AE', 'iqama', false, '{}'),
  ('AE', 'visa_services', false, '{}'),
  ('AE', 'mudad', false, '{}'),
  ('AE', 'sadad', false, '{}'),
  ('QA', 'gosi', false, '{}'),
  ('QA', 'qiwa', false, '{}'),
  ('QA', 'muqeem', false, '{}'),
  ('QA', 'iqama', false, '{}'),
  ('QA', 'visa_services', false, '{}'),
  ('QA', 'mudad', false, '{}'),
  ('QA', 'sadad', false, '{}')
ON CONFLICT (jurisdiction_code, feature_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  config = EXCLUDED.config;

COMMIT;
