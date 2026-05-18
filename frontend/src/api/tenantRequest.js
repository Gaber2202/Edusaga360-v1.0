import { callApi } from './supabaseClient';

export async function submitTenantRequest(payload) {
  const data = await callApi('/api/functions/submitTenantRequest', payload);
  if (!data || data.error) {
    throw new Error(data?.error || 'Failed to submit registration request');
  }
  return { request_number: data.request_number, id: data.id };
}

export async function submitClientTenantRequest(payload) {
  const data = await callApi('/api/functions/submitClientTenantRequest', payload);
  if (!data || data.error) {
    throw new Error(data?.error || 'Failed to submit subscription request');
  }
  return { request: data.request, tenant_max_users: data.tenant_max_users };
}
