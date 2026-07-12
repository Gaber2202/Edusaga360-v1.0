/**
 * Workday adapter (Report-as-a-Service).
 *
 * Workday recruiting data is most portably exposed as a custom RaaS report that
 * returns JSON. The school supplies the report URL and a basic-auth ISU
 * username/password. Response shape: { "Report_Entry": [ ... ] }. Because report
 * column names are tenant-defined, we read several common aliases per field.
 */
import { AtsProvider, basicAuth, getPath, missingFields, str } from '../types.js';

function firstOf(item: unknown, paths: string[]): string | undefined {
  for (const p of paths) {
    const v = str(getPath(item, p));
    if (v) return v;
  }
  return undefined;
}

export const workday: AtsProvider = {
  id: 'workday',
  label: 'Workday',
  credentialFields: [
    { key: 'username', label: 'Integration System User', required: true, secret: true },
    { key: 'password', label: 'Password', required: true, secret: true },
  ],
  configFields: [
    { key: 'report_url', label: 'RaaS Report URL (JSON format)', required: true, placeholder: 'https://<host>/ccx/service/customreport2/<tenant>/<user>/<report>' },
  ],

  validate(config, credentials) {
    const missing = [
      ...missingFields(this.credentialFields, credentials),
      ...missingFields(this.configFields, config),
    ];
    return missing.length ? `Missing fields: ${missing.join(', ')}` : null;
  },

  buildPlan(config, credentials) {
    const base = String(config.report_url);
    const url = base.includes('format=') ? base : `${base}${base.includes('?') ? '&' : '?'}format=json`;
    return {
      url,
      headers: { Authorization: basicAuth(credentials.username, credentials.password) },
      extractList: (json) => {
        const entries = getPath(json, 'Report_Entry');
        return Array.isArray(entries) ? entries : [];
      },
      mapItem: (it) => ({
        external_id: firstOf(it, ['candidateId', 'Candidate_ID', 'id']) ?? '',
        full_name: firstOf(it, ['candidateName', 'Candidate_Name', 'fullName', 'Full_Name']) ?? '',
        email: firstOf(it, ['email', 'Email', 'primaryEmail']),
        phone: firstOf(it, ['phone', 'Phone', 'primaryPhone']),
        job_title: firstOf(it, ['jobTitle', 'Job_Requisition', 'Job_Title']),
        stage: firstOf(it, ['stage', 'Stage', 'candidateStage']),
        applied_at: firstOf(it, ['appliedDate', 'Applied_Date', 'applicationDate']),
        raw: it,
      }),
    };
  },
};
