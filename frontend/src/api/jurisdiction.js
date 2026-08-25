import { callApi } from './supabaseClient';

let cachedPromise = null;
let cachedKey = null;

export function clearJurisdictionContext() {
  cachedPromise = null;
  cachedKey = null;
}

/**
 * Load the resolved jurisdiction context for the current tenant from the backend.
 *
 * The result is cached per tenant/branch so JurisdictionFeatureProvider and
 * TenantContext can both call this without duplicating requests.
 */
export function getJurisdictionContext(tenantId, branchId) {
  const key = `${tenantId || ''}:${branchId || ''}`;
  if (cachedPromise && cachedKey === key) return cachedPromise;

  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  cachedKey = key;
  cachedPromise = callApi(`/api/jurisdiction/context${query}`, null, { method: 'GET' }).catch((err) => {
    clearJurisdictionContext();
    throw err;
  });

  return cachedPromise;
}

/**
 * Load the pack vaccination schedule for the current tenant (SCRUM-137).
 * Not cached with context — clinic page fetches on demand.
 */
export function getVaccinationSchedule(branchId) {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  return callApi(`/api/jurisdiction/vaccination-schedule${query}`, null, { method: 'GET' });
}
