/**
 * Scope registry for the external integration API (`/api/v1`).
 *
 * Scopes are the unit of authorization for API keys. A key is granted an
 * explicit allow-list of these strings; every external endpoint declares the
 * single scope it needs via `requireScope(...)`. Add a scope here first, then
 * gate the endpoint — nothing outside this list can be granted.
 *
 * Naming: `<resource>:<action>` where action is `read` or `write`. Keep this in
 * sync with the endpoints in routes/external/v1.ts and the docs in
 * docs/api/EXTERNAL_API.md.
 */
export const API_SCOPES = [
  'students:read',
  'students:write',
  'staff:read',
  'invoices:read',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Type guard — true when an arbitrary string is a scope we recognise. */
export function isValidScope(scope: string): scope is ApiScope {
  return (API_SCOPES as readonly string[]).includes(scope);
}
