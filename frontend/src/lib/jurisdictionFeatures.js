/**
 * Backend-driven jurisdiction feature keys that gate Saudi-government UI.
 * These map to rows in the jurisdiction_features table. They are the only
 * source of truth for whether a Saudi page/component is shown; no React code
 * should compare jurisdiction_code to 'SA'.
 */

export const GOVERNMENT_RELATIONS_FEATURES = [
  'gosi',
  'qiwa',
  'muqeem',
  'iqama',
  'visa_services',
  'mudad',
  'sadad',
];

export const GOV_INTEGRATIONS_FEATURES = GOVERNMENT_RELATIONS_FEATURES;

export const SOCIAL_INSURANCE_FEATURES = ['gosi'];
export const NATIONALISATION_FEATURES = ['nationalisation_quota'];
export const HIJRI_CALENDAR_FEATURES = ['hijri_calendar'];
export const EINVOICING_FEATURES = ['einvoicing'];
export const WPS_FEATURES = ['mudad'];
export const LABOR_PORTAL_FEATURES = ['qiwa'];

/**
 * SCRUM-139 — Platform-managed integration catalog keys (Phase 2 registry).
 * Reuses existing gov feature keys (no duplicate country literals) plus
 * neutral integration_* keys for education / identity / AE / QA connectors.
 */
export const PLATFORM_INTEGRATION_FEATURES = [
  ...EINVOICING_FEATURES,
  ...SOCIAL_INSURANCE_FEATURES,
  ...LABOR_PORTAL_FEATURES,
  ...WPS_FEATURES,
  GOVERNMENT_RELATIONS_FEATURES[2], // residency / iqama portal
  'integration_sis',
  'integration_lms',
  'integration_national_sso',
  'integration_gov_gateway',
  'integration_student_health',
  'uae_pass',
  'integration_wage_protection',
  'integration_moe_edu',
  'integration_health_authority',
  'integration_national_admissions',
  'integration_public_health',
  'integration_moe_he',
];

export const PAGE_FEATURE_KEYS = {
  GovernmentRelations: GOVERNMENT_RELATIONS_FEATURES,
  GovIntegrations: GOV_INTEGRATIONS_FEATURES,
  SaudizationTracker: NATIONALISATION_FEATURES,
  VATManagement: EINVOICING_FEATURES,
};
