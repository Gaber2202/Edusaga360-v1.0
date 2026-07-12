/**
 * Custom / generic ATS adapter — the escape hatch.
 *
 * Lets a school connect an ATS we don't have a first-class adapter for, with no
 * code change: they describe the endpoint and how to read the response entirely
 * through config.
 *
 * config:
 *   base_url      (required)  Full URL of the candidates endpoint.
 *   list_path     (optional)  Dotted path to the array in the response
 *                             (e.g. "data.items"). Empty ⇒ the response is the array.
 *   auth_scheme   (optional)  "Bearer" (default), "Basic", or "None".
 *   auth_header   (optional)  Header name for the token (default "Authorization").
 *   field_map     (required)  Map of normalized field → dotted source path. Must
 *                             include external_id and full_name; email, phone,
 *                             job_title, stage, applied_at are optional.
 * credentials:
 *   token         (required unless auth_scheme=None)  Secret placed in the header.
 */
import { AtsProvider, asArray, getPath, str } from '../types.js';

function fieldMapOf(config: Record<string, unknown>): Record<string, string> {
  const fm = config.field_map;
  return fm && typeof fm === 'object' ? (fm as Record<string, string>) : {};
}

export const custom: AtsProvider = {
  id: 'custom',
  label: 'Custom ATS',
  credentialFields: [
    { key: 'token', label: 'API Token / Secret', required: false, secret: true },
  ],
  configFields: [
    { key: 'base_url', label: 'Candidates Endpoint URL', required: true },
    { key: 'list_path', label: 'Path to candidate array (e.g. data.items)', required: false },
    { key: 'auth_scheme', label: 'Auth scheme: Bearer | Basic | None', required: false },
    { key: 'auth_header', label: 'Auth header name (default Authorization)', required: false },
    { key: 'field_map', label: 'Field mapping (JSON)', required: true },
  ],

  validate(config, credentials) {
    if (!config.base_url) return 'Missing config: base_url';
    const fm = fieldMapOf(config);
    const missingMap = ['external_id', 'full_name'].filter((k) => !fm[k]);
    if (missingMap.length) return `field_map must include: ${missingMap.join(', ')}`;
    const scheme = String(config.auth_scheme ?? 'Bearer').toLowerCase();
    if (scheme !== 'none' && !credentials.token) return 'Missing credentials: token';
    return null;
  },

  buildPlan(config, credentials) {
    const fm = fieldMapOf(config);
    const listPath = str(config.list_path);
    const scheme = String(config.auth_scheme ?? 'Bearer');
    const headerName = str(config.auth_header) ?? 'Authorization';

    const headers: Record<string, string> = {};
    if (scheme.toLowerCase() !== 'none' && credentials.token) {
      headers[headerName] = scheme.toLowerCase() === 'basic'
        ? `Basic ${Buffer.from(credentials.token).toString('base64')}`
        : `${scheme} ${credentials.token}`;
    }

    const pick = (item: unknown, key: string): string | undefined =>
      fm[key] ? str(getPath(item, fm[key])) : undefined;

    return {
      url: String(config.base_url),
      headers,
      extractList: (json) => (listPath ? asArray(getPath(json, listPath)) : asArray(json)),
      mapItem: (it) => ({
        external_id: pick(it, 'external_id') ?? '',
        full_name: pick(it, 'full_name') ?? '',
        email: pick(it, 'email'),
        phone: pick(it, 'phone'),
        job_title: pick(it, 'job_title'),
        stage: pick(it, 'stage'),
        applied_at: pick(it, 'applied_at'),
        raw: it,
      }),
    };
  },
};
