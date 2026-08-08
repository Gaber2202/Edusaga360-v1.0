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

export const PAGE_FEATURE_KEYS = {
  GovernmentRelations: GOVERNMENT_RELATIONS_FEATURES,
  GovIntegrations: GOV_INTEGRATIONS_FEATURES,
  SaudizationTracker: NATIONALISATION_FEATURES,
};
