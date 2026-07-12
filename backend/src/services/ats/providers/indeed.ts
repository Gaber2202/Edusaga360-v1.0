/**
 * Indeed adapter (Disposition / Apply partner API).
 *
 * Auth is a bearer API token. Candidate access is provisioned per employer, so
 * the school supplies the candidates URL and their employer id; response mapping
 * defaults to the common `{ results: [...] }` envelope.
 */
import { AtsProvider, asArray, getPath, missingFields, str } from '../types.js';

export const indeed: AtsProvider = {
  id: 'indeed',
  label: 'Indeed',
  credentialFields: [
    { key: 'api_token', label: 'API Token', required: true, secret: true },
  ],
  configFields: [
    { key: 'candidates_url', label: 'Candidates API URL', required: true, placeholder: 'https://apis.indeed.com/...' },
    { key: 'employer_id', label: 'Employer ID', required: false },
  ],

  validate(config, credentials) {
    const missing = [
      ...missingFields(this.credentialFields, credentials),
      ...missingFields(this.configFields, config),
    ];
    return missing.length ? `Missing fields: ${missing.join(', ')}` : null;
  },

  buildPlan(config, credentials) {
    return {
      url: String(config.candidates_url),
      headers: { Authorization: `Bearer ${credentials.api_token}` },
      extractList: (json) => {
        const results = getPath(json, 'results');
        return Array.isArray(results) ? results : asArray(getPath(json, 'candidates'));
      },
      mapItem: (it) => ({
        external_id: str(getPath(it, 'id')) ?? str(getPath(it, 'candidateId')) ?? '',
        full_name: str(getPath(it, 'name')) ?? str(getPath(it, 'fullName')) ?? '',
        email: str(getPath(it, 'email')),
        phone: str(getPath(it, 'phone')),
        job_title: str(getPath(it, 'jobTitle')) ?? str(getPath(it, 'job.title')),
        stage: str(getPath(it, 'status')),
        applied_at: str(getPath(it, 'appliedDate')) ?? str(getPath(it, 'appliedAt')),
        raw: it,
      }),
    };
  },
};
