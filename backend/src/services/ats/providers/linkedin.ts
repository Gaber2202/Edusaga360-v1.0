/**
 * LinkedIn Talent Solutions adapter (Recruiter System Connect).
 *
 * Auth is an OAuth2 bearer access token. The exact candidate/applicant endpoint
 * is provisioned per partner contract, so the school supplies the full
 * candidates URL alongside their contract id; we default the response mapping to
 * the common `{ elements: [...] }` envelope LinkedIn REST APIs return.
 */
import { AtsProvider, asArray, getPath, missingFields, str } from '../types.js';

export const linkedin: AtsProvider = {
  id: 'linkedin',
  label: 'LinkedIn Talent',
  credentialFields: [
    { key: 'access_token', label: 'OAuth Access Token', required: true, secret: true },
  ],
  configFields: [
    { key: 'candidates_url', label: 'Candidates API URL', required: true, placeholder: 'https://api.linkedin.com/v2/...' },
    { key: 'contract_id', label: 'Contract ID', required: false },
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
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      extractList: (json) => asArray(getPath(json, 'elements')),
      mapItem: (it) => ({
        external_id: str(getPath(it, 'id')) ?? str(getPath(it, 'entityUrn')) ?? '',
        full_name: [str(getPath(it, 'firstName')), str(getPath(it, 'lastName'))]
          .filter(Boolean)
          .join(' ')
          .trim() || (str(getPath(it, 'name')) ?? ''),
        email: str(getPath(it, 'emailAddress')),
        phone: str(getPath(it, 'phoneNumber')),
        job_title: str(getPath(it, 'jobPosting.title')),
        stage: str(getPath(it, 'candidateStatus')),
        applied_at: str(getPath(it, 'appliedAt')),
        raw: it,
      }),
    };
  },
};
