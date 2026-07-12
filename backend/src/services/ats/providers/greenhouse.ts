/**
 * Greenhouse (Harvest API) adapter.
 * Auth: HTTP Basic with the Harvest API key as the username and an empty
 * password. Docs: https://developers.greenhouse.io/harvest.html
 */
import { AtsProvider, asArray, basicAuth, getPath, missingFields, str } from '../types.js';

export const greenhouse: AtsProvider = {
  id: 'greenhouse',
  label: 'Greenhouse',
  credentialFields: [
    { key: 'api_key', label: 'Harvest API Key', required: true, secret: true },
  ],
  configFields: [],

  validate(_config, credentials) {
    const missing = missingFields(this.credentialFields, credentials);
    return missing.length ? `Missing credentials: ${missing.join(', ')}` : null;
  },

  buildPlan(_config, credentials) {
    return {
      url: 'https://harvest.greenhouse.io/v1/candidates?per_page=100',
      headers: { Authorization: basicAuth(credentials.api_key, '') },
      extractList: (json) => asArray(json),
      mapItem: (it) => ({
        external_id: str(getPath(it, 'id')) ?? '',
        full_name: [str(getPath(it, 'first_name')), str(getPath(it, 'last_name'))]
          .filter(Boolean)
          .join(' ')
          .trim(),
        email: str(getPath(it, 'email_addresses.0.value')),
        phone: str(getPath(it, 'phone_numbers.0.value')),
        job_title: str(getPath(it, 'applications.0.jobs.0.name')),
        stage: str(getPath(it, 'applications.0.status')),
        applied_at: str(getPath(it, 'applications.0.applied_at')),
        raw: it,
      }),
    };
  },
};
